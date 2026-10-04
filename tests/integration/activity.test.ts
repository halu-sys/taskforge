import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTask, updateTask, deleteTask } from "@/server/services/tasks";
import { addComment } from "@/server/services/comments";
import { listActivity } from "@/server/services/activity";
import { listNotifications, unreadCount, markAllRead } from "@/server/services/notifications";

const prisma = new PrismaClient();
let orgId: string, owner: string, member: string;
let boardId: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: "act-test" } });
  await prisma.user.deleteMany({ where: { email: { in: ["o@act.test", "m@act.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e.split("@")[0], passwordHash: "x" } });
  owner = (await mk("o@act.test")).id;
  member = (await mk("m@act.test")).id;
  const org = await prisma.organization.create({
    data: { name: "Act", slug: "act-test",
      memberships: { create: [
        { userId: owner, role: "OWNER" },
        { userId: member, role: "MEMBER" },
      ] } },
  });
  orgId = org.id;
  const p = await prisma.project.create({ data: { orgId, name: "P", key: "ACT-1" } });
  boardId = (await prisma.board.create({ data: { projectId: p.id, name: "Main" } })).id;
});

describe("activity + notifications", () => {
  it("task create/update/delete logged", async () => {
    const t = await createTask(orgId, owner, { boardId, title: "Logged" });
    await updateTask(orgId, owner, t.id, { priority: "HIGH" });
    await deleteTask(orgId, owner, t.id);
    const feed = await listActivity(orgId, member);
    const verbs = feed.map((a) => a.verb);
    expect(verbs).toContain("task.created");
    expect(verbs).toContain("task.updated");
    expect(verbs).toContain("task.deleted");
  });

  it("comment logged", async () => {
    const t = await createTask(orgId, owner, { boardId, title: "Cmt act" });
    await addComment(orgId, member, t.id, "hi");
    const feed = await listActivity(orgId, owner);
    expect(feed.map((a) => a.verb)).toContain("comment.added");
  });

  it("assign notifies assignee, not self", async () => {
    const t = await createTask(orgId, owner, { boardId, title: "Assign me" });
    await updateTask(orgId, owner, t.id, { assigneeId: member });
    expect(await unreadCount(member)).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.findFirst({
      where: { userId: member, verb: "assigned" }, orderBy: { createdAt: "desc" },
    });
    expect(n).not.toBeNull();
    // self-assign: no new notification for owner
    const before = await prisma.notification.count({ where: { userId: owner } });
    await updateTask(orgId, owner, t.id, { assigneeId: owner });
    expect(await prisma.notification.count({ where: { userId: owner } })).toBe(before);
  });

  it("markAllRead clears unread", async () => {
    await markAllRead(member);
    expect(await unreadCount(member)).toBe(0);
    const list = await listNotifications(member);
    expect(list.every((n) => n.readAt !== null)).toBe(true);
  });
});
