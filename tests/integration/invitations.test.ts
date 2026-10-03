import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createInvitation, acceptInvitation, revokeInvitation, listInvitations } from "@/server/services/invitations";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, admin: string, member: string, guest: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["inv-test", "inv-other"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["admin@inv.test", "mem@inv.test", "guest@inv.test", "dbl@inv.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e, passwordHash: "x" } });
  admin = (await mk("admin@inv.test")).id;
  member = (await mk("mem@inv.test")).id;
  guest = (await mk("guest@inv.test")).id;
  const org = await prisma.organization.create({
    data: { name: "Inv", slug: "inv-test",
      memberships: { create: [
        { userId: admin, role: "ADMIN" },
        { userId: member, role: "MEMBER" },
      ] } },
  });
  orgId = org.id;
});

describe("invitations", () => {
  it("ADMIN can create; MEMBER cannot", async () => {
    const inv = await createInvitation(orgId, admin, "new@inv.test", "MEMBER");
    expect(inv.token).toHaveLength(64);
    expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(createInvitation(orgId, member, "x@inv.test", "MEMBER")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("duplicate pending email rejected", async () => {
    await expect(createInvitation(orgId, admin, "new@inv.test", "MEMBER"))
      .rejects.toThrow(/already/i);
  });

  it("accept creates membership with invited role", async () => {
    const inv = await createInvitation(orgId, admin, "guest@inv.test", "ADMIN");
    const m = await acceptInvitation(inv.token, guest);
    expect(m.role).toBe("ADMIN");
    const count = await prisma.membership.count({ where: { orgId, userId: guest } });
    expect(count).toBe(1);
  });

  it("expired invitation rejected", async () => {
    const inv = await prisma.invitation.create({
      data: { orgId, email: "old@inv.test", token: "tok-expired", role: "MEMBER",
        invitedById: admin, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(acceptInvitation("tok-expired", guest)).rejects.toThrow(/expired/i);
    await prisma.invitation.delete({ where: { id: inv.id } });
  });

  it("re-inviting an existing member rejected", async () => {
    await expect(createInvitation(orgId, admin, "mem@inv.test", "MEMBER"))
      .rejects.toThrow(/already a member/i);
  });

  it("revoke removes invitation", async () => {
    const inv = await createInvitation(orgId, admin, "rev@inv.test", "MEMBER");
    await revokeInvitation(orgId, admin, inv.id);
    expect(await prisma.invitation.findUnique({ where: { id: inv.id } })).toBeNull();
    await expect(revokeInvitation(orgId, member, "nope")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("listInvitations shows only live pending invitations", async () => {
    // seed one expired-pending and one live-pending; assert only live returned
    await prisma.invitation.create({
      data: { orgId, email: "exp@inv.test", token: "tok-list-exp", role: "MEMBER",
        invitedById: admin, expiresAt: new Date(Date.now() - 1000) },
    });
    const live = await createInvitation(orgId, admin, "list-live@inv.test", "MEMBER");
    const list = await listInvitations(orgId, admin);
    expect(list.some((i) => i.id === live.id)).toBe(true);
    expect(list.some((i) => i.token === "tok-list-exp")).toBe(false);
    expect(list.every((i) => i.acceptedAt === null && i.expiresAt > new Date())).toBe(true);
  });

  it("invalid email rejected at service boundary", async () => {
    await expect(createInvitation(orgId, admin, "not-an-email", "MEMBER")).rejects.toThrow(/Invalid email/i);
    await expect(createInvitation(orgId, admin, "", "MEMBER")).rejects.toThrow(/Invalid email/i);
  });

  it("accept with wrong user email rejected", async () => {
    const inv = await createInvitation(orgId, admin, "mismatch@inv.test", "MEMBER");
    await expect(acceptInvitation(inv.token, member)).rejects.toThrow(/different email/i);
  });

  it("double accept rejected", async () => {
    const dbl = await prisma.user.create({ data: { email: "dbl@inv.test", name: "D", passwordHash: "x" } });
    const inv = await createInvitation(orgId, admin, "dbl@inv.test", "MEMBER");
    await acceptInvitation(inv.token, dbl.id);
    await expect(acceptInvitation(inv.token, dbl.id)).rejects.toThrow(/already accepted/i);
  });

  it("revoke cross-org rejected", async () => {
    const other = await prisma.organization.create({
      data: { name: "Other", slug: "inv-other", memberships: { create: { userId: admin, role: "ADMIN" } } },
    });
    const inv = await createInvitation(other.id, admin, "cross@inv.test", "MEMBER");
    await expect(revokeInvitation(orgId, admin, inv.id)).rejects.toThrow(/not found/i);
    await prisma.organization.delete({ where: { id: other.id } });
  });
});
