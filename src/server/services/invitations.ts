import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/services/orgs";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { Role } from "@prisma/client";

const INVITE_DAYS = 7;
const emailSchema = z.string().email().toLowerCase();

export async function createInvitation(
  orgId: string,
  actorId: string,
  email: string,
  role: Role,
) {
  await requireRole(orgId, actorId, "ADMIN");
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new ValidationError("Invalid email address");
  const normalized = parsed.data;
  if (role === "OWNER") throw new ValidationError("Cannot invite as owner");

  const existingMember = await prisma.membership.findFirst({
    where: { orgId, user: { email: normalized } },
  });
  if (existingMember) throw new ValidationError("That email is already a member");

  const pending = await prisma.invitation.findUnique({
    where: { orgId_email: { orgId, email: normalized } },
  });
  if (pending && pending.acceptedAt === null && pending.expiresAt > new Date()) {
    throw new ValidationError("An invitation for that email is already pending");
  }
  if (pending) await prisma.invitation.delete({ where: { id: pending.id } });

  const token = crypto.randomBytes(32).toString("hex");
  const inv = await prisma.invitation.create({
    data: {
      orgId, email: normalized, token, role, invitedById: actorId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  // Demo stand-in for sending email.
  console.log(`[invite] /invite/${token}`);
  return inv;
}

export async function acceptInvitation(token: string, userId: string) {
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) throw new NotFoundError("Invitation not found");
  if (inv.acceptedAt) throw new ValidationError("Invitation already accepted");
  if (inv.expiresAt < new Date()) throw new ValidationError("Invitation expired");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email.toLowerCase() !== inv.email) {
    throw new ValidationError("This invitation was sent to a different email");
  }
  const existing = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: inv.orgId, userId } },
  });
  if (existing) {
    await prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    return existing; // idempotent
  }
  const [membership] = await prisma.$transaction([
    prisma.membership.create({ data: { orgId: inv.orgId, userId, role: inv.role } }),
    prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);
  return membership;
}

export async function revokeInvitation(orgId: string, actorId: string, invitationId: string) {
  await requireRole(orgId, actorId, "ADMIN");
  const r = await prisma.invitation.deleteMany({ where: { id: invitationId, orgId } });
  if (r.count === 0) throw new NotFoundError("Invitation not found");
}

export async function listInvitations(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, "ADMIN");
  return prisma.invitation.findMany({
    where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    include: { org: { select: { name: true, slug: true } } },
  });
}
