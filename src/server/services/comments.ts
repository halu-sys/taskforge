import { prisma } from "@/server/db";
import { requireMembership } from "@/server/services/orgs";
import { NotFoundError, ValidationError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";

async function getTaskInOrg(orgId: string, taskId: string) {
  const t = await prisma.task.findUnique({ where: { id: taskId } });
  if (!t || t.orgId !== orgId) throw new NotFoundError("Task not found");
  return t;
}

export async function addComment(orgId: string, actorId: string, taskId: string, body: string) {
  await requireMembership(orgId, actorId);
  const task = await getTaskInOrg(orgId, taskId);
  const text = body.trim();
  if (!text || text.length > 5000) throw new ValidationError("Invalid comment");

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { taskId, authorId: actorId, body: text } });
    await logActivity(orgId, actorId, "comment.added", "comment", c.id, undefined, { taskId }, tx);
    return c;
  });

  // @mention notifications: match org members' name prefix after @
  const members = await prisma.membership.findMany({
    where: { orgId },
    include: { user: { select: { id: true, name: true } } },
  });
  const tokens = [...text.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => m[1].toLowerCase());
  if (tokens.length > 0) {
    const orgRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    for (const m of members) {
      if (m.userId === actorId) continue;
      const name = m.user.name.toLowerCase();
      if (tokens.some((t) => name.startsWith(t) || t.startsWith(name))) {
        await prisma.notification.create({
          data: { userId: m.userId, verb: "mention", link: `/org/${orgRow.slug}/tasks/${taskId}` },
        });
      }
    }
  }
  return comment;
}

export async function listComments(orgId: string, actorId: string, taskId: string) {
  await requireMembership(orgId, actorId);
  await getTaskInOrg(orgId, taskId);
  return prisma.comment.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
