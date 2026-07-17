export type RandomSource = () => number;

/** Small deterministic PRNG with a full 32-bit seed. */
export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = value + Math.imul(value ^ (value >>> 7), 61 | value) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(random: RandomSource, minimum: number, maximum: number): number {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  return low + Math.floor(random() * (high - low + 1));
}

export function pick<T>(random: RandomSource, values: readonly T[]): T {
  if (values.length === 0) throw new Error("Cannot pick from an empty array.");
  return values[int(random, 0, values.length - 1)];
}

export function shuffle<T>(random: RandomSource, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = int(random, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
