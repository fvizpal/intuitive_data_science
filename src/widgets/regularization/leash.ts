/**
 * Widget 1 math: the degree-12 temperature curve fitted by ridge, and its errors averaged
 * over many training sets. Temperature world from ../biasvar/fit.ts (reused as is).
 */
import {
  DEFAULT_NOISE,
  expectedError,
  makeStream,
  rmse,
  trainingSet,
} from '../biasvar/fit';
import { fitRidgePoly } from './ridge';

export const LEASH_DEGREE = 12;
export const LEASH_SETS = 60;
/** Ends of the log-spaced penalty grid (position 0 is "No penalty"). */
export const LEASH_LO = 1e-6;
export const LEASH_HI = 10;
export const LEASH_STEPS = 40;

/** Position 0 = lambda 0, then LEASH_STEPS values log-spaced from LEASH_LO to LEASH_HI. */
export function leashGrid(lo = LEASH_LO, hi = LEASH_HI, steps = LEASH_STEPS): number[] {
  const g = [0];
  for (let i = 0; i < steps; i++) g.push(lo * (hi / lo) ** (i / (steps - 1)));
  return g;
}

export const LEASH_GRID = leashGrid();

export interface LeashCurves {
  lambdas: number[];
  /** Average training error (squared errors averaged, then rooted). */
  train: number[];
  /** Average error on new data, the same way. */
  test: number[];
  /** Position with the lowest error on new data (ties go to the larger penalty). */
  best: number;
}

export function leashCurves(
  seed: number,
  n: number,
  sets = LEASH_SETS,
  lambdas: number[] = LEASH_GRID,
  noiseSd = DEFAULT_NOISE,
  degree = LEASH_DEGREE,
): LeashCurves {
  const tr = new Float64Array(lambdas.length);
  const te = new Float64Array(lambdas.length);
  for (let r = 0; r < sets; r++) {
    const ts = trainingSet(makeStream(seed + r, n), n, noiseSd);
    for (let i = 0; i < lambdas.length; i++) {
      const f = fitRidgePoly(ts.x, ts.y, degree, lambdas[i]!);
      const t = rmse(f.model, ts.x, ts.y);
      const e = expectedError(f.model, noiseSd);
      tr[i] = tr[i]! + (t * t) / sets;
      te[i] = te[i]! + (e * e) / sets;
    }
  }
  const train = Array.from(tr, Math.sqrt);
  const test = Array.from(te, Math.sqrt);
  let best = 0;
  for (let i = 1; i < test.length; i++) if (test[i]! <= test[best]! + 1e-12) best = i;
  return { lambdas, train, test, best };
}
