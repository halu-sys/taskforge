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
    <main className="page-narrow space-y-6">
      <a href={`/org/${slug}/billing`} className="link text-sm">&larr; Billing</a>
      <h1 className="h1">{inv.number}</h1>
      <p className="text-sm muted">
        {dt(inv.periodStart)} – {dt(inv.periodEnd)} · status:{" "}
        <span className={`badge ${inv.status === "PAID" ? "badge-ok" : inv.status === "UNCOLLECTED" ? "badge-danger" : ""}`}>{inv.status}</span>
        {inv.paidAt && <> · paid {dt(inv.paidAt)}</>}
      </p>
      <div className="card overflow-hidden">
      <table className="table">
        <thead><tr><th>Description</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td style={{textAlign:"right"}}>{fmt(l.amountCents)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Total</td><td style={{textAlign:"right"}}>{fmt(inv.amountCents)}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <section className="text-sm space-y-1">
        <h2 className="font-medium">Payments</h2>
        {inv.payments.map((p) => (
          <p key={p.id} className="muted">
            {fmt(p.amountCents)} · {p.status} · {dt(p.createdAt)}{p.providerId ? ` · ${p.providerId}` : ""}
          </p>
        ))}
      </section>
    </main>
  );
}
