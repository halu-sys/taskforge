import { prisma } from "@/server/db";
import { PlanLimitError } from "@/server/errors";
import type { Plan } from "@prisma/client";

export const FREE_PLAN_SLUG = "free";

export const PLAN_CATALOG = [
  { slug: "free", name: "Free", priceCents: 0, interval: "MONTH" as const, maxMembers: 3, maxProjects: 3, maxTasksPerOrg: 100, features: ["kanban", "search"] },
  { slug: "pro", name: "Pro", priceCents: 1000, interval: "MONTH" as const, maxMembers: 25, maxProjects: 25, maxTasksPerOrg: 5000, features: ["kanban", "search", "billing", "priority-support"] },
  { slug: "business", name: "Business", priceCents: 2000, interval: "MONTH" as const, maxMembers: 999, maxProjects: 999, maxTasksPerOrg: 99999, features: ["kanban", "search", "billing", "priority-support", "audit-log"] },
];

// Idempotent; called by prisma/seed.ts and by integration tests.
export async function ensurePlans(client = prisma) {
  for (const p of PLAN_CATALOG) {
    await client.plan.upsert({ where: { slug: p.slug }, update: p, create: p });
  }
}

export type Limits = { planSlug: string; planName: string; priceCents: number; maxMembers: number; maxProjects: number; maxTasksPerOrg: number };

export async function getLimits(orgId: string): Promise<Limits> {
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    include: { plan: true },
  });
  // No subscription, or a canceled one, means free-plan limits.
  const free =
    (await prisma.plan.findUnique({ where: { slug: FREE_PLAN_SLUG } })) ??
    PLAN_CATALOG.find((p) => p.slug === FREE_PLAN_SLUG)!;
  const plan: Pick<Plan, "slug" | "name" | "priceCents" | "maxMembers" | "maxProjects" | "maxTasksPerOrg"> =
    sub && sub.status !== "CANCELED" ? sub.plan : free;
  return {
    planSlug: plan.slug, planName: plan.name, priceCents: plan.priceCents,
    maxMembers: plan.maxMembers, maxProjects: plan.maxProjects, maxTasksPerOrg: plan.maxTasksPerOrg,
  };
}

export async function assertWithinLimit(orgId: string, kind: "projects" | "members" | "tasks") {
  const limits = await getLimits(orgId);
  if (kind === "projects") {
    const n = await prisma.project.count({ where: { orgId, archivedAt: null } });
    if (n >= limits.maxProjects) throw new PlanLimitError(`The ${limits.planName} plan allows up to ${limits.maxProjects} projects`);
  } else if (kind === "tasks") {
    const n = await prisma.task.count({ where: { orgId } });
    if (n >= limits.maxTasksPerOrg) throw new PlanLimitError(`The ${limits.planName} plan allows up to ${limits.maxTasksPerOrg} tasks`);
  } else {
    const members = await prisma.membership.count({ where: { orgId } });
    const pending = await prisma.invitation.count({ where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } } });
    if (members + pending >= limits.maxMembers) throw new PlanLimitError(`The ${limits.planName} plan allows up to ${limits.maxMembers} members`);
  }
}
