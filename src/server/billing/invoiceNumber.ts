import { prisma } from "@/server/db";
import type { Prisma } from "@prisma/client";

// Per-key atomic counter (e.g. invoice numbers per year).
export async function nextCounter(
  key: string,
  client: Prisma.TransactionClient = prisma,
): Promise<number> {
  // single atomic statement; RETURNING avoids snapshot staleness
  const rows = await client.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return rows[0].value;
}

export async function nextInvoiceNumber(client?: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const n = await nextCounter(`invoice_seq_${year}`, client);
  return `INV-${year}-${String(n).padStart(4, "0")}`;
}
