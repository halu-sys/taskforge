import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { getSubscription, expireIfNeeded, renewSubscription } from "@/server/services/subscriptions";
import { listInvoices } from "@/server/services/invoices";
import { PLAN_CATALOG } from "@/server/services/entitlements";
import { FakeProvider } from "@/server/billing/provider";
import { requireRole } from "@/server/services/orgs";
import {
  checkoutAction, cancelAtPeriodEndAction, resumeAction, changeSeatsAction,
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

  // lazy renewal/expiry on billing read
  try {
    await expireIfNeeded(org.id);
    await renewSubscription(org.id, new FakeProvider());
  } catch { /* best-effort */ }

  let sub, invoices;
  try {
    sub = await getSubscription(org.id);
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
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Billing</h1>

      {error && <div className="rounded bg-red-100 text-red-800 p-3">{error}</div>}
      {ok && <div className="rounded bg-green-100 text-green-800 p-3">{ok}</div>}

      {sub && sub.status === "PAST_DUE" && (
        <div className="rounded bg-amber-100 text-amber-900 p-3">
          Payment failed ({sub.dunningFailures}/3). The next billing-page visit retries automatically.
          After 3 failures the subscription is canceled.
        </div>
      )}

      <section className="rounded border p-4 space-y-2">
        <h2 className="font-semibold text-lg">
          Current plan: {sub && sub.status !== "CANCELED" ? sub.plan.name : "Free"}
          {sub && sub.status !== "CANCELED" && <span className="ml-2 text-sm text-gray-500">({sub.status})</span>}
        </h2>
        {sub && sub.status !== "CANCELED" ? (
          <>
            <p className="text-sm">{sub.seats} seat(s) · {fmt(sub.plan.priceCents)}/seat/mo · renews {dt(sub.currentPeriodEnd)}</p>
            {sub.cancelAtPeriodEnd && (
              <p className="text-sm text-amber-700">Cancels at period end.</p>
            )}
            {isOwner && (
              <div className="flex gap-2 pt-2">
                <form action={changeSeatsAction.bind(null, slug)} className="flex gap-2">
                  <input type="number" name="seats" min={members} defaultValue={sub.seats} className="border rounded p-1 w-20" />
                  <button className="rounded bg-gray-800 text-white px-3 py-1">Update seats</button>
                </form>
                {sub.cancelAtPeriodEnd ? (
                  <form action={resumeAction.bind(null, slug)}>
                    <button className="rounded border px-3 py-1">Resume</button>
                  </form>
                ) : (
                  <form action={cancelAtPeriodEndAction.bind(null, slug)}>
                    <button className="rounded border border-red-300 text-red-700 px-3 py-1">Cancel at period end</button>
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm">Free plan · {members} member(s)</p>
        )}
      </section>

      {isOwner && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Plans</h2>
          <div className="grid grid-cols-3 gap-3">
            {PLAN_CATALOG.map((p) => (
              <div key={p.slug} className={`rounded border p-3 space-y-2 ${p.slug === planSlug ? "ring-2 ring-blue-500" : ""}`}>
                <h3 className="font-medium">{p.name}</h3>
                <p className="text-2xl">{p.priceCents === 0 ? "Free" : fmt(p.priceCents)}<span className="text-sm text-gray-500">/seat/mo</span></p>
                <ul className="text-sm text-gray-600">
                  <li>{p.maxMembers} members</li>
                  <li>{p.maxProjects} projects</li>
                  <li>{p.maxTasksPerOrg.toLocaleString()} tasks</li>
                </ul>
                {p.slug !== "free" && p.slug !== planSlug && (
                  <form action={checkoutAction.bind(null, slug)} className="space-y-2">
                    <input type="hidden" name="plan" value={p.slug} />
                    <input name="card" placeholder="Card number" defaultValue="4242424242424242" className="border rounded p-1 w-full text-sm" />
                    <p className="text-xs text-gray-400">4000000000000002 always declines (demo).</p>
                    <button className="rounded bg-blue-600 text-white px-3 py-1 w-full">
                      {planSlug === "free" ? "Subscribe" : "Switch"} to {p.name}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Invoices</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500">
            <th className="py-1">Number</th><th>Period</th><th>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="py-1">
                  <a className="underline" href={`/org/${slug}/billing/${inv.id}`}>{inv.number}</a>
                </td>
                <td>{dt(inv.periodStart)} – {dt(inv.periodEnd)}</td>
                <td>{fmt(inv.amountCents)}</td>
                <td className={inv.status === "PAID" ? "text-green-700" : inv.status === "UNCOLLECTED" ? "text-red-700" : ""}>{inv.status}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
