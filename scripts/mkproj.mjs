import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const org = await p.organization.findUnique({ where: { slug: 'acme' } });
let proj = await p.project.findUnique({ where: { orgId_key: { orgId: org.id, key: 'ACME-1' } } });
if (!proj) {
  proj = await p.project.create({ data: { orgId: org.id, name: 'Website Relaunch', key: 'ACME-1' } });
  await p.board.create({ data: { projectId: proj.id, name: 'Main' } });
}
console.log(proj.key);
await p.$disconnect();
