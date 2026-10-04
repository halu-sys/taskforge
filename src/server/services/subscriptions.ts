import { prisma } from "@/server/db";
import { requireRole, requireMembership } from "@/server/services/orgs";
import { ValidationError, NotFoundError, AppError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { prorate } from "@/server/billing/proration";
import { nextInvoiceNumber } from "@/server/billing/invoiceNumber";
import { addInterval } from "@/server/billing/period";
import type { PaymentProvider } from "@/server/billing/provider";
import type { Invoice, Subscription } from "@prisma/client";

export class PaymentDeclinedError extends AppError {
  constructor(message = "Card declined") {
    super("PAYMENT_DECLINED", message);
  }
}

export type SubscriptionWithPlan = Subscription & { plan: { slug: string; name: string; priceCents: number } };

export async function getSubscription(orgId: string, actorId: string): Promise<SubscriptionWithPlan | null> {
  await requireMembership(orgId, actorId);
  return prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
}

// Internal/seed/test plan application WITHOUT charging. Never resurrects a
// PAST_DUE subscription and never clears dunning state — payment paths
// (checkout/renewal) own those transitions.
export async function subscribe(orgId: string, actorId: string, planSlug: string): Promise<SubscriptionWithPlan> {
  await requireRole(orgId, actorId, "OWNER");
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || plan.slug === "free") throw new ValidationError("Unknown plan");

  const existing = await prisma.subscription.findUnique({ where: { orgId } });
  if (existing?.status === "PAST_DUE") throw new ValidationError("Resolve the failed payment before changing plans");
  if (existing && existing.planId === plan.id && existing.status !== "CANCELED") {
    return prisma.subscription.findUniqueOrThrow({ where: { orgId }, include: { plan: true } });
  }

  const now = new Date();
  const periodEnd = addInterval(now, plan.interval);
  await prisma.subscription.upsert({
    where: { orgId },
    update: { planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
    create: { orgId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
  });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
  await logActivity(orgId, actorId, "subscription.changed", "subscription", sub.id, undefined, { plan: plan.slug });
  return prisma.subscription.findUniqueOrThrow({ where: { orgId }, include: { plan: true } });
}

export async function setCancelAtPeriodEnd(orgId: string, actorId: string, value: boolean): Promise<SubscriptionWithPlan> {
  await requireRole(orgId, actorId, "OWNER");
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub || sub.status === "CANCELED") throw new NotFoundError("No active subscription");
  await prisma.subscription.update({ where: { orgId }, data: { cancelAtPeriodEnd: value } });
  return prisma.subscription.findUniqueOrThrow({ where: { orgId }, include: { plan: true } });
}

export async function resume(orgId: string, actorId: string) {
  return setCancelAtPeriodEnd(orgId, actorId, false);
}

// Lazy expiry: called on billing reads. actorId=null means system context.
export async function expireIfNeeded(orgId: string, actorId: string | null) {
  if (actorId) await requireMembership(orgId, actorId);
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub || sub.status === "CANCELED") return;
  if (sub.currentPeriodEnd < new Date() && sub.cancelAtPeriodEnd) {
    await prisma.subscription.update({ where: { orgId }, data: { status: "CANCELED" } });
    await logActivity(orgId, null, "subscription.canceled", "subscription", sub.id, undefined, { reason: "period_end" });
  }
}

// Seat changes on an ACTIVE subscription. Increase = immediate prorated
// charge (invoice PAID via provider). Decrease = no refund; new seat count
// applies to the NEXT invoice.
export async function changeSeats(
  orgId: string,
  actorId: string,
  newSeats: number,
  provider: PaymentProvider,
  card?: string,
): Promise<{ subscription: Subscription; invoice: Invoice | null }> {
  await requireRole(orgId, actorId, "OWNER");
  if (!Number.isInteger(newSeats) || newSeats < 1) throw new ValidationError("Seat count must be a positive number");
  const sub = await prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
  if (!sub || sub.status === "CANCELED") throw new NotFoundError("No active subscription");
  if (sub.status === "PAST_DUE") throw new ValidationError("Resolve the failed payment before changing seats");

  const members = await prisma.membership.count({ where: { orgId } });
  if (newSeats < members) throw new ValidationError(`You have ${members} members; seats cannot go below that`);
  if (newSeats === sub.seats) return { subscription: sub, invoice: null };

  if (newSeats < sub.seats) {
    const updated = await prisma.subscription.update({ where: { orgId }, data: { seats: newSeats } });
    await logActivity(orgId, actorId, "subscription.seats", "subscription", sub.id, undefined, { seats: newSeats });
    return { subscription: updated, invoice: null };
  }

  // increase: charge the prorated delta over the REAL current period
  const amountCents = prorate(sub.plan.priceCents * (newSeats - sub.seats), sub.currentPeriodStart, sub.currentPeriodEnd, new Date());
  const useCard = card ?? sub.paymentToken;
  if (!useCard) throw new ValidationError("No payment method on file");

  if (amountCents > 0) {
    const { checkoutId } = provider.createCheckout(amountCents, { orgId, kind: "proration", card: useCard });
    const result = await provider.charge(checkoutId);
    if (!result.ok) throw new PaymentDeclinedError(`Payment failed: ${result.failReason ?? "unknown"}`);
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
      await logActivity(orgId, actorId, "subscription.seats", "subscription", sub.id, undefined, { seats: newSeats, invoice: invoice.number }, tx);
      return { subscription: updated, invoice };
    });
  }

  const updated = await prisma.subscription.update({ where: { orgId }, data: { seats: newSeats } });
  return { subscription: updated, invoice: null };
}

const DUNNING_LIMIT = 3;

// Renew a subscription whose period has ended. actorId=null means system
// (scripts/renew.ts); page callers pass the viewing member (membership is
// checked first — no outsider can trigger writes/charges). The whole
// check-charge-write runs under a row lock (SELECT FOR UPDATE) so
// concurrent renewals cannot double-charge or lose dunning strikes.
// Only the STORED payment method is charged unless an explicit retryCard
// is supplied by an OWNER action.
export async function renewSubscription(
  orgId: string,
  actorId: string | null,
  provider: PaymentProvider,
  opts: { retryCard?: string } = {},
): Promise<{ outcome: "noop" | "renewed" | "failed" | "canceled" }> {
  if (actorId) await requireMembership(orgId, actorId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE "orgId" = ${orgId} FOR UPDATE`;
    const sub = await tx.subscription.findUnique({ where: { orgId }, include: { plan: true } });
    if (!sub || sub.status === "CANCELED") return { outcome: "noop" };
    // PAST_DUE is only retryable via an explicit retryCard (OWNER action);
    // automatic renewal never re-strikes a failed period.
    if (sub.status === "PAST_DUE" && !opts.retryCard) return { outcome: "noop" };
    if (sub.status !== "PAST_DUE" && sub.currentPeriodEnd > new Date()) return { outcome: "noop" };

    const card = opts.retryCard ?? sub.paymentToken;

    // cancel-at-period-end (not past due): honor it, no charge.
    if (sub.cancelAtPeriodEnd && sub.status !== "PAST_DUE") {
      await tx.subscription.update({ where: { orgId }, data: { status: "CANCELED" } });
      await logActivity(orgId, null, "subscription.canceled", "subscription", sub.id, undefined, { reason: "period_end" }, tx);
      return { outcome: "canceled" };
    }

    if (!card) {
      const failures = sub.dunningFailures + 1;
      const canceled = failures >= DUNNING_LIMIT;
      await tx.subscription.update({
        where: { orgId },
        data: {
          status: canceled ? "CANCELED" : "PAST_DUE", dunningFailures: failures,
          currentPeriodStart: new Date(sub.currentPeriodEnd.getTime()),
          currentPeriodEnd: addInterval(new Date(sub.currentPeriodEnd.getTime()), sub.plan.interval),
        },
      });
      if (canceled) await logActivity(orgId, null, "subscription.canceled", "subscription", sub.id, undefined, { reason: "dunning" }, tx);
      return { outcome: canceled ? "canceled" : "failed" };
    }

    // apply scheduled downgrade at the renewal boundary
    const plan = sub.pendingPlanId
      ? await tx.plan.findUniqueOrThrow({ where: { id: sub.pendingPlanId } })
      : sub.plan;

    const amountCents = sub.seats * plan.priceCents;
    const { checkoutId } = provider.createCheckout(amountCents, { orgId, kind: "renewal", card });
    const result = await provider.charge(checkoutId);

    const periodStart = new Date(sub.currentPeriodEnd.getTime());
    const periodEnd = addInterval(periodStart, plan.interval);

    if (result.ok) {
      await tx.subscription.update({
        where: { orgId },
        data: {
          planId: plan.id, pendingPlanId: null,
          status: "ACTIVE",
          currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
          dunningFailures: 0,
        },
      });
      await tx.invoice.create({
        data: {
          orgId, subscriptionId: sub.id, number: await nextInvoiceNumber(tx),
          status: "PAID", amountCents, periodStart, periodEnd, paidAt: new Date(),
          lines: { create: [{ description: `${plan.name}: ${sub.seats} seat(s) renewal`, amountCents }] },
          payments: { create: [{ providerId: result.providerId!, amountCents, status: "SUCCEEDED" }] },
        },
      });
      return { outcome: "renewed" };
    }

    const failures = sub.dunningFailures + 1;
    const canceled = failures >= DUNNING_LIMIT;
    await tx.subscription.update({
      where: { orgId },
      data: {
        status: canceled ? "CANCELED" : "PAST_DUE", dunningFailures: failures,
        // roll the period forward even when unpaid (debt tracked on the
        // UNCOLLECTED invoice) so a concurrent renewal sees noop, not a
        // second strike
        currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      },
    });
    await tx.invoice.create({
      data: {
        orgId, subscriptionId: sub.id, number: await nextInvoiceNumber(tx),
        status: "UNCOLLECTED", amountCents, periodStart, periodEnd,
        lines: { create: [{ description: `${plan.name}: ${sub.seats} seat(s) renewal (payment failed)`, amountCents }] },
        payments: { create: [{ amountCents, status: "FAILED" }] },
      },
    });
    if (canceled) {
      await logActivity(orgId, null, "subscription.canceled", "subscription", sub.id, undefined, { reason: "dunning" }, tx);
    }
    return { outcome: canceled ? "canceled" : "failed" };
  }, { maxWait: 5000, timeout: 15000 });
}
