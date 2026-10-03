"use server";

import { redirect } from "next/navigation";
import { createInvitation, revokeInvitation, acceptInvitation, getInvitationByToken } from "@/server/services/invitations";
import { changeRole, removeMember } from "@/server/services/members";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import type { Role } from "@prisma/client";

async function actorOrg(orgId: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session.userId;
}

export async function inviteMemberAction(orgId: string, fd: FormData) {
  const userId = await actorOrg(orgId);
  const email = String(fd.get("email") ?? "");
  const role = (String(fd.get("role") ?? "MEMBER") === "ADMIN" ? "ADMIN" : "MEMBER") as Role;
  await createInvitation(orgId, userId, email, role);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/members`);
}

export async function revokeInvitationAction(orgId: string, invitationId: string) {
  const userId = await actorOrg(orgId);
  await revokeInvitation(orgId, userId, invitationId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/members`);
}

export async function changeRoleAction(orgId: string, targetUserId: string, newRole: Role) {
  const userId = await actorOrg(orgId);
  await changeRole(orgId, userId, targetUserId, newRole);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/members`);
}

export async function removeMemberAction(orgId: string, targetUserId: string) {
  const userId = await actorOrg(orgId);
  await removeMember(orgId, userId, targetUserId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  redirect(`/org/${org.slug}/members`);
}

export async function acceptInvitationAction(token: string) {
  const userId = await actorOrg("");
  const inv = await acceptInvitation(token, userId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: inv.orgId } });
  redirect(`/org/${org.slug}`);
}
