import { prisma } from "@/server/db";
import { requireMembership } from "@/server/services/orgs";

export async function search(orgId: string, actorId: string, q: string) {
  await requireMembership(orgId, actorId);
  const term = q.trim();
  if (!term) return { tasks: [], projects: [] };
  const like = { contains: term, mode: "insensitive" as const };

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: {
        orgId,
        OR: [{ title: like }, { description: like }],
      },
      orderBy: [{ title: "asc" }],
      take: 30,
      include: { board: { include: { project: { select: { key: true, name: true } } } } },
    }),
    prisma.project.findMany({
      where: { orgId, archivedAt: null, name: like },
      take: 10,
    }),
  ]);
  return { tasks, projects };
}
