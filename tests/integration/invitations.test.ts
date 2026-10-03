import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createInvitation, acceptInvitation, revokeInvitation, listInvitations } from "@/server/services/invitations";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, admin: string, member: string, guest: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: "inv-test" } });
  await prisma.user.deleteMany({ where: { email: { in: ["admin@inv.test", "mem@inv.test", "guest@inv.test"] } } });
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

  it("listInvitations shows pending only", async () => {
    const list = await listInvitations(orgId, admin);
    expect(list.every((i) => i.acceptedAt === null)).toBe(true);
  });
});
