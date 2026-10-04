export const STEP = 1000;
const MIN_GAP = 0.01;

export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return STEP;
  if (before === null) return (after as number) - STEP;
  if (after === null) return (before as number) + STEP;
  return (before + after) / 2;
}

export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  return after - before < MIN_GAP;
}

export function rebalancePositions<T extends string>(orderedIds: T[]): { id: T; position: number }[] {
  return orderedIds.map((id, i) => ({ id, position: (i + 1) * STEP }));
}
