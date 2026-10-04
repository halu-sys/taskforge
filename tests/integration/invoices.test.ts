import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensurePlans } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { checkout } from "@/server/services/checkout";
import { listInvoices, getInvoice } from "@/server/services/invoices";
import { NotFoundError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, otherOrgId: string, owner: string, otherOwner: string, member: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: { in: ["inv-a", "inv-b"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["oa@inva.test", "ob@inva.test", "mem@inva.test", "ox@invb.test"] } } });
  owner = (await prisma.user.create({ data: { email: "oa@inva.test", name: "oa", passwordHash: "x" } })).id;
  member = (await prisma.user.create({ data: { email: "mem@inva.test", name: "mem", passwordHash: "x" } })).id;
  otherOwner = (await prisma.user.create({ data: { email: "ox@invb.test", name: "ox", passwordHash: "x" } })).id;
  const a = await prisma.organization.create({
    data: { name: "InvA", slug: "inv-a", memberships: { create: [
      { userId: owner, role: "OWNER" }, { userId: member, role: "MEMBER" },
    ] } },
  });
  orgId = a.id;
  const b = await prisma.organization.create({
    data: { name: "InvB", slug: "inv-b", memberships: { create: { userId: otherOwner, role: "OWNER" } } },
  });
  otherOrgId = b.id;

  await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
  await checkout(orgId, owner, "pro", "4242424242424242", new FakeProvider());
  await checkout(otherOrgId, otherOwner, "pro", "4242424242424242", new FakeProvider());
});

describe("invoices", () => {
  it("listInvoices returns org invoices newest first, with lines", async () => {
    const list = await listInvoices(orgId, owner);
    expect(list.length).toBe(2);
    expect(list[0].issuedAt.getTime()).toBeGreaterThanOrEqual(list[1].issuedAt.getTime());
    expect(list[0].lines.length).toBe(1);
    expect(list[0].status).toBe("PAID");
  });

  it("MEMBER can list invoices (read-only)", async () => {
    const list = await listInvoices(orgId, member);
    expect(list.length).toBe(2);
  });

  it("getInvoice cross-org -> NotFoundError", async () => {
    const mine = await listInvoices(orgId, owner);
    await expect(getInvoice(otherOrgId, otherOwner, mine[0].id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getInvoice returns lines and payments", async () => {
    const mine = await listInvoices(orgId, owner);
    const full = await getInvoice(orgId, member, mine[0].id);
    expect(full.payments.length).toBe(1);
    expect(full.payments[0].status).toBe("SUCCEEDED");
  });

  it("outsider cannot list", async () => {
    await expect(listInvoices(orgId, otherOwner)).rejects.toThrow(/not found|forbidden/i);
  });
});
