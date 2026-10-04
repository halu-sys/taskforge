import { prisma } from "@/server/db";
import { requireRole } from "@/server/services/orgs";
import { ValidationError, NotFoundError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { prorate } from "@/server/billing/proration";
import { nextInvoiceNumber } from "@/server/billing/invoiceNumber";
import type { PaymentProvider } from "@/server/billing/provider";
import type { Invoice, Subscription } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionWithPlan = Subscription & { plan: { slug: string; name: string; priceCents: number } };

export async function getSubscription(orgId: string): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
}

function addInterval(from: Date, interval: "MONTH" | "YEAR"): Date {
  const d = new Date(from.getTime());
  if (interval === "YEAR") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// OWNER-only. Creating or switching plans. Payment/invoice creation is T3's
// checkout flow; this core function just manages the subscription row.
export async function subscribe(orgId: string, actorId: string, planSlug: string): Promise<SubscriptionWithPlan> {
  await requireRole(orgId, actorId, "OWNER");
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || plan.slug === "free") throw new ValidationError("Unknown plan");

  const existing = await prisma.subscription.findUnique({ where: { orgId } });
  if (existing && existing.planId === plan.id && existing.status !== "CANCELED") {
    return getSubscription(orgId) as Promise<SubscriptionWithPlan>;
  }

  const periodEnd = addInterval(new Date(), plan.interval);
  const sub = await prisma.subscription.upsert({
    where: { orgId },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      dunningFailures: 0,
    },
    create: {
      orgId, planId: plan.id, status: "ACTIVE", currentPeriodEnd: periodEnd,
    },
  });
  await logActivity(orgId, actorId, "subscription.changed", "subscription", sub.id, null, { plan: plan.slug });
  return getSubscription(orgId) as Promise<SubscriptionWithPlan>;
}

export async function setCancelAtPeriodEnd(orgId: string, actorId: string, value: boolean): Promise<SubscriptionWithPlan> {
  await requireRole(orgId, actorId, "OWNER");
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub || sub.status === "CANCELED") throw new NotFoundError("No active subscription");
  await prisma.subscription.update({ where: { orgId }, data: { cancelAtPeriodEnd: value } });
  return getSubscription(orgId) as Promise<SubscriptionWithPlan>;
}

export async function resume(orgId: string, actorId: string) {
  return setCancelAtPeriodEnd(orgId, actorId, false);
}

// Lazy expiry: called on billing reads. A sub past its period end with
// cancelAtPeriodEnd set is canceled; org limits then fall back to free.
export async function expireIfNeeded(orgId: string) {
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub || sub.status === "CANCELED") return;
  if (sub.currentPeriodEnd < new Date() && sub.cancelAtPeriodEnd) {
    await prisma.subscription.update({ where: { orgId }, data: { status: "CANCELED" } });
    await logActivity(orgId, null, "subscription.canceled", "subscription", sub.id, null, { reason: "period_end" });
  }
}

// Seat changes on an ACTIVE subscription. Increase = immediate prorated
// charge (invoice PAID via provider). Decrease = no refund; new seat count
// takes effect for the NEXT invoice.
export async function changeSeats(
  orgId: string,
  actorId: string,
  newSeats: number,
  provider: PaymentProvider,
  card = "4242424242424242",
): Promise<{ subscription: Subscription; invoice: Invoice | null }> {
  await requireRole(orgId, actorId, "OWNER");
  if (!Number.isInteger(newSeats) || newSeats < 1) throw new ValidationError("Seat count must be a positive number");
  const sub = await prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
  if (!sub || sub.status === "CANCELED") throw new NotFoundError("No active subscription");

  const members = await prisma.membership.count({ where: { orgId } });
  if (newSeats < members) throw new ValidationError(`You have ${members} members; seats cannot go below that`);
  if (newSeats === sub.seats) return { subscription: sub, invoice: null };

  if (newSeats < sub.seats) {
    const updated = await prisma.subscription.update({ where: { orgId }, data: { seats: newSeats } });
    await logActivity(orgId, actorId, "subscription.seats", "subscription", sub.id, null, { seats: newSeats });
    return { subscription: updated, invoice: null };
  }

  // increase: charge the prorated delta for the remaining period
  const periodStart = new Date(sub.currentPeriodEnd.getTime());
  const plan = sub.plan;
  const periodLen = plan.interval === "YEAR" ? 365 : 30;
  periodStart.setDate(periodStart.getDate() - periodLen);
  const amountCents = prorate(plan.priceCents * (newSeats - sub.seats), periodStart, sub.currentPeriodEnd, new Date());

  if (amountCents > 0) {
    const { checkoutId } = provider.createCheckout(amountCents, { orgId, kind: "proration", card });
    const result = await provider.charge(checkoutId);
    if (!result.ok) throw new Error(`Payment failed: ${result.failReason ?? "unknown"}`);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({ where: { orgId }, data: { seats: newSeats } });
      const invoice = await tx.invoice.create({
        data: {
          orgId, subscriptionId: sub.id, number: await nextInvoiceNumber(tx),
          status: "PAID", amountCents, periodStart: new Date(), periodEnd: sub.currentPeriodEnd, paidAt: new Date(),
          lines: { create: [{ description: `Proration: ${newSeats - sub.seats} extra seat(s) for remaining period`, amountCents }] },
          payments: { create: [{ providerId: result.providerId!, amountCents, status: "SUCCEEDED" }] },
        },
      });
      await logActivity(orgId, actorId, "subscription.seats", "subscription", sub.id, null, { seats: newSeats, invoice: invoice.number }, tx);
      return { subscription: updated, invoice };
    });
  }

  const updated = await prisma.subscription.update({ where: { orgId }, data: { seats: newSeats } });
  return { subscription: updated, invoice: null };
}
