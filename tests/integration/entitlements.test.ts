import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getLimits, FREE_PLAN_SLUG, ensurePlans } from "@/server/services/entitlements";
import { createProjectWithBoard } from "@/server/services/projects";
import { createTask } from "@/server/services/tasks";
import { createInvitation } from "@/server/services/invitations";
import { PlanLimitError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, owner: string;

beforeAll(async () => {
  await ensurePlans(prisma);
  await prisma.organization.deleteMany({ where: { slug: { in: ["lim-free", "lim-pro"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["lo@lim.test", "lp@lim.test"] } } });
  owner = (await prisma.user.create({ data: { email: "lo@lim.test", name: "lo", passwordHash: "x" } })).id;
  const proOwner = (await prisma.user.create({ data: { email: "lp@lim.test", name: "lp", passwordHash: "x" } })).id;

  const free = await prisma.organization.create({
    data: { name: "LimFree", slug: "lim-free", memberships: { create: { userId: owner, role: "OWNER" } } },
  });
  orgId = free.id;
  const pro = await prisma.organization.create({
    data: {
      name: "LimPro", slug: "lim-pro",
      memberships: { create: { userId: proOwner, role: "OWNER" } },
      subscription: {
        create: {
          planId: (await prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } })).id,
          status: "ACTIVE", seats: 25, currentPeriodEnd: new Date(Date.now() + 86400_000),
        },
      },
    },
  });

  // fill free org to its project limit
  const limits = await getLimits(orgId);
  expect(limits.maxProjects).toBe(3);
  for (let i = 0; i < limits.maxProjects; i++) {
    await createProjectWithBoard(orgId, owner, `P${i}`);
  }
  // pro org starts empty
  expect((await getLimits(pro.id)).maxProjects).toBe(25);
});

describe("entitlements", () => {
  it("no subscription = free plan limits", async () => {
    const l = await getLimits(orgId);
    expect(l.planSlug).toBe(FREE_PLAN_SLUG);
    expect(l.maxMembers).toBe(3);
    expect(l.maxTasksPerOrg).toBe(100);
  });

  it("createProject blocked at free limit with PlanLimitError", async () => {
    await expect(createProjectWithBoard(orgId, owner, "One too many")).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("createTask blocked at org task limit", async () => {
    const board = (await prisma.board.findFirstOrThrow({ where: { project: { orgId } } }));
    // free limit is 100; already have 0 tasks — create 100 then expect block
    for (let i = 0; i < 100; i++) await createTask(orgId, owner, { boardId: board.id, title: `T${i}` });
    await expect(createTask(orgId, owner, { boardId: board.id, title: "101" })).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("invitation blocked at free member limit (members + pending count)", async () => {
    // org has 1 member; invite 2 (limit 3 total) then the 3rd invite must fail
    await createInvitation(orgId, owner, "a1@lim.test", "MEMBER");
    await createInvitation(orgId, owner, "a2@lim.test", "MEMBER");
    await expect(createInvitation(orgId, owner, "a3@lim.test", "MEMBER")).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("pro subscription raises limits", async () => {
    const pro = await prisma.organization.findUniqueOrThrow({ where: { slug: "lim-pro" } });
    const l = await getLimits(pro.id);
    expect(l.planSlug).toBe("pro");
    expect(l.maxProjects).toBe(25);
  });
});
