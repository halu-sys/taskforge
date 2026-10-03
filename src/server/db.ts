import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const testUrl = process.env.TEST_DATABASE_URL;
    const url = process.env.NODE_ENV === "test" && testUrl ? testUrl : process.env.DATABASE_URL;
    globalForPrisma.prisma = new PrismaClient({ datasources: { db: { url } } });
  }
  return globalForPrisma.prisma;
}

export const prisma = getPrisma();
