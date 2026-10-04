import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { getSubscription, expireIfNeeded, renewSubscription } from "@/server/services/subscriptions";
import { listInvoices } from "@/server/services/invoices";
import { PLAN_CATALOG } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { requireRole } from "@/server/services/orgs";
import {
  checkoutAction, cancelAtPeriodEndAction, resumeAction, changeSeatsAction, retryPaymentAction,
} from "@/server/services/billing-actions";
import { NotFoundError, ForbiddenError } from "@/server/errors";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const dt = (d: Date) => d.toISOString().slice(0, 10);

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { error, ok } = await searchParams;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");

  // membership FIRST, then lazy renewal/expiry (system actor after check)
  try {
    await requireRole(org.id, session.userId, "MEMBER");
    await expireIfNeeded(org.id, null);
    await renewSubscription(org.id, null, new FakeProvider());
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) redirect(`/org/${slug}`);
    // renewal failures are surfaced via the PAST_DUE banner, not thrown
  }

  let sub, invoices;
  try {
    sub = await getSubscription(org.id, session.userId);
    invoices = await listInvoices(org.id, session.userId);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) redirect(`/org/${slug}`);
    throw e;
  }

  const members = await prisma.membership.count({ where: { orgId: org.id } });
  let isOwner = false;
  try { await requireRole(org.id, session.userId, "OWNER"); isOwner = true; } catch { /* not owner */ }

  const planSlug = sub?.status !== "CANCELED" ? sub?.plan.slug ?? "free" : "free";

  return (
    <main className="page-narrow space-y-8">
      <h1 className="h1">Billing</h1>

      {error && <div className="banner-danger">{error}</div>}
      {ok && <div className="banner-ok">{ok}</div>}

      {sub && sub.status === "PAST_DUE" && (
        <div className="banner-warn space-y-2">
          <p>Payment failed ({sub.dunningFailures}/3). After 3 failures the subscription is canceled.</p>
          {isOwner && (
            <form action={retryPaymentAction.bind(null, slug)} className="flex gap-2">
              <input name="card" placeholder="Card number" defaultValue="4242424242424242" className="input" />
              <button className="btn btn-primary">Retry payment</button>
            </form>
          )}
        </div>
      )}

      <section className="card p-5 space-y-2">
        <h2 className="h2">
          Current plan: {sub && sub.status !== "CANCELED" ? sub.plan.name : "Free"}
          {sub && sub.status !== "CANCELED" && (
            <span className={`ml-2 badge ${sub.status === "ACTIVE" ? "badge-ok" : "badge-warn"}`}>{sub.status}</span>
          )}
        </h2>
        {sub && sub.status !== "CANCELED" ? (
          <>
            <p className="text-sm muted">{sub.seats} seat(s) · {fmt(sub.plan.priceCents)}/seat/mo · renews {dt(sub.currentPeriodEnd)}</p>
            {sub.cancelAtPeriodEnd && (
              <p className="text-sm warn">Cancels at period end.</p>
            )}
            {isOwner && (
              <div className="flex gap-2 pt-2">
                <form action={changeSeatsAction.bind(null, slug)} className="flex gap-2">
                  <input type="number" name="seats" min={members} defaultValue={sub.seats} className="input w-20" />
                  <button className="btn">Update seats</button>
                </form>
                {sub.cancelAtPeriodEnd ? (
                  <form action={resumeAction.bind(null, slug)}>
                    <button className="btn btn-primary">Resume</button>
                  </form>
                ) : (
                  <form action={cancelAtPeriodEndAction.bind(null, slug)}>
                    <button className="btn btn-danger">Cancel at period end</button>
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm muted">Free plan · {members} member(s)</p>
        )}
      </section>

      {isOwner && (
        <section className="space-y-3">
          <h2 className="h2">Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLAN_CATALOG.map((p) => (
              <div key={p.slug} className={`card p-4 space-y-2 ${p.slug === planSlug ? "outline outline-2 outline-accent" : ""}`}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-2xl font-bold">{p.priceCents === 0 ? "Free" : fmt(p.priceCents)}<span className="text-sm muted font-normal">/seat/mo</span></p>
                <ul className="text-sm muted space-y-0.5">
                  <li>{p.maxMembers} members</li>
                  <li>{p.maxProjects} projects</li>
                  <li>{p.maxTasksPerOrg.toLocaleString()} tasks</li>
                </ul>
                {p.slug !== "free" && p.slug !== planSlug && (
                  <form action={checkoutAction.bind(null, slug)} className="space-y-2 pt-1">
                    <input type="hidden" name="plan" value={p.slug} />
                    <input name="card" placeholder="Card number" defaultValue="4242424242424242" className="input w-full" />
                    <p className="text-xs faint">4000000000000002 always declines (demo).</p>
                    <button className="btn btn-primary w-full justify-center">
                      {planSlug === "free" ? "Subscribe" : "Switch"} to {p.name}
                    </button>
                  </form>
                )}
                {p.slug === planSlug && <span className="badge badge-accent">current</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="h2">Invoices</h2>
        <div className="card overflow-hidden">
        <table className="table">
          <thead><tr>
            <th>Number</th><th>Period</th><th>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <a className="link" href={`/org/${slug}/billing/${inv.id}`}>{inv.number}</a>
                </td>
                <td className="muted">{dt(inv.periodStart)} – {dt(inv.periodEnd)}</td>
                <td>{fmt(inv.amountCents)}</td>
                <td>
                  <span className={`badge ${inv.status === "PAID" ? "badge-ok" : inv.status === "UNCOLLECTED" ? "badge-danger" : ""}`}>{inv.status}</span>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={4} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
