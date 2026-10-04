import { prisma } from "@/server/db";
import { requireMembership } from "@/server/services/orgs";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function logActivity(
  orgId: string,
  actorId: string | null,
  verb: string,
  targetType: string,
  targetId?: string,
  projectId?: string,
  payload?: object,
  tx?: Tx,
) {
  const client = tx ?? prisma;
  await client.activityEvent.create({
    data: { orgId, actorId, verb, targetType, targetId, projectId, payload: (payload ?? undefined) as object | undefined },
  });
}

export async function listActivity(orgId: string, actorId: string, limit = 50) {
  await requireMembership(orgId, actorId);
  return prisma.activityEvent.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true } } },
  });
}
