import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { requireMembership, requireRole } from "@/server/services/orgs";
import { listMembers, changeRole, removeMember } from "@/server/services/members";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();

let orgId: string;
let owner: string, admin: string, member: string, outsider: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["roles-test", "solo-roles"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["owner@roles.test", "admin@roles.test", "member@roles.test", "out@roles.test"] } } });
  const mk = (email: string) =>
    prisma.user.create({ data: { email, name: email, passwordHash: "x" } });
  owner = (await mk("owner@roles.test")).id;
  admin = (await mk("admin@roles.test")).id;
  member = (await mk("member@roles.test")).id;
  outsider = (await mk("out@roles.test")).id;
  const org = await prisma.organization.create({
    data: {
      name: "Roles", slug: "roles-test",
      memberships: {
        create: [
          { userId: owner, role: "OWNER" },
          { userId: admin, role: "ADMIN" },
          { userId: member, role: "MEMBER" },
        ],
      },
    },
  });
  orgId = org.id;
});

describe("membership guards", () => {
  it("requireMembership returns row for member, throws for outsider", async () => {
    const m = await requireMembership(orgId, member);
    expect(m.role).toBe("MEMBER");
    await expect(requireMembership(orgId, outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireRole enforces rank", async () => {
    await expect(requireRole(orgId, member, "ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
    const m = await requireRole(orgId, admin, "ADMIN");
    expect(m.role).toBe("ADMIN");
  });
});

describe("role matrix", () => {
  it("OWNER can promote MEMBER to ADMIN", async () => {
    const m = await changeRole(orgId, owner, member, "ADMIN");
    expect(m.role).toBe("ADMIN");
    await changeRole(orgId, owner, member, "MEMBER");
  });

  it("ADMIN can manage MEMBER but not OWNER", async () => {
    await changeRole(orgId, admin, member, "ADMIN");
    await changeRole(orgId, admin, member, "MEMBER");
    await expect(changeRole(orgId, admin, owner, "MEMBER")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("MEMBER cannot change roles", async () => {
    await expect(changeRole(orgId, member, admin, "MEMBER")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ADMIN cannot remove OWNER; OWNER can remove MEMBER", async () => {
    await expect(removeMember(orgId, admin, owner)).rejects.toBeInstanceOf(ForbiddenError);
    await removeMember(orgId, owner, member);
    expect(await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: member } } })).toBeNull();
    // restore
    await prisma.membership.create({ data: { orgId, userId: member, role: "MEMBER" } });
  });

  it("last OWNER cannot be removed", async () => {
    const second = await prisma.organization.create({
      data: { name: "Solo", slug: "solo-roles", memberships: { create: { userId: outsider, role: "OWNER" } } },
    });
    await expect(removeMember(second.id, outsider, outsider)).rejects.toBeInstanceOf(ForbiddenError);
    await prisma.organization.delete({ where: { id: second.id } });
  });

  it("last OWNER cannot demote self (zero-owner lockout prevented)", async () => {
    const second = await prisma.organization.create({
      data: { name: "Solo2", slug: "solo-roles2", memberships: { create: { userId: outsider, role: "OWNER" } } },
    });
    await expect(changeRole(second.id, outsider, outsider, "MEMBER")).rejects.toBeInstanceOf(ForbiddenError);
    await prisma.organization.delete({ where: { id: second.id } });
  });
});

describe("listMembers", () => {
  it("members can list; outsider cannot", async () => {
    const list = await listMembers(orgId, member);
    expect(list).toHaveLength(3);
    await expect(listMembers(orgId, outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
