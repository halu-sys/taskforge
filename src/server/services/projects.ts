import { prisma } from "@/server/db";
import { requireMembership, requireRole } from "@/server/services/orgs";
import { NotFoundError, ValidationError } from "@/server/errors";

function projectKey(orgSlug: string, n: number): string {
  const prefix = orgSlug.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 8) || "PRJ";
  return `${prefix}-${n}`;
}

export async function createProject(orgId: string, actorId: string, name: string) {
  await requireMembership(orgId, actorId);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new ValidationError("Invalid project name");
  return createProjectWithBoard(orgId, actorId, trimmed);
}

export async function createProjectWithBoard(orgId: string, actorId: string, name: string) {
  await requireMembership(orgId, actorId);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new ValidationError("Invalid project name");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  let n = (await prisma.project.count({ where: { orgId } })) + 1;
  for (let attempt = 0; attempt < 10; attempt++, n++) {
    const key = projectKey(org.slug, n);
    try {
      // project + default board atomically
      return await prisma.$transaction(async (tx) => {
        const p = await tx.project.create({ data: { orgId, name, key } });
        await tx.board.create({ data: { projectId: p.id, name: "Main" } });
        return p;
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "P2002") continue; // key race: try next
      throw e;
    }
  }
  throw new ValidationError("Could not allocate a project key, retry");
}

export async function listProjects(orgId: string, actorId: string) {
  await requireMembership(orgId, actorId);
  return prisma.project.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { boards: true } } },
  });
}

async function getProjectInOrg(orgId: string, projectId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p || p.orgId !== orgId) throw new NotFoundError("Project not found");
  return p;
}

export async function renameProject(orgId: string, actorId: string, projectId: string, name: string) {
  await requireRole(orgId, actorId, "ADMIN");
  await getProjectInOrg(orgId, projectId);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new ValidationError("Invalid project name");
  return prisma.project.update({ where: { id: projectId }, data: { name: trimmed } });
}

export async function archiveProject(orgId: string, actorId: string, projectId: string) {
  await requireRole(orgId, actorId, "ADMIN");
  await getProjectInOrg(orgId, projectId);
  return prisma.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
}

export async function getProjectByKey(orgId: string, actorId: string, key: string) {
  await requireMembership(orgId, actorId);
  const p = await prisma.project.findUnique({
    where: { orgId_key: { orgId, key } },
    include: { boards: { orderBy: { createdAt: "asc" } } },
  });
  if (!p || p.archivedAt) throw new NotFoundError("Project not found");
  return p;
}
