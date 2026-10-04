import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { checkout } from "@/server/services/checkout";

const prisma = new PrismaClient();
let orgId: string, owner: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: "co-test" } });
  await prisma.user.deleteMany({ where: { email: { in: ["co@co.test", "cm@co.test"] } } });
  owner = (await prisma.user.create({ data: { email: "co@co.test", name: "co", passwordHash: "x" } })).id;
  const org = await prisma.organization.create({
    data: { name: "Co", slug: "co-test", memberships: { create: { userId: owner, role: "OWNER" } } },
  });
  orgId = org.id;
});

describe("checkout", () => {
  it("MEMBER cannot checkout", async () => {
    const m = await prisma.user.create({ data: { email: "cm@co.test", name: "cm", passwordHash: "x" } });
    await prisma.membership.create({ data: { orgId, userId: m.id, role: "MEMBER" } });
    await expect(checkout(orgId, m.id, "pro", "4242424242424242", new FakeProvider())).rejects.toThrow(/insufficient role/i);
  });

  it("declined card: no subscription, no invoice", async () => {
    await expect(
      checkout(orgId, owner, "pro", "4000000000000002", new FakeProvider()),
    ).rejects.toThrow(/declined/i);
    expect(await prisma.subscription.findUnique({ where: { orgId } })).toBeNull();
    expect(await prisma.invoice.count({ where: { orgId } })).toBe(0);
  });

  it("accepted card: ACTIVE sub + PAID invoice with lines + payment, atomically", async () => {
    const seats = 2; // owner + 1 member added in the previous test
    const res = await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
    expect(res.subscription.status).toBe("ACTIVE");
    expect(res.invoice.status).toBe("PAID");
    // pro = 1000 cents/seat/mo, seats = current member count (2)
    expect(res.invoice.amountCents).toBe(2000);
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: res.invoice.id } });
    expect(lines.length).toBe(1);
    expect(lines[0].amountCents).toBe(2000);
    const pay = await prisma.payment.findMany({ where: { invoiceId: res.invoice.id } });
    expect(pay[0].status).toBe("SUCCEEDED");
    expect(pay[0].providerId).toMatch(/^fake_/);
  });

  it("invoice numbers are unique and sequential", async () => {
    const nums = await prisma.invoice.findMany({ where: { orgId }, select: { number: true } });
    expect(new Set(nums.map((n) => n.number)).size).toBe(nums.length);
    expect(nums[0].number).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("re-checkout (plan change) creates a second invoice", async () => {
    const res = await checkout(orgId, owner, "business", "4242424242424242", new FakeProvider());
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: res.subscription.planId } });
    expect(plan.slug).toBe("business");
    expect(await prisma.invoice.count({ where: { orgId } })).toBe(2);
  });
});
