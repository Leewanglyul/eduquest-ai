/**
 * Seeded pseudo-random numbers. Integer arithmetic only (Math.imul, shifts) and a final division by 2^32,
 * which is exact in IEEE doubles, so the same seed gives the same sequence on every machine and runtime.
 * Math.random is never used by the generator.
 */
export type Rng = {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  nextInt(n: number): number;
};

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, nextInt: (n) => Math.floor(next() * n) };
}

/** Combines a seed with a stream number into an independent 32-bit seed (attempt 1, 2, ... and the selection). */
export function mixSeed(seed: number, stream: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (stream + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Fisher-Yates with the given generator; returns a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
