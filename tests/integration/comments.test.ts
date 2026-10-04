import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addComment, listComments } from "@/server/services/comments";
import { createTask } from "@/server/services/tasks";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, otherOrgId: string, owner: string, member: string, outsider: string;
let boardId: string, taskId: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["cmt-test", "cmt-other"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["o@cmt.test", "m@cmt.test", "x@cmt.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e.split("@")[0], passwordHash: "x" } });
  owner = (await mk("o@cmt.test")).id;
  member = (await mk("m@cmt.test")).id;
  outsider = (await mk("x@cmt.test")).id;
  const org = await prisma.organization.create({
    data: { name: "Cmt", slug: "cmt-test",
      memberships: { create: [
        { userId: owner, role: "OWNER" },
        { userId: member, role: "MEMBER" },
      ] } },
  });
  orgId = org.id;
  const other = await prisma.organization.create({
    data: { name: "Other", slug: "cmt-other", memberships: { create: { userId: outsider, role: "OWNER" } } },
  });
  otherOrgId = other.id;
  const p = await prisma.project.create({ data: { orgId, name: "P", key: "CMT-1" } });
  boardId = (await prisma.board.create({ data: { projectId: p.id, name: "Main" } })).id;
  taskId = (await createTask(orgId, owner, { boardId, title: "Cmt task" })).id;
});

describe("comments", () => {
  it("member adds comment; outsider forbidden", async () => {
    const c = await addComment(orgId, member, taskId, "Looks good");
    expect(c.body).toBe("Looks good");
    await expect(addComment(orgId, outsider, taskId, "spam")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("comment on other-org task forbidden", async () => {
    await expect(addComment(otherOrgId, outsider, taskId, "steal")).rejects.toThrow(/not found/i);
  });

  it("empty comment rejected", async () => {
    await expect(addComment(orgId, member, taskId, "   ")).rejects.toThrow(/empty|invalid/i);
  });

  it("@mention creates notification for matched member (not self)", async () => {
    await addComment(orgId, owner, taskId, "ping @m please review");
    const n = await prisma.notification.findFirst({
      where: { userId: member, verb: "mention" },
      orderBy: { createdAt: "desc" },
    });
    expect(n).not.toBeNull();
    expect(n!.link).toContain(taskId);
    const self = await prisma.notification.findFirst({
      where: { userId: owner, verb: "mention" },
    });
    expect(self).toBeNull();
  });

  it("listComments org-scoped, chronological", async () => {
    const list = await listComments(orgId, member, taskId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].createdAt.getTime()).toBeLessThanOrEqual(list[1].createdAt.getTime());
  });
});
