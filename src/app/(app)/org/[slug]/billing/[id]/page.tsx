import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect, notFound } from "next/navigation";
import { getInvoice } from "@/server/services/invoices";
import { NotFoundError, ForbiddenError } from "@/server/errors";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const dt = (d: Date) => d.toISOString().slice(0, 10);

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");

  let inv;
  try {
    inv = await getInvoice(org.id, session.userId, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <a href={`/org/${slug}/billing`} className="text-sm underline">&larr; Billing</a>
      <h1 className="text-2xl font-bold">{inv.number}</h1>
      <p className="text-sm text-gray-600">
        {dt(inv.periodStart)} – {dt(inv.periodEnd)} · status: <span className="font-medium">{inv.status}</span>
        {inv.paidAt && <> · paid {dt(inv.paidAt)}</>}
      </p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th className="py-1">Description</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="py-1">{l.description}</td>
              <td className="text-right">{fmt(l.amountCents)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td>Total</td><td className="text-right">{fmt(inv.amountCents)}</td>
          </tr>
        </tbody>
      </table>
      <section className="text-sm space-y-1">
        <h2 className="font-medium">Payments</h2>
        {inv.payments.map((p) => (
          <p key={p.id} className="text-gray-600">
            {fmt(p.amountCents)} · {p.status} · {dt(p.createdAt)}{p.providerId ? ` · ${p.providerId}` : ""}
          </p>
        ))}
      </section>
    </main>
  );
}
