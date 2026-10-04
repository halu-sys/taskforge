import { PrismaClient, TaskStatus, TaskPriority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("taskforge-dev", 10);
  const emails = ["ada@taskforge.dev", "bob@taskforge.dev", "carol@taskforge.dev"];
  await prisma.organization.deleteMany({ where: { slug: "acme" } }); // cascades projects/tasks/comments
  await prisma.notification.deleteMany({ where: { user: { email: { in: emails } } } });
  await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

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

  // Projects + boards + tasks
  const p1 = await prisma.project.create({ data: { orgId: org.id, name: "Website Relaunch", key: "ACME-1" } });
  const p2 = await prisma.project.create({ data: { orgId: org.id, name: "Mobile App", key: "ACME-2" } });
  const b1 = (await prisma.board.create({ data: { projectId: p1.id, name: "Main" } })).id;
  const b2 = (await prisma.board.create({ data: { projectId: p2.id, name: "Main" } })).id;

  const seedTasks = [
    { board: b1, n: 1, title: "Audit current landing page", status: "DONE", assignee: ada.id },
    { board: b1, n: 2, title: "New hero copy", status: "IN_PROGRESS", assignee: bob.id, priority: "HIGH" },
    { board: b1, n: 3, title: "Migrate blog to MDX", status: "TODO", labels: ["content"] },
    { board: b1, n: 4, title: "SEO audit", status: "BACKLOG", priority: "MEDIUM" },
    { board: b1, n: 5, title: "Design review with team", status: "IN_REVIEW", assignee: carol.id },
    { board: b2, n: 1, title: "Set up React Native shell", status: "DONE", assignee: bob.id },
    { board: b2, n: 2, title: "Push notifications spike", status: "TODO", priority: "URGENT", assignee: bob.id },
    { board: b2, n: 3, title: "Offline mode research", status: "BACKLOG" },
    { board: b2, n: 4, title: "Crash reporting integration", status: "TODO", labels: ["infra"] },
    { board: b2, n: 5, title: "Beta test flight setup", status: "BACKLOG", assignee: carol.id },
  ];
  const tasks = [];
  for (const t of seedTasks) {
    tasks.push(await prisma.task.create({
      data: {
        boardId: t.board, orgId: org.id, number: t.n, title: t.title,
        status: t.status as TaskStatus, assigneeId: t.assignee, priority: (t.priority ?? "MEDIUM") as TaskPriority,
        labels: t.labels ?? [], createdById: ada.id, position: t.n * 1000,
      },
    }));
  }
  await prisma.project.update({ where: { id: p1.id }, data: { nextNumber: 6 } });
  await prisma.project.update({ where: { id: p2.id }, data: { nextNumber: 6 } });

  await prisma.comment.create({ data: { taskId: tasks[1].id, authorId: carol.id, body: "Draft attached, ping @bob for review" } });
  await prisma.comment.create({ data: { taskId: tasks[1].id, authorId: bob.id, body: "On it" } });
  await prisma.comment.create({ data: { taskId: tasks[6].id, authorId: ada.id, body: "Prioritize this for sprint 1" } });

  for (const t of tasks.slice(0, 5)) {
    await prisma.activityEvent.create({ data: { orgId: org.id, actorId: ada.id, verb: "task.created", targetType: "task", targetId: t.id, projectId: p1.id, payload: { title: t.title } } });
  }
  for (const t of tasks.slice(5)) {
    await prisma.activityEvent.create({ data: { orgId: org.id, actorId: bob.id, verb: "task.created", targetType: "task", targetId: t.id, projectId: p2.id, payload: { title: t.title } } });
  }
  await prisma.notification.create({ data: { userId: bob.id, verb: "mention", link: `/org/acme/tasks/${tasks[1].id}` } });
  await prisma.notification.create({ data: { userId: carol.id, verb: "assigned", link: `/org/acme/tasks/${tasks[4].id}` } });

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
