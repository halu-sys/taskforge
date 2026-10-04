import { prisma } from "@/server/db";
import { requireMembership, requireRole } from "@/server/services/orgs";
import { NotFoundError, ForbiddenError, ValidationError } from "@/server/errors";
import { rebalancePositions, STEP } from "@/server/services/positions";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { prisma as globalPrisma } from "@/server/db";
import type { TaskStatus, TaskPriority } from "@prisma/client";

async function projectIdForBoard(boardId: string): Promise<string | null> {
  const b = await globalPrisma.board.findUnique({ where: { id: boardId } });
  return b?.projectId ?? null;
}

async function getTaskInOrg(orgId: string, taskId: string) {
  const t = await prisma.task.findUnique({ where: { id: taskId } });
  if (!t || t.orgId !== orgId) throw new NotFoundError("Task not found");
  return t;
}

// MEMBER may act on tasks they created or are assigned; ADMIN+ on all.
async function assertCanMutate(orgId: string, actorId: string, task: { createdById: string; assigneeId: string | null }) {
  const m = await requireMembership(orgId, actorId);
  if (m.role === "OWNER" || m.role === "ADMIN") return m;
  if (task.createdById === actorId || task.assigneeId === actorId) return m;
  throw new ForbiddenError("You can only modify tasks you created or are assigned to");
}

async function getBoardInOrg(orgId: string, boardId: string) {
  const b = await prisma.board.findUnique({
    where: { id: boardId },
    include: { project: true },
  });
  if (!b || b.project.orgId !== orgId) throw new NotFoundError("Board not found");
  return b;
}

export async function createTask(
  orgId: string,
  actorId: string,
  input: { boardId: string; title: string; description?: string; assigneeId?: string; priority?: TaskPriority; dueDate?: Date },
) {
  await requireMembership(orgId, actorId);
  const title = input.title.trim();
  if (!title || title.length > 500) throw new ValidationError("Invalid title");
  await getBoardInOrg(orgId, input.boardId);

  if (input.assigneeId) {
    const assignee = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: input.assigneeId } },
    });
    if (!assignee) throw new ValidationError("Assignee must be an org member");
  }

  const bottom = await prisma.task.findFirst({
    where: { boardId: input.boardId },
    orderBy: { position: "desc" },
  });

  const [task] = await prisma.$transaction([
    prisma.task.create({
      data: {
        boardId: input.boardId,
        orgId,
        number: 0, // set below via project counter
        title,
        description: input.description?.trim() || null,
        assigneeId: input.assigneeId,
        priority: input.priority,
        dueDate: input.dueDate,
        createdById: actorId,
        position: (bottom?.position ?? 0) + STEP,
      },
    }),
  ]);
  // atomic per-project number
  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.findFirstOrThrow({
      where: { boards: { some: { id: input.boardId } } },
    });
    const updated = await tx.project.update({
      where: { id: p.id },
      data: { nextNumber: p.nextNumber + 1 },
    });
    await tx.task.update({ where: { id: task.id }, data: { number: p.nextNumber } });
    await logActivity(orgId, actorId, "task.created", "task", task.id, p.id, { title }, tx);
    if (input.assigneeId && input.assigneeId !== actorId) {
      const slug = (await tx.organization.findUniqueOrThrow({ where: { id: orgId } })).slug;
      await tx.notification.create({
        data: { userId: input.assigneeId, verb: "assigned", link: `/org/${slug}/tasks/${task.id}` },
      });
    }
    return updated;
  });
  return prisma.task.findUniqueOrThrow({ where: { id: task.id } });
}

export async function getTask(orgId: string, actorId: string, taskId: string) {
  await requireMembership(orgId, actorId);
  const t = await getTaskInOrg(orgId, taskId);
  return prisma.task.findUniqueOrThrow({
    where: { id: t.id },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      board: { include: { project: true } },
      comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function updateTask(
  orgId: string,
  actorId: string,
  taskId: string,
  patch: { title?: string; description?: string; priority?: TaskPriority; labels?: string[]; dueDate?: Date | null; assigneeId?: string | null },
) {
  const task = await getTaskInOrg(orgId, taskId);
  await assertCanMutate(orgId, actorId, task);
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t || t.length > 500) throw new ValidationError("Invalid title");
    data.title = t;
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.labels !== undefined) data.labels = patch.labels.map((l) => l.trim()).filter(Boolean).slice(0, 10);
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId === null) data.assigneeId = null;
    else {
      const m = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: patch.assigneeId } } });
      if (!m) throw new ValidationError("Assignee must be an org member");
      data.assigneeId = patch.assigneeId;
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: task.id }, data });
    const projectId = await projectIdForBoard(task.boardId);
    await logActivity(orgId, actorId, "task.updated", "task", task.id, projectId ?? undefined, { fields: Object.keys(data) }, tx);
    if (data.assigneeId && data.assigneeId !== actorId && data.assigneeId !== task.assigneeId) {
      const slug = (await tx.organization.findUniqueOrThrow({ where: { id: orgId } })).slug;
      await tx.notification.create({
        data: { userId: data.assigneeId as string, verb: "assigned", link: `/org/${slug}/tasks/${task.id}` },
      });
    }
    return updated;
  });
}

export async function moveTask(
  orgId: string,
  actorId: string,
  taskId: string,
  input: { boardId: string; status: TaskStatus; position: number },
) {
  const task = await getTaskInOrg(orgId, taskId);
  await assertCanMutate(orgId, actorId, task);
  await getBoardInOrg(orgId, input.boardId);
  if (!Number.isFinite(input.position)) throw new ValidationError("Invalid position");

  const projectId = await projectIdForBoard(input.boardId);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { boardId: input.boardId, status: input.status, position: input.position },
  });
  if (task.status !== input.status) {
    await logActivity(orgId, actorId, "task.moved", "task", task.id, projectId ?? undefined, {
      from: task.status, to: input.status,
    });
  }

  // rebalance if neighbors got too close
  const column = await prisma.task.findMany({
    where: { boardId: input.boardId },
    orderBy: { position: "asc" },
  });
  for (let i = 0; i < column.length - 1; i++) {
    if (column[i + 1].position - column[i].position < 0.01) {
      await prisma.$transaction(
        rebalancePositions(column.map((t) => t.id)).map((p) =>
          prisma.task.update({ where: { id: p.id }, data: { position: p.position } }),
        ),
      );
      break;
    }
  }
  return updated;
}

export async function deleteTask(orgId: string, actorId: string, taskId: string) {
  const task = await getTaskInOrg(orgId, taskId);
  await assertCanMutate(orgId, actorId, task);
  const projectId = await projectIdForBoard(task.boardId);
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: task.id } });
    await logActivity(orgId, actorId, "task.deleted", "task", task.id, projectId ?? undefined, { title: task.title }, tx);
  });
}

export async function listBoardTasks(orgId: string, actorId: string, boardId: string) {
  await requireMembership(orgId, actorId);
  await getBoardInOrg(orgId, boardId);
  return prisma.task.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    include: { assignee: { select: { id: true, name: true } } },
  });
}
