import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTask, updateTask, moveTask, deleteTask, getTask } from "@/server/services/tasks";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, otherOrgId: string, owner: string, member: string, outsider: string;
let projectId: string, boardId: string, otherBoardId: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["task-test", "task-other"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["o@task.test", "m@task.test", "x@task.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e, passwordHash: "x" } });
  owner = (await mk("o@task.test")).id;
  member = (await mk("m@task.test")).id;
  outsider = (await mk("x@task.test")).id;
  const org = await prisma.organization.create({
    data: { name: "Task", slug: "task-test",
      memberships: { create: [
        { userId: owner, role: "OWNER" },
        { userId: member, role: "MEMBER" },
      ] } },
  });
  orgId = org.id;
  const other = await prisma.organization.create({
    data: { name: "Other", slug: "task-other", memberships: { create: { userId: outsider, role: "OWNER" } } },
  });
  otherOrgId = other.id;

  const p = await prisma.project.create({ data: { orgId, name: "P", key: "TASK-1" } });
  projectId = p.id;
  boardId = (await prisma.board.create({ data: { projectId, name: "Main" } })).id;
  otherBoardId = (await prisma.board.create({ data: { projectId, name: "Second" } })).id;
});

describe("tasks", () => {
  it("createTask: sequential number, increments project counter", async () => {
    const t1 = await createTask(orgId, member, { boardId, title: "First" });
    const t2 = await createTask(orgId, member, { boardId, title: "Second" });
    expect(t1.number).toBe(1);
    expect(t2.number).toBe(2);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.nextNumber).toBe(3);
  });

  it("outsider cannot create", async () => {
    await expect(createTask(orgId, outsider, { boardId, title: "Nope" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assignee must be org member", async () => {
    await expect(createTask(orgId, member, { boardId, title: "Bad assignee", assigneeId: outsider }))
      .rejects.toThrow(/member/i);
  });

  it("updateTask fields", async () => {
    const t = await createTask(orgId, member, { boardId, title: "Upd" });
    const u = await updateTask(orgId, member, t.id, {
      title: "Updated", priority: "HIGH", labels: ["bug", "ui"], dueDate: new Date("2026-12-01"),
    });
    expect(u.title).toBe("Updated");
    expect(u.priority).toBe("HIGH");
    expect(u.labels).toEqual(["bug", "ui"]);
  });

  it("moveTask cross-board + status + position", async () => {
    const t = await createTask(orgId, member, { boardId, title: "Move" });
    const m = await moveTask(orgId, member, t.id, { boardId: otherBoardId, status: "IN_PROGRESS", position: 500 });
    expect(m.boardId).toBe(otherBoardId);
    expect(m.status).toBe("IN_PROGRESS");
    expect(m.position).toBe(500);
  });

  it("getTask cross-org forbidden", async () => {
    const t = await createTask(orgId, member, { boardId, title: "Secret" });
    await expect(getTask(otherOrgId, outsider, t.id)).rejects.toThrow(/not found/i);
  });

  it("deleteTask removes", async () => {
    const t = await createTask(orgId, member, { boardId, title: "Del" });
    await deleteTask(orgId, member, t.id);
    expect(await prisma.task.findUnique({ where: { id: t.id } })).toBeNull();
  });

  it("MEMBER cannot delete others' tasks? — spec: own work + assigned; owner can", async () => {
    const t = await createTask(orgId, owner, { boardId, title: "Owner task" });
    // member not assignee, not creator -> forbidden
    await expect(deleteTask(orgId, member, t.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteTask(orgId, owner, t.id);
  });

  it("concurrent createTask mints distinct numbers (CAS)", async () => {
    const ts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTask(orgId, member, { boardId, title: `Race ${i}` })),
    );
    const numbers = new Set(ts.map((t) => t.number));
    expect(numbers.size).toBe(5);
  });

  it("moveTask rebalances when neighbors get too close", async () => {
    const b = (await prisma.board.create({ data: { projectId, name: "Rebal" } })).id;
    const a = await createTask(orgId, member, { boardId: b, title: "A" });
    const c = await createTask(orgId, member, { boardId: b, title: "C" });
    // dense positions: gap < 0.01 must trigger a full-column rewrite to step-1000 spacing
    await prisma.task.update({ where: { id: c.id }, data: { position: a.position + 0.001 } });
    const m = await createTask(orgId, member, { boardId: b, title: "M" });
    await moveTask(orgId, member, m.id, { boardId: b, status: "TODO", position: a.position + 0.0005 });
    const col = await prisma.task.findMany({ where: { boardId: b }, orderBy: { position: "asc" } });
    const gaps = col.slice(1).map((t, i) => t.position - col[i].position);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1);
  });

  it("moveTask logs task.moved activity", async () => {
    const t = await createTask(orgId, member, { boardId: otherBoardId, title: "Act" });
    await moveTask(orgId, member, t.id, { boardId, status: "IN_PROGRESS", position: 99999 });
    const ev = await prisma.activityEvent.findFirst({ where: { targetId: t.id, verb: "task.moved" } });
    expect(ev).not.toBeNull();
  });

  it("invalid priority/status rejected with ValidationError", async () => {
    const t = await createTask(orgId, member, { boardId, title: "Enum" });
    await expect(updateTask(orgId, member, t.id, { priority: "NOPE" as never }))
      .rejects.toThrow(/priority/i);
    await expect(moveTask(orgId, member, t.id, { boardId, status: "NOPE" as never, position: 1 }))
      .rejects.toThrow(/status/i);
  });
});
