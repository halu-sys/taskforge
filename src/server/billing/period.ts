// Shared billing period math. setMonth overflows (Jan 31 + 1mo = Mar 3),
// so clamp day-of-month to the target month's last day.
export function addInterval(from: Date, interval: "MONTH" | "YEAR"): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  if (interval === "YEAR") {
    d.setUTCMonth(0);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
