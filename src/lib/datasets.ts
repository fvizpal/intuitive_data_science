import { mulberry32, normal } from './random';

/** Seeded mock datasets shared across concept pages. Same seed, same numbers, every time. */

export function normalSample(seed: number, n: number, mu = 0, sigma = 1): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => normal(rng, mu, sigma));
}

/** Right-skewed: exp of a normal. `mu` and `sigma` describe the underlying normal. */
export function lognormalSample(seed: number, n: number, mu = 0, sigma = 1): number[] {
  return normalSample(seed, n, mu, sigma).map(Math.exp);
}

/** Two clusters: a share `weight` around `mu1` and the rest around `mu2`. */
export function bimodalSample(
  seed: number,
  n: number,
  {
    mu1,
    sd1,
    mu2,
    sd2,
    weight = 0.5,
  }: { mu1: number; sd1: number; mu2: number; sd2: number; weight?: number },
): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () =>
    rng() < weight ? normal(rng, mu1, sd1) : normal(rng, mu2, sd2),
  );
}

/** Rescales to exactly the given mean and sample standard deviation. */
export function standardize(values: readonly number[], mu = 0, sd = 1): number[] {
  const n = values.length;
  if (n === 0) return [];
  const m = values.reduce((a, b) => a + b, 0) / n;
  const s = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  return values.map((v) => (s > 0 ? mu + ((v - m) / s) * sd : mu));
}
