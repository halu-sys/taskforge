import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
const p = new PrismaClient();
const u = await p.user.findUnique({ where: { email: 'ada@taskforge.dev' } });
const token = crypto.randomBytes(32).toString('hex');
await p.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now()+864e5) } });
console.log(token);
await p.$disconnect();
