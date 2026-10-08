/** Seeded PRNG (mulberry32). Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal sample via Box-Muller. */
export function normal(rng: () => number, mean = 0, sd = 1): number {
  const u = 1 - rng(); // avoid log(0)
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Uniform sample in [lo, hi). */
export function uniform(rng: () => number, lo = 0, hi = 1): number {
  return lo + (hi - lo) * rng();
}
