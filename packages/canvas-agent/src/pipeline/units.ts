/**
 * Weighted integer allocation over the 16px grid — extracted from the
 * layout-lab compiler (apps/layout-lab/src/agent/compiler.ts, now deleted);
 * expansion's split pass is its remaining consumer.
 */

interface WeightedShare {
  weight: number;
  index: number;
  units: number;
  remainder: number;
}

/** Allocate integer grid units by weight while honoring child minimums. */
export function allocateWeightedUnits(totalUnits: number, minimumUnits: readonly number[], weights: readonly number[]): number[] {
  const result = new Array<number>(weights.length).fill(0);
  let remaining = totalUnits;
  let active = weights.map((weight, index) => ({ weight, index }));

  while (active.length) {
    const weightSum = active.reduce((sum, item) => sum + item.weight, 0);
    const clamped = active.filter((item) => (remaining * item.weight) / weightSum < (minimumUnits[item.index] ?? 0));
    if (!clamped.length) break;
    clamped.forEach((item) => {
      result[item.index] = minimumUnits[item.index] ?? 0;
      remaining -= result[item.index] ?? 0;
    });
    const clampedIds = new Set(clamped.map((item) => item.index));
    active = active.filter((item) => !clampedIds.has(item.index));
  }

  if (!active.length) return result;
  const weightSum = active.reduce((sum, item) => sum + item.weight, 0);
  const shares: WeightedShare[] = active.map((item) => {
    const exact = (remaining * item.weight) / weightSum;
    return { ...item, units: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let distributed = shares.reduce((sum, item) => sum + item.units, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let cursor = 0; distributed < remaining; cursor += 1, distributed += 1) {
    const share = shares[cursor % shares.length];
    if (share) share.units += 1;
  }
  shares.forEach((item) => { result[item.index] = item.units; });
  return result;
}
