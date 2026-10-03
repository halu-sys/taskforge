import { prisma } from "@/server/db";
import { requireMembership, requireRole } from "@/server/services/orgs";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import type { Role } from "@prisma/client";

export async function listMembers(orgId: string, actorId: string) {
  await requireMembership(orgId, actorId);
  return prisma.membership.findMany({
    where: { orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

const rank: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

export async function changeRole(
  orgId: string,
  actorId: string,
  targetUserId: string,
  newRole: Role,
) {
  const actor = await requireRole(orgId, actorId, "ADMIN");
  const target = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: targetUserId } },
  });
  if (!target) throw new NotFoundError("Not a member");
  // Admins cannot touch owners; only owners can grant/revoke ownership.
  if (target.role === "OWNER" || newRole === "OWNER") {
    if (actor.role !== "OWNER") throw new ForbiddenError("Only the owner can change ownership");
  }
  if (target.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await prisma.membership.count({ where: { orgId, role: "OWNER" } });
    if (ownerCount <= 1) throw new ForbiddenError("Organization must keep at least one owner");
  }
  return prisma.membership.update({
    where: { id: target.id },
    data: { role: newRole },
  });
}

export async function removeMember(orgId: string, actorId: string, targetUserId: string) {
  const actor = await requireRole(orgId, actorId, "ADMIN");
  const target = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: targetUserId } },
  });
  if (!target) throw new NotFoundError("Not a member");
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    throw new ForbiddenError("Only the owner can remove the owner");
  }
  const ownerCount = await prisma.membership.count({ where: { orgId, role: "OWNER" } });
  if (target.role === "OWNER" && ownerCount <= 1) {
    throw new ForbiddenError("Organization must keep at least one owner");
  }
  await prisma.membership.delete({ where: { id: target.id } });
}
