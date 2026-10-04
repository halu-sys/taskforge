// Manual/batch renewal runner: node --experimental-strip-types or tsx.
// Usage: npx tsx scripts/renew.ts
import { PrismaClient } from "@prisma/client";
import { renewSubscription } from "../src/server/services/subscriptions";
import { FakeProvider } from "../src/server/billing/provider";

const prisma = new PrismaClient();

async function main() {
  const due = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lt: new Date() } },
  });
  for (const sub of due) {
    const res = await renewSubscription(sub.orgId, null, new FakeProvider());
    console.log(`${sub.orgId}: ${res.outcome}`);
  }
  console.log(`${due.length} subscription(s) processed.`);
}

main().finally(() => prisma.$disconnect());
