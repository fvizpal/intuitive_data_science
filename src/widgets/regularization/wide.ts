/**
 * The "20 candidate features" world, penalty grids, cross-validation and the repeat comparison.
 * Pure TypeScript, no React.
 *
 * x_1..x_p are independent standard normals; y = sum beta_j x_j + Normal(0, noiseSd).
 * Common random numbers: the draws are row-interleaved per seed, so changing n uses the first n
 * rows, and changing the noise rescales the same noise draws.
 */
import { mulberry32, normal } from '../../lib/random';
import { kFoldIndices } from '../validation/validation';
import { lambdaMax, lassoFit, lassoPath, type LassoFit } from './lasso';
import { matOf, type Mat } from './linalg';
import { predictRow } from './design';
import { ridgeFit, ridgePath } from './ridge';

export const WIDE_P = 20;
export const WIDE_NOISE = 2;
export const WIDE_BETA: readonly number[] = [
  3,
  -2,
  1.5,
  ...new Array<number>(17).fill(0),
];
export const GRID_COUNT = 60;
export const GRID_LO = 1e-3;
export const GRID_HI = 4;

export type Method = 'ridge' | 'lasso';

export interface Wide {
  seed: number;
  n: number;
  p: number;
  x: Mat;
  y: Float64Array;
  /** The standard-normal noise draws (y = X beta + noiseSd * eps). */
  eps: Float64Array;
  trueBeta: number[];
  noiseSd: number;
}

export interface WideOptions {
  p?: number;
  trueBeta?: ArrayLike<number>;
  noiseSd?: number;
  maxN?: number;
}

export function makeWide(seed: number, n: number, opts: WideOptions = {}): Wide {
  const p = opts.p ?? WIDE_P;
  const noiseSd = opts.noiseSd ?? WIDE_NOISE;
  const beta = Array.from(
    { length: p },
    (_, j) => (opts.trueBeta ? opts.trueBeta[j] : WIDE_BETA[j]) ?? 0,
  );
  const maxN = Math.max(opts.maxN ?? 200, n);
  const rng = mulberry32(seed);
  const rows = Math.max(0, Math.floor(n));
  const x = matOf(rows, p);
  const eps = new Float64Array(rows);
  for (let i = 0; i < maxN; i++) {
    for (let j = 0; j < p; j++) {
      const v = normal(rng);
      if (i < rows) x.a[i * p + j] = v;
    }
    const e = normal(rng);
    if (i < rows) eps[i] = e;
  }
  const y = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += beta[j]! * x.a[i * p + j]!;
    y[i] = s + noiseSd * eps[i]!;
  }
  return { seed, n: rows, p, x, y, eps, trueBeta: beta, noiseSd };
}

/** The same draws with a different noise level. */
export function withNoise(w: Wide, noiseSd: number): Wide {
  const y = new Float64Array(w.n);
  for (let i = 0; i < w.n; i++) {
    let s = 0;
    for (let j = 0; j < w.p; j++) s += w.trueBeta[j]! * w.x.a[i * w.p + j]!;
    y[i] = s + noiseSd * w.eps[i]!;
  }
  return { ...w, y, noiseSd };
}

export interface ExactError {
  /** noise^2 + intercept^2 + sum (beta_hat - beta)^2 (features are N(0, I)). */
  mse: number;
  /** Square root of mse: the typical miss, in the units of y. */
  rmse: number;
}

/** Exact expected error on new data for a fitted linear model. Only a simulation can know this. */
export function exactErrorWide(
  fit: { intercept: number; coefs: ArrayLike<number> },
  trueBeta: ArrayLike<number>,
  noiseSd: number,
): ExactError {
  let s = noiseSd * noiseSd + fit.intercept * fit.intercept;
  for (let j = 0; j < trueBeta.length; j++)
    s += ((fit.coefs[j] ?? 0) - trueBeta[j]!) ** 2;
  const mse = Number.isFinite(s) ? s : Number.MAX_VALUE;
  return { mse, rmse: Math.sqrt(mse) };
}

// ---------- the penalty grid ----------

/** "0 (no penalty)" followed by `count` log-spaced values from lamMax * 1e-3 to lamMax * 4. */
export function penaltyGrid(lamMax: number, count = GRID_COUNT): number[] {
  const top = Math.max(lamMax, 1e-9);
  const g = [0];
  for (let i = 0; i < count; i++)
    g.push(top * GRID_LO * (GRID_HI / GRID_LO) ** (i / (count - 1)));
  return g;
}

export const gridFor = (w: Wide): number[] => penaltyGrid(lambdaMax(w.x, w.y));

// ---------- paths on one dataset ----------

export interface WidePaths {
  lambdas: number[];
  lambdaMax: number;
  /** [lambdaIndex][feature], original units. */
  ridgeCoefs: number[][];
  lassoCoefs: number[][];
  ridgeIntercept: number[];
  lassoIntercept: number[];
  /** Exact error on new data (RMSE) at every lambda. */
  ridgeError: number[];
  lassoError: number[];
  ridgeDf: number[];
  lassoNonzero: number[];
  /** Plain least squares (lambda = 0) exact error. */
  lsError: number;
}

export function widePaths(w: Wide): WidePaths {
  const lam = lambdaMax(w.x, w.y);
  const lambdas = penaltyGrid(lam);
  const rp = ridgePath(w.x, w.y, lambdas);
  const lp = lassoPath(w.x, w.y, lambdas);
  const coefs = (fits: { coefs: Float64Array }[]) => fits.map((f) => Array.from(f.coefs));
  const err = (fits: { intercept: number; coefs: Float64Array }[]) =>
    fits.map((f) => exactErrorWide(f, w.trueBeta, w.noiseSd).rmse);
  return {
    lambdas,
    lambdaMax: lam,
    ridgeCoefs: coefs(rp),
    lassoCoefs: coefs(lp),
    ridgeIntercept: rp.map((f) => f.intercept),
    lassoIntercept: lp.map((f) => f.intercept),
    ridgeError: err(rp),
    lassoError: err(lp),
    ridgeDf: rp.map((f) => f.effectiveDf),
    lassoNonzero: lp.map((f) => f.nonzero),
    lsError: err(rp)[0]!,
  };
}

// ---------- cross-validation ----------

export interface CvResult {
  lambdas: number[];
  /** Pooled cross-validation RMSE at every lambda (0s when empty). */
  cv: number[];
  best: number;
  /** False when there were too few rows to cross-validate. */
  ok: boolean;
}

/** Index of the lowest value; ties (within 1e-12) go to the larger lambda (the simpler model). */
export function bestLambdaIndex(cv: ArrayLike<number>): number {
  let lo = Infinity;
  for (let i = 0; i < cv.length; i++)
    if (Number.isFinite(cv[i]!) && cv[i]! < lo) lo = cv[i]!;
  let best = 0;
  for (let i = 0; i < cv.length; i++)
    if (Number.isFinite(cv[i]!) && cv[i]! <= lo + 1e-12) best = i;
  return best;
}

/**
 * k-fold cross-validation over a lambda grid. Squared errors are pooled across folds. Scaling is
 * fitted inside each fold on that fold's training rows only; paths are warm-started per fold.
 */
export function cvPenalty(
  x: Mat,
  y: ArrayLike<number>,
  method: Method,
  lambdas: number[],
  k = 5,
  seed = 1,
): CvResult {
  const n = x.n;
  const folds = kFoldIndices(n, Math.min(k, n), seed);
  if (!folds) return { lambdas, cv: lambdas.map(() => 0), best: 0, ok: false };
  const sq = new Float64Array(lambdas.length);
  for (const held of folds) {
    const isHeld = new Uint8Array(n);
    for (const i of held) isHeld[i] = 1;
    const train: number[] = [];
    for (let i = 0; i < n; i++) if (!isHeld[i]) train.push(i);
    const fits =
      method === 'ridge'
        ? ridgePath(x, y, lambdas, { rows: train })
        : lassoPath(x, y, lambdas, { rows: train });
    for (let li = 0; li < lambdas.length; li++) {
      const f = fits[li]!;
      let s = 0;
      for (const i of held) s += (y[i]! - predictRow(f, x, i)) ** 2;
      sq[li] = sq[li]! + s;
    }
  }
  const cv = Array.from(sq, (s) => Math.sqrt(s / n));
  return { lambdas, cv, best: bestLambdaIndex(cv), ok: true };
}

// ---------- 100 datasets ----------

export interface Comparison {
  n: number;
  reps: number;
  /** Exact error on new data (RMSE) of each method on each dataset. */
  ls: number[];
  ridge: number[];
  lasso: number[];
  lassoKept: number[];
  /** How many of the real features (true weight not 0) lasso kept. */
  lassoReal: number[];
  ridgePos: number[];
  lassoPos: number[];
  realCount: number;
}

export function compareMethods(
  seed: number,
  reps = 100,
  opts: { n?: number } = {},
): Comparison {
  const n = opts.n ?? 40;
  const out: Comparison = {
    n,
    reps,
    ls: [],
    ridge: [],
    lasso: [],
    lassoKept: [],
    lassoReal: [],
    ridgePos: [],
    lassoPos: [],
    realCount: WIDE_BETA.filter((b) => b !== 0).length,
  };
  for (let r = 0; r < reps; r++) {
    const dataSeed = seed * 7919 + r * 104729 + 13;
    const w = makeWide(dataSeed, n);
    const grid = gridFor(w);
    const folds = dataSeed + 7;
    const ls = ridgeFit(w.x, w.y, 0);
    const cr = cvPenalty(w.x, w.y, 'ridge', grid, 5, folds);
    const cl = cvPenalty(w.x, w.y, 'lasso', grid, 5, folds);
    const rf = ridgeFit(w.x, w.y, grid[cr.best]!);
    const lf: LassoFit = lassoFit(w.x, w.y, grid[cl.best]!);
    out.ls.push(exactErrorWide(ls, w.trueBeta, w.noiseSd).rmse);
    out.ridge.push(exactErrorWide(rf, w.trueBeta, w.noiseSd).rmse);
    out.lasso.push(exactErrorWide(lf, w.trueBeta, w.noiseSd).rmse);
    out.lassoKept.push(lf.nonzero);
    let real = 0;
    for (let j = 0; j < w.p; j++) if (w.trueBeta[j] !== 0 && lf.coefs[j] !== 0) real++;
    out.lassoReal.push(real);
    out.ridgePos.push(cr.best);
    out.lassoPos.push(cl.best);
  }
  return out;
}
