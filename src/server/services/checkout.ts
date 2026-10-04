import { prisma } from "@/server/db";
import { requireRole } from "@/server/services/orgs";
import { ValidationError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { nextInvoiceNumber } from "@/server/billing/invoiceNumber";
import { addInterval } from "@/server/billing/period";
import { PaymentDeclinedError } from "@/server/services/subscriptions";
import type { PaymentProvider } from "@/server/billing/provider";
import type { Invoice, Subscription } from "@prisma/client";

// Subscribe or switch plans by charging the first period up front.
// The subscription row is locked for the whole check-charge-write so two
// concurrent checkouts cannot both charge. A downgrade is scheduled for the
// period boundary instead of being charged now (no credit for the unused
// part of a more expensive plan).
export async function checkout(
  orgId: string,
  actorId: string,
  planSlug: string,
  card: string,
  provider: PaymentProvider,
): Promise<{ subscription: Subscription; invoice: Invoice | null }> {
  await requireRole(orgId, actorId, "OWNER");
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || plan.slug === "free") throw new ValidationError("Unknown plan");
  if (!/^\d{12,19}$/.test(card)) throw new ValidationError("Invalid card number");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE "orgId" = ${orgId} FOR UPDATE`;
    const existing = await tx.subscription.findUnique({ where: { orgId }, include: { plan: true } });

    if (existing && existing.status !== "CANCELED") {
      if (existing.planId === plan.id) {
        throw new ValidationError(`Already subscribed to ${plan.name}`);
      }
      if (plan.priceCents < existing.plan.priceCents) {
        // downgrade: takes effect at the period boundary, no charge now
        const updated = await tx.subscription.update({
          where: { orgId },
          data: { pendingPlanId: plan.id },
        });
        await logActivity(orgId, actorId, "subscription.changed", "subscription", updated.id, undefined,
          { plan: plan.slug, scheduled: true }, tx);
        return { subscription: updated, invoice: null };
      }
    }

    const seats = existing && existing.status !== "CANCELED" ? existing.seats : await tx.membership.count({ where: { orgId } });
    const amountCents = seats * plan.priceCents;

    const { checkoutId } = provider.createCheckout(amountCents, { orgId, plan: plan.slug, card });
    const result = await provider.charge(checkoutId);
    if (!result.ok) throw new PaymentDeclinedError(`Payment failed: ${result.failReason ?? "unknown"}`);

    const now = new Date();
    const periodEnd = addInterval(now, plan.interval);
    const subscription = await tx.subscription.upsert({
      where: { orgId },
      update: {
        planId: plan.id, status: "ACTIVE", seats, paymentToken: card, pendingPlanId: null,
        currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, dunningFailures: 0,
      },
      create: {
        orgId, planId: plan.id, status: "ACTIVE", seats, paymentToken: card,
        currentPeriodStart: now, currentPeriodEnd: periodEnd,
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        orgId,
        subscriptionId: subscription.id,
        number: await nextInvoiceNumber(tx),
        status: "PAID",
        amountCents,
        periodStart: now,
        periodEnd,
        paidAt: now,
        lines: { create: [{ description: `${plan.name}: ${seats} seat${seats === 1 ? "" : "s"} × ${(plan.priceCents / 100).toFixed(2)}/mo`, amountCents }] },
        payments: { create: [{ providerId: result.providerId!, amountCents, status: "SUCCEEDED" }] },
      },
    });
    await logActivity(orgId, actorId, "subscription.changed", "subscription", subscription.id, undefined, { plan: plan.slug, invoice: invoice.number }, tx);
    return { subscription, invoice };
  }, { maxWait: 5000, timeout: 15000 });
}
