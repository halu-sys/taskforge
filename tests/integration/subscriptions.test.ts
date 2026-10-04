import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { getSubscription, subscribe, setCancelAtPeriodEnd, resume, expireIfNeeded } from "@/server/services/subscriptions";
import { getLimits } from "@/server/services/entitlements";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, owner: string, member: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: "sub-test" } });
  await prisma.user.deleteMany({ where: { email: { in: ["so@sub.test", "sm@sub.test"] } } });
  owner = (await prisma.user.create({ data: { email: "so@sub.test", name: "so", passwordHash: "x" } })).id;
  member = (await prisma.user.create({ data: { email: "sm@sub.test", name: "sm", passwordHash: "x" } })).id;
  const org = await prisma.organization.create({
    data: { name: "Sub", slug: "sub-test", memberships: { create: [
      { userId: owner, role: "OWNER" }, { userId: member, role: "MEMBER" },
    ] } },
  });
  orgId = org.id;
});

describe("subscriptions", () => {
  it("no subscription initially", async () => {
    expect(await getSubscription(orgId, owner)).toBeNull();
  });

  it("MEMBER cannot subscribe (OWNER only)", async () => {
    await expect(subscribe(orgId, member, "pro")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("subscribe creates ACTIVE sub with period end ~1 month out", async () => {
    const sub = await subscribe(orgId, owner, "pro");
    expect(sub.status).toBe("ACTIVE");
    const days = (sub.currentPeriodEnd.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("subscribe is idempotent-ish: re-subscribe to same plan keeps single row, extends nothing", async () => {
    const before = await getSubscription(orgId, owner);
    const again = await subscribe(orgId, owner, "pro");
    expect(again.id).toBe(before!.id);
    expect(await prisma.subscription.count({ where: { orgId } })).toBe(1);
  });

  it("plan change switches planId", async () => {
    const sub = await subscribe(orgId, owner, "business");
    expect(sub.plan.slug).toBe("business");
  });

  it("cancelAtPeriodEnd flag toggles; resume clears it", async () => {
    let sub = await setCancelAtPeriodEnd(orgId, owner, true);
    expect(sub.cancelAtPeriodEnd).toBe(true);
    sub = await resume(orgId, owner);
    expect(sub.cancelAtPeriodEnd).toBe(false);
  });

  it("expireIfNeeded: past period end + cancelAtPeriodEnd -> CANCELED, limits drop to free", async () => {
    await prisma.subscription.update({
      where: { orgId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000), cancelAtPeriodEnd: true },
    });
    await expireIfNeeded(orgId, owner);
    const sub = await getSubscription(orgId, owner);
    expect(sub!.status).toBe("CANCELED");
    expect((await getLimits(orgId)).planSlug).toBe("free");
  });

  it("expireIfNeeded: past period end without cancel flag stays (renewal is T6's job)", async () => {
    await prisma.subscription.update({
      where: { orgId },
      data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - 1000), cancelAtPeriodEnd: false },
    });
    await expireIfNeeded(orgId, owner);
    const sub = (await getSubscription(orgId, owner))!;
    // no stored payment method -> lazy renewal would mark PAST_DUE, but
    // expireIfNeeded itself must not cancel
    expect(["ACTIVE", "PAST_DUE"]).toContain(sub.status);
  });
});
