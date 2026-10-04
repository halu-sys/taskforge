import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const org = await p.organization.findUnique({ where: { slug: 'acme' } });
const board = await p.board.findFirst({ where: { project: { orgId: org.id } } });
let t = await p.task.findFirst({ where: { orgId: org.id } });
if (!t) {
  const ada = await p.user.findUnique({ where: { email: 'ada@taskforge.dev' } });
  t = await p.task.create({ data: { boardId: board.id, orgId: org.id, number: 1, title: 'Draft Q4 roadmap', createdById: ada.id } });
}
console.log(t.id);
await p.$disconnect();
