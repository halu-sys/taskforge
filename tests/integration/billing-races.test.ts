import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { checkout } from "@/server/services/checkout";
import { renewSubscription } from "@/server/services/subscriptions";
import { createInvitation } from "@/server/services/invitations";
import { PlanLimitError, ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, owner: string, outsider: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: { in: ["race-test", "race-test-2"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["ro@race.test", "rx@race.test"] } } });
  owner = (await prisma.user.create({ data: { email: "ro@race.test", name: "ro", passwordHash: "x" } })).id;
  outsider = (await prisma.user.create({ data: { email: "rx@race.test", name: "rx", passwordHash: "x" } })).id;
  const org = await prisma.organization.create({
    data: { name: "Race", slug: "race-test", memberships: { create: { userId: owner, role: "OWNER" } } },
  });
  orgId = org.id;
});

describe("billing races + isolation", () => {
  it("outsider cannot trigger renewal on another org", async () => {
    await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
    await prisma.subscription.update({ where: { orgId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await expect(renewSubscription(orgId, outsider, new FakeProvider())).rejects.toBeInstanceOf(ForbiddenError);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.status).toBe("ACTIVE"); // untouched
  });

  it("concurrent checkouts: exactly one charge", async () => {
    const org2 = await prisma.organization.create({
      data: { name: "Race2", slug: "race-test-2", memberships: { create: { userId: owner, role: "OWNER" } } },
    });
    const results = await Promise.allSettled([
      checkout(org2.id, owner, "pro", "4242424242424242", new FakeProvider()),
      checkout(org2.id, owner, "pro", "4242424242424242", new FakeProvider()),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBe(1);
    expect(await prisma.invoice.count({ where: { orgId: org2.id } })).toBe(1);
  });

  it("concurrent renewals: one charge, one strike", async () => {
    await prisma.subscription.update({
      where: { orgId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000), status: "ACTIVE", dunningFailures: 0, paymentToken: "4000000000000002" },
    });
    const res = await Promise.all([
      renewSubscription(orgId, null, new FakeProvider()),
      renewSubscription(orgId, null, new FakeProvider()),
    ]);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.dunningFailures).toBe(1); // exactly one strike, not two
    const uncollected = await prisma.invoice.count({ where: { orgId, status: "UNCOLLECTED" } });
    expect(uncollected).toBe(1);
    expect(res.map((r) => r.outcome).filter((o) => o === "failed").length).toBe(1);
  });

  it("paid seats cap members below plan.maxMembers", async () => {
    // org on pro (maxMembers 25) but 1 paid seat, 1 member -> invite blocked
    await prisma.subscription.update({ where: { orgId }, data: { seats: 1, status: "ACTIVE" } });
    await expect(createInvitation(orgId, owner, "z1@race.test", "MEMBER")).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("downgrade schedules at period end, no immediate charge", async () => {
    await prisma.subscription.update({
      where: { orgId },
      data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400_000 * 10) },
    });
    const biz = await prisma.plan.findUniqueOrThrow({ where: { slug: "business" } });
    await prisma.subscription.update({ where: { orgId }, data: { planId: biz.id } });
    const invoicesBefore = await prisma.invoice.count({ where: { orgId } });
    const res = await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
    expect(res.invoice).toBeNull();
    expect(await prisma.invoice.count({ where: { orgId } })).toBe(invoicesBefore);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } });
    expect(sub.pendingPlanId).toBe(pro.id);
  });
});
