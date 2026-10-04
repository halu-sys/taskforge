import { describe, it, expect } from "vitest";
import { positionBetween, needsRebalance, rebalancePositions } from "@/server/services/positions";

describe("position math", () => {
  it("positionBetween midpoints", () => {
    expect(positionBetween(0, 1000)).toBe(500);
    expect(positionBetween(null, 1000)).toBe(0);      // top of column
    expect(positionBetween(1000, null)).toBe(2000);   // bottom of column
    expect(positionBetween(null, null)).toBe(1000);   // empty column
  });

  it("needsRebalance when gap too small", () => {
    expect(needsRebalance(100, 100.005)).toBe(true);
    expect(needsRebalance(100, 200)).toBe(false);
    expect(needsRebalance(null, 100)).toBe(false);
    expect(needsRebalance(100, null)).toBe(false);
  });

  it("rebalancePositions rewrites evenly, preserving order", () => {
    const out = rebalancePositions(["a", "b", "c"]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out[0].position).toBeLessThan(out[1].position);
    expect(out[1].position).toBeLessThan(out[2].position);
    expect(out[1].position - out[0].position).toBeGreaterThanOrEqual(1000);
  });
});
