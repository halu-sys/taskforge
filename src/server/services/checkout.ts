import { prisma } from "@/server/db";
import { requireRole } from "@/server/services/orgs";
import { ValidationError, AppError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { nextInvoiceNumber } from "@/server/billing/invoiceNumber";
import type { PaymentProvider } from "@/server/billing/provider";
import type { Invoice, Subscription } from "@prisma/client";

export class PaymentDeclinedError extends AppError {
  constructor(message = "Card declined") {
    super("PAYMENT_DECLINED", message);
  }
}

function addInterval(from: Date, interval: "MONTH" | "YEAR"): Date {
  const d = new Date(from.getTime());
  if (interval === "YEAR") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// Charge now for the first period, then activate the subscription — all in one
// transaction so a declined card (or crash) leaves no subscription/invoice.
export async function checkout(
  orgId: string,
  actorId: string,
  planSlug: string,
  card: string,
  provider: PaymentProvider,
): Promise<{ subscription: Subscription; invoice: Invoice }> {
  await requireRole(orgId, actorId, "OWNER");
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || plan.slug === "free") throw new ValidationError("Unknown plan");
  if (!/^\d{12,19}$/.test(card)) throw new ValidationError("Invalid card number");

  const seats = await prisma.membership.count({ where: { orgId } });
  const amountCents = seats * plan.priceCents;

  const { checkoutId } = provider.createCheckout(amountCents, { orgId, plan: plan.slug, card });
  const result = await provider.charge(checkoutId);
  if (!result.ok) throw new PaymentDeclinedError(`Payment failed: ${result.failReason ?? "unknown"}`);

  const now = new Date();
  const periodEnd = addInterval(now, plan.interval);

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.upsert({
      where: { orgId },
      update: { planId: plan.id, status: "ACTIVE", seats, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, dunningFailures: 0 },
      create: { orgId, planId: plan.id, status: "ACTIVE", seats, currentPeriodEnd: periodEnd },
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
  });
}
