import { PrismaClient, TaskStatus, TaskPriority } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensurePlans } from "../src/server/services/entitlements";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("taskforge-dev", 10);
  const emails = ["ada@taskforge.dev", "bob@taskforge.dev", "carol@taskforge.dev", "freddie@taskforge.dev"];
  await prisma.organization.deleteMany({ where: { slug: { in: ["acme", "freddie"] } } }); // cascades projects/tasks/comments/subscriptions/invoices
  await prisma.counter.deleteMany({ where: { key: { startsWith: "invoice_seq_" } } });
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

  await ensurePlans(prisma);
  const pro = await prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } });
  const periodEnd = new Date(Date.now() + 20 * 864e5);
  const sub = await prisma.subscription.create({
    data: { orgId: org.id, planId: pro.id, status: "ACTIVE", seats: 3, currentPeriodEnd: periodEnd },
  });
  // two paid invoices for the demo (advance the real counter so numbers never collide)
  const { nextCounter } = await import("../src/server/billing/invoiceNumber");
  const year = new Date().getFullYear();
  for (let i = 1; i <= 2; i++) {
    const n = await nextCounter(`invoice_seq_${year}`);
    const start = new Date(Date.now() - i * 30 * 864e5);
    const end = new Date(start.getTime() + 30 * 864e5);
    await prisma.invoice.create({
      data: {
        orgId: org.id, subscriptionId: sub.id, number: `INV-${year}-${String(n).padStart(4, "0")}`,
        status: "PAID", amountCents: 3000, periodStart: start, periodEnd: end, paidAt: start,
        lines: { create: [{ description: "Pro: 3 seats × 10.00/mo", amountCents: 3000 }] },
        payments: { create: [{ providerId: `fake_seed_${i}`, amountCents: 3000, status: "SUCCEEDED" }] },
      },
    });
  }

  // second org on the free plan, at its project limit (upsell demo)
  const freddie = await prisma.user.create({ data: { email: "freddie@taskforge.dev", name: "Freddie", passwordHash: pw } });
  const forg = await prisma.organization.create({
    data: { name: "Freddie's Shop", slug: "freddie", memberships: { create: { userId: freddie.id, role: "OWNER" } } },
  });
  for (let i = 1; i <= 3; i++) {
    const p = await prisma.project.create({ data: { orgId: forg.id, name: `Project ${i}`, key: `FRED-${i}` } });
    await prisma.board.create({ data: { projectId: p.id, name: "Main" } });
  }

  console.log("Seeded: 'acme' (pro, 3 seats, 2 invoices) + 'freddie' (free, at project limit).");
  console.log("Login: ada@taskforge.dev / taskforge-dev — also freddie@taskforge.dev");
}

main().finally(() => prisma.$disconnect());
