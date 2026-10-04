import { prisma } from "@/server/db";
import { requireMembership } from "@/server/services/orgs";
import { NotFoundError } from "@/server/errors";

export async function listInvoices(orgId: string, actorId: string) {
  await requireMembership(orgId, actorId);
  return prisma.invoice.findMany({
    where: { orgId },
    include: { lines: true },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
}

export async function getInvoice(orgId: string, actorId: string, invoiceId: string) {
  await requireMembership(orgId, actorId);
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    include: { lines: true, payments: true },
  });
  if (!inv) throw new NotFoundError("Invoice not found");
  return inv;
}
