/** Mock data for the distributions page. Everything is a pure function of a seed. */
import {
  bimodalSample,
  lognormalSample,
  normalSample,
  standardize,
} from '../../lib/datasets';

export const DEFAULT_SEED = 3;

export const SIZE_N = 300;
export const SIZE_MIN = 50;
export const SIZE_MAX = 130;

/** Chest size in cm of a tailor's customers: children and adults, two humps. */
export function chestSample(seed: number): number[] {
  return bimodalSample(seed, SIZE_N, {
    mu1: 72,
    sd1: 6,
    mu2: 100,
    sd2: 8,
    weight: 0.45,
  }).map((v) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)));
}

/** Marks out of 100 for a class, rescaled to exactly this mean and SD (then kept in 0-100). */
export function marksSample(seed: number, n: number, mu: number, sd: number): number[] {
  return standardize(normalSample(seed, n), mu, sd).map((v) =>
    Math.min(100, Math.max(0, v)),
  );
}

/** Weekly pocket money in rupees: most kids get a little, a few get a lot (long right tail). */
export function pocketMoneySample(seed: number, n = 400): number[] {
  return lognormalSample(seed, n, Math.log(30), 0.9).map((v) =>
    Math.max(1, Math.round(v)),
  );
}

/** The two classes from the page's z-score example. */
export const SUBJECTS = {
  maths: { name: 'Maths', mean: 60, sd: 15, seed: 11 },
  english: { name: 'English', mean: 55, sd: 5, seed: 12 },
} as const;
export const CLASS_N = 300;
