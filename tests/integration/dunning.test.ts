import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { checkout } from "@/server/services/checkout";
import { renewSubscription } from "@/server/services/subscriptions";
import { getLimits } from "@/server/services/entitlements";

const prisma = new PrismaClient();
let orgId: string, owner: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: "dun-test" } });
  await prisma.user.deleteMany({ where: { email: "od@dun.test" } });
  owner = (await prisma.user.create({ data: { email: "od@dun.test", name: "od", passwordHash: "x" } })).id;
  const org = await prisma.organization.create({
    data: { name: "Dun", slug: "dun-test", memberships: { create: { userId: owner, role: "OWNER" } } },
  });
  orgId = org.id;
  await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
});

async function expireNow() {
  await prisma.subscription.update({
    where: { orgId },
    data: { currentPeriodEnd: new Date(Date.now() - 1000) },
  });
}

describe("renewal + dunning", () => {
  it("renewal success: new PAID invoice, period extended, failures reset", async () => {
    await expireNow();
    const res = await renewSubscription(orgId, owner, new FakeProvider());
    expect(res.outcome).toBe("renewed");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    expect(sub.dunningFailures).toBe(0);
    const inv = await prisma.invoice.findFirst({ where: { orgId }, orderBy: { issuedAt: "desc" } });
    expect(inv!.status).toBe("PAID");
    expect(inv!.amountCents).toBe(1000); // 1 seat pro
  });

  it("renewal failure: PAST_DUE, UNCOLLECTED invoice, failure count up; limits stay (grace)", async () => {
    await expireNow();
    const res = await renewSubscription(orgId, owner, new FakeProvider(), { retryCard: "4000000000000002" });
    expect(res.outcome).toBe("failed");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.dunningFailures).toBe(1);
    const inv = await prisma.invoice.findFirst({ where: { orgId }, orderBy: { issuedAt: "desc" } });
    expect(inv!.status).toBe("UNCOLLECTED");
    // limits still paid-plan during grace
    expect((await getLimits(orgId)).planSlug).toBe("pro");
  });

  it("retry payment after PAST_DUE succeeds -> ACTIVE, invoice PAID", async () => {
    const res = await renewSubscription(orgId, owner, new FakeProvider(), { retryCard: "4242424242424242" });
    expect(res.outcome).toBe("renewed");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.status).toBe("ACTIVE");
    const inv = await prisma.invoice.findFirst({ where: { orgId }, orderBy: { issuedAt: "desc" } });
    expect(inv!.status).toBe("PAID");
  });

  it("3 consecutive failures -> CANCELED, limits drop to free", async () => {
    await prisma.subscription.update({ where: { orgId }, data: { dunningFailures: 0, status: "ACTIVE" } });
    for (let i = 0; i < 3; i++) {
      await expireNow();
      const res = await renewSubscription(orgId, owner, new FakeProvider(), { retryCard: "4000000000000002" });
      expect(res.outcome).toBe(i < 2 ? "failed" : "canceled");
    }
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.status).toBe("CANCELED");
    expect((await getLimits(orgId)).planSlug).toBe("free");
  });

  it("renew is a no-op when period not ended", async () => {
    await prisma.subscription.update({ where: { orgId }, data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400_000 * 10) } });
    const res = await renewSubscription(orgId, owner, new FakeProvider());
    expect(res.outcome).toBe("noop");
  });
});
