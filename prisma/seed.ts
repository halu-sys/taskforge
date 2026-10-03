import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("taskforge-dev", 10);
  const emails = ["ada@taskforge.dev", "bob@taskforge.dev", "carol@taskforge.dev"];
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.organization.deleteMany({ where: { slug: "acme" } });

  const ada = await prisma.user.create({ data: { email: emails[0], name: "Ada", passwordHash: pw } });
  const bob = await prisma.user.create({ data: { email: emails[1], name: "Bob", passwordHash: pw } });
  const carol = await prisma.user.create({ data: { email: emails[2], name: "Carol", passwordHash: pw } });

  const org = await prisma.organization.create({
    data: {
      name: "Acme Inc", slug: "acme",
      memberships: { create: [
        { userId: ada.id, role: "OWNER" },
        { userId: bob.id, role: "ADMIN" },
        { userId: carol.id, role: "MEMBER" },
      ] },
    },
  });

  const plan = await prisma.plan.upsert({
    where: { slug: "free" },
    update: {},
    create: { slug: "free", name: "Free", priceCents: 0, maxMembers: 3, maxProjects: 2, maxTasksPerOrg: 20, features: {} },
  });
  await prisma.plan.upsert({
    where: { slug: "pro" },
    update: {},
    create: { slug: "pro", name: "Pro", priceCents: 1000, maxMembers: 20, maxProjects: 20, maxTasksPerOrg: 500, features: {} },
  });
  await prisma.plan.upsert({
    where: { slug: "team" },
    update: {},
    create: { slug: "team", name: "Team", priceCents: 2500, maxMembers: 100, maxProjects: 100, maxTasksPerOrg: 5000, features: {} },
  });
  await prisma.subscription.create({
    data: { orgId: org.id, planId: plan.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });

  console.log("Seeded: org 'acme' (ada=OWNER, bob=ADMIN, carol=MEMBER), plans free/pro/team.");
  console.log("Login: ada@taskforge.dev / taskforge-dev");
}

main().finally(() => prisma.$disconnect());
