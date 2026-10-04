import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { checkout } from "@/server/services/checkout";
import { changeSeats } from "@/server/services/subscriptions";

const prisma = new PrismaClient();
let orgId: string, owner: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: "seat-test" } });
  await prisma.user.deleteMany({ where: { email: { in: ["so@seat.test", "sm@seat.test", "sx@seat.test"] } } });
  owner = (await prisma.user.create({ data: { email: "so@seat.test", name: "so", passwordHash: "x" } })).id;
  const org = await prisma.organization.create({
    data: { name: "Seat", slug: "seat-test", memberships: { create: { userId: owner, role: "OWNER" } } },
  });
  orgId = org.id;
  await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider()); // 1 seat
});

describe("seats + proration", () => {
  it("checkout recorded seats=1", async () => {
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.seats).toBe(1);
  });

  it("increase seats mid-period charges prorated amount immediately", async () => {
    // real period spanning 30 days, half remaining -> proration = half of 1000
    await prisma.subscription.update({
      where: { orgId },
      data: {
        currentPeriodStart: new Date(Date.now() - 15 * 86400_000),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400_000),
      },
    });
    const before = await prisma.invoice.count({ where: { orgId } });
    const res = await changeSeats(orgId, owner, 2, new FakeProvider());
    expect(res.subscription.seats).toBe(2);
    expect(res.invoice!.amountCents).toBe(500); // 1000 * 15/30
    expect(res.invoice!.status).toBe("PAID");
    expect(await prisma.invoice.count({ where: { orgId } })).toBe(before + 1);
  });

  it("decrease seats: no charge now, applies to stored seats", async () => {
    const res = await changeSeats(orgId, owner, 1, new FakeProvider());
    expect(res.subscription.seats).toBe(1);
    expect(res.invoice).toBeNull();
  });

  it("seats cannot go below current member count", async () => {
    await expect(changeSeats(orgId, owner, 0, new FakeProvider())).rejects.toThrow(/seat/i);
  });

  it("declined proration charge leaves seats unchanged", async () => {
    await prisma.subscription.update({
      where: { orgId },
      data: {
        currentPeriodStart: new Date(Date.now() - 20 * 86400_000),
        currentPeriodEnd: new Date(Date.now() + 10 * 86400_000),
      },
    });
    await expect(changeSeats(orgId, owner, 5, new FakeProvider(), "4000000000000002")).rejects.toThrow(/declined/i);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.seats).toBe(1);
  });
});
