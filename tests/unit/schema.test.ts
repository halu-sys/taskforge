import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema", () => {
  it("user+org+membership+task round-trip", async () => {
    const user = await prisma.user.create({
      data: { email: "schema-rt@test.dev", name: "RT", passwordHash: "x" },
    });
    const org = await prisma.organization.create({
      data: { name: "RT Org", slug: "rt-org" },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: org.id, role: "OWNER" },
    });
    const plan = await prisma.plan.create({
      data: {
        slug: "rt-plan", name: "RT", priceCents: 0, maxMembers: 3,
        maxProjects: 1, maxTasksPerOrg: 5, features: {},
      },
    });
    const project = await prisma.project.create({
      data: { orgId: org.id, name: "RT Project", key: "RT1" },
    });
    const board = await prisma.board.create({
      data: { projectId: project.id, name: "Main" },
    });
    const task = await prisma.task.create({
      data: {
        boardId: board.id, orgId: org.id, number: 1, title: "RT task",
        createdById: user.id, labels: ["bug"],
      },
    });
    const loaded = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: { board: { include: { project: { include: { org: { include: { memberships: true, subscription: true } } } } } } },
    });
    expect(loaded.board.project.org.memberships[0].role).toBe("OWNER");
    expect(loaded.labels).toEqual(["bug"]);

    await prisma.subscription.create({
      data: { orgId: org.id, planId: plan.id, currentPeriodEnd: new Date() },
    });
    await prisma.organization.delete({ where: { id: org.id } }); // cascades task/board/project/subscription
    await prisma.plan.delete({ where: { id: plan.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("unique constraints enforced", async () => {
    const u = () => prisma.user.create({
      data: { email: "dup@test.dev", name: "D", passwordHash: "x" },
    });
    await u();
    await expect(u()).rejects.toThrow(/Unique constraint/i);
    await prisma.user.deleteMany({ where: { email: "dup@test.dev" } });
  });
});
