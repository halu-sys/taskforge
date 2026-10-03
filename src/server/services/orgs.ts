import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import type { Role } from "@prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createOrg(userId: string, name: string): Promise<string> {
  const base = slugify(name) || "workspace";
  let slug = base;
  for (let i = 2; await prisma.organization.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      memberships: { create: { userId, role: "OWNER" } },
    },
  });
  return org.slug;
}

export async function requireMembership(orgId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!m) throw new ForbiddenError();
  return m;
}

export async function requireRole(
  orgId: string,
  userId: string,
  min: Role,
) {
  const m = await requireMembership(orgId, userId);
  const rank: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };
  if (rank[m.role] < rank[min]) throw new ForbiddenError("Insufficient role");
  return m;
}

export async function getOrgBySlug(slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}
