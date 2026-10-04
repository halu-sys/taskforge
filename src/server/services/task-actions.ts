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

export async function createTaskAction(orgId: string, fd: FormData): Promise<void> {
  const userId = await actor();
  const boardId = String(fd.get("boardId") ?? "");
  const task = await createTask(orgId, userId, {
    boardId,
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? "") || undefined,
  });
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}/projects`);
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

export async function addCommentAction(orgId: string, taskId: string, fd: FormData): Promise<void> {
  const userId = await actor();
  const { addComment } = await import("@/server/services/comments");
  await addComment(orgId, userId, taskId, String(fd.get("body") ?? ""));
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}/tasks/${taskId}`);
}

export async function updateTaskFieldAction(
  orgId: string,
  taskId: string,
  field: "status" | "assignee" | "priority",
  fd: FormData,
): Promise<void> {
  const userId = await actor();
  if (field === "status") {
    const status = String(fd.get("status") ?? "") as TaskStatus;
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await moveTask(orgId, userId, taskId, { boardId: task.boardId, status, position: task.position });
  } else if (field === "assignee") {
    const v = String(fd.get("assigneeId") ?? "");
    await updateTask(orgId, userId, taskId, { assigneeId: v === "" ? null : v });
  } else {
    await updateTask(orgId, userId, taskId, { priority: String(fd.get("priority") ?? "NONE") as TaskPriority });
  }
  const slug = await orgSlug(orgId);
  revalidatePath(`/org/${slug}/tasks/${taskId}`);
  revalidatePath(`/org/${slug}/projects`);
}
