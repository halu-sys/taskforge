import { describe, it, expect } from "vitest";
import { prorate } from "@/server/billing/proration";

describe("prorate", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-31T00:00:00Z"); // 30 days
  const day = 86400_000;

  it("full period = full amount", () => {
    expect(prorate(1000, start, end, start)).toBe(1000);
  });

  it("add seat at day 10 of 30 -> 20/30 charge", () => {
    expect(prorate(1000, start, end, new Date(start.getTime() + 10 * day))).toBe(667);
  });

  it("half-up rounding", () => {
    // 1000 * 15/30 = 500 exact; 1000*15.0000001/30 rounds up
    const t = new Date(start.getTime() + 15 * day);
    expect(prorate(1000, start, end, t)).toBe(500);
  });

  it("zero remaining -> 0", () => {
    expect(prorate(1000, start, end, end)).toBe(0);
  });

  it("now before start clamps to full", () => {
    expect(prorate(1000, start, end, new Date(start.getTime() - day))).toBe(1000);
  });

  it("integer math only (no float dust)", () => {
    const v = prorate(999, start, end, new Date(start.getTime() + 7 * day));
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBe(766); // 999*23/30 = 765.9 -> 766
  });
});
