import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { search } from "@/server/services/search";
import { createTask } from "@/server/services/tasks";

const prisma = new PrismaClient();
let orgA: string, orgB: string, userA: string, userB: string;
let boardA: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["srch-a", "srch-b"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["a@srch.test", "b@srch.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e, passwordHash: "x" } });
  userA = (await mk("a@srch.test")).id;
  userB = (await mk("b@srch.test")).id;
  const a = await prisma.organization.create({
    data: { name: "Alpha", slug: "srch-a", memberships: { create: { userId: userA, role: "OWNER" } } },
  });
  const b = await prisma.organization.create({
    data: { name: "Beta", slug: "srch-b", memberships: { create: { userId: userB, role: "OWNER" } } },
  });
  orgA = a.id; orgB = b.id;
  const pa = await prisma.project.create({ data: { orgId: orgA, name: "Payments Revamp", key: "SRCH-1" } });
  boardA = (await prisma.board.create({ data: { projectId: pa.id, name: "Main" } })).id;
  await createTask(orgA, userA, { boardId: boardA, title: "Fix invoice PDF rendering" });
  await createTask(orgA, userA, { boardId: boardA, title: "Unrelated chore" });
  const pb = await prisma.project.create({ data: { orgId: orgB, name: "Payments Rival", key: "SRCHB-1" } });
  const boardB = (await prisma.board.create({ data: { projectId: pb.id, name: "Main" } })).id;
  await createTask(orgB, userB, { boardId: boardB, title: "Fix invoice PDF rendering too" });
});

describe("search", () => {
  it("finds tasks + projects, case-insensitive", async () => {
    const r = await search(orgA, userA, "invoice");
    expect(r.tasks.some((t) => t.title.includes("PDF"))).toBe(true);
    const r2 = await search(orgA, userA, "PAYMENTS");
    expect(r2.projects.some((p) => p.name.includes("Payments"))).toBe(true);
  });

  it("tenant isolation: user A never sees org B results", async () => {
    const r = await search(orgA, userA, "invoice PDF rendering");
    expect(r.tasks.every((t) => t.orgId === orgA)).toBe(true);
    expect(r.tasks.some((t) => t.title.includes("too"))).toBe(false);
    const rp = await search(orgA, userA, "Rival");
    expect(rp.projects).toHaveLength(0);
  });

  it("empty query returns empty", async () => {
    const r = await search(orgA, userA, "   ");
    expect(r.tasks).toHaveLength(0);
    expect(r.projects).toHaveLength(0);
  });

  it("non-member forbidden", async () => {
    await expect(search(orgA, userB, "invoice")).rejects.toThrow(/forbidden|not found/i);
  });
});
