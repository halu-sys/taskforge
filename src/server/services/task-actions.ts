"use server";

import { revalidatePath } from "next/cache";
import { currentSession } from "@/server/auth/session";
import { createTask, updateTask, moveTask, deleteTask } from "@/server/services/tasks";
import { prisma } from "@/server/db";
import type { TaskStatus, TaskPriority } from "@prisma/client";

async function actor() {
  const session = await currentSession();
  if (!session) throw new Error("Not authenticated");
  return session.userId;
}

async function orgSlug(orgId: string) {
  return (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).slug;
}

export async function createTaskAction(orgId: string, fd: FormData) {
  const userId = await actor();
  const boardId = String(fd.get("boardId") ?? "");
  const task = await createTask(orgId, userId, {
    boardId,
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? "") || undefined,
  });
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}/projects`);
  return { ok: true, taskId: task.id };
}

export async function updateTaskAction(orgId: string, taskId: string, patch: {
  title?: string; description?: string; priority?: TaskPriority;
  labels?: string[]; dueDate?: Date | null; assigneeId?: string | null;
}) {
  const userId = await actor();
  await updateTask(orgId, userId, taskId, patch);
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}`);
  revalidatePath(`/org/${slug}/tasks/${taskId}`);
}

export async function moveTaskAction(orgId: string, taskId: string, input: {
  boardId: string; status: TaskStatus; position: number;
}) {
  const userId = await actor();
  await moveTask(orgId, userId, taskId, input);
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}`);
}

export async function deleteTaskAction(orgId: string, taskId: string) {
  const userId = await actor();
  await deleteTask(orgId, userId, taskId);
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}`);
}
