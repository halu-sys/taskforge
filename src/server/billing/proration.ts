// Integer proration: amount * remainingMs / totalMs, rounded half-up.
export function prorate(amountCents: number, periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  const remaining = Math.min(Math.max(periodEnd.getTime() - now.getTime(), 0), total);
  if (remaining <= 0) return 0;
  if (remaining >= total) return amountCents;
  // half-up without floats: (2*amount*remaining + total) / (2*total), integer division
  const num = BigInt(2) * BigInt(amountCents) * BigInt(remaining) + BigInt(total);
  const den = BigInt(2) * BigInt(total);
  return Number(num / den);
}
