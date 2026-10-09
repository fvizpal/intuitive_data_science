import { bimodalSample, normalSample, standardize } from '../../lib/datasets';
import { mulberry32, normal } from '../../lib/random';

export const SKEW_N = 400;
export const SKEW_MIN = -1;
export const SKEW_MAX = 1;
export const AXIS_MAX = 100;
export const BINS = 25;

export type SkewKind = 'blend' | 'dpd' | 'bimodal';

const clamp = (v: number) => Math.min(AXIS_MAX, Math.max(0, v));

/**
 * Smooth blend from a left tail (skew < 0) through a bell (0) to a right tail (skew > 0):
 * (exp(s·z) − 1) / s turns a normal z into a lognormal-like shape for s > 0 and its mirror
 * image for s < 0, and tends to z itself as s → 0. The centre moves against the tail so
 * everything stays on a 0 to 100 axis.
 */
export function blendSample(seed: number, skew: number, n = SKEW_N): number[] {
  const z = standardize(normalSample(seed, n), 0, 1);
  const s = 0.8 * skew;
  const x = Math.abs(s) < 1e-3 ? z : z.map((v) => (Math.exp(s * v) - 1) / s);
  return standardize(x, 50 - 16 * skew, 6).map(clamp);
}

/** Days past due: most accounts at exactly 0, a long tail of late payers. Whole numbers. */
export function dpdSample(seed: number, n = SKEW_N): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () =>
    rng() < 0.55
      ? 0
      : Math.min(AXIS_MAX, Math.max(1, Math.round(1 + Math.exp(normal(rng, 2.1, 0.9))))),
  );
}

/** Two kinds of customers: low spenders around 30 and high spenders around 70. */
export function twoGroupsSample(seed: number, n = SKEW_N): number[] {
  return bimodalSample(seed, n, { mu1: 30, sd1: 6, mu2: 70, sd2: 6 }).map(clamp);
}

export function skewSample(kind: SkewKind, skew: number, seed: number): number[] {
  if (kind === 'dpd') return dpdSample(seed);
  if (kind === 'bimodal') return twoGroupsSample(seed);
  return blendSample(seed, skew);
}

/** Plain name for a position on the skew slider. */
export function skewName(skew: number): string {
  if (skew < -0.15) return 'left tail';
  if (skew > 0.15) return 'right tail';
  return 'symmetric';
}
