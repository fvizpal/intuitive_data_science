/**
 * Splits, folds, cross-validation and the winner's curse. Pure TypeScript, no React.
 *
 * Temperature world: see ../biasvar/fit.ts (reused as is). Electricity world: bill(t) =
 * 1500 + 12 t + 300 sin(2 pi (t - 4) / 12) rupees for month t = 0..59, noise Normal(0, 80).
 */
import {
  DEFAULT_NOISE,
  MAX_DEGREE,
  expectedError,
  fitPoly,
  makeStream,
  median,
  rmse,
  trainingSet,
} from '../biasvar/fit';
import { mulberry32, normal } from '../../lib/random';

export { median };

// ---------- shuffles, splits, folds ----------

/** Seeded Fisher-Yates shuffle of 0..n-1. */
export function shuffledIndices(n: number, seed: number): number[] {
  const order = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export interface Shares {
  train: number;
  val: number;
  test: number;
}
export interface Split {
  train: number[];
  val: number[];
  test: number[];
}

/** Set sizes by largest remainder; every set with a nonzero share gets at least 2 points. */
export function splitSizes(n: number, shares: Shares): [number, number, number] {
  const s = [shares.train, shares.val, shares.test].map((v) => Math.max(0, v));
  const total = s[0]! + s[1]! + s[2]!;
  if (n <= 0 || !(total > 0)) return [0, 0, 0];
  const raw = s.map((v) => (v / total) * n);
  const sizes = raw.map((r) => Math.floor(r + 1e-9));
  let left = n - sizes.reduce((a, b) => a + b, 0);
  const byFrac = [0, 1, 2].sort(
    (a, b) => raw[b]! - sizes[b]! - (raw[a]! - sizes[a]!) || a - b,
  );
  for (let i = 0; left > 0; i = (i + 1) % 3, left--) sizes[byFrac[i]!]!++;
  // Tiny shares: lift to 2 by taking from the largest set.
  for (let i = 0; i < 3; i++) {
    while (s[i]! > 0 && sizes[i]! < 2 && n >= 6) {
      let big = 0;
      for (let j = 1; j < 3; j++) if (sizes[j]! > sizes[big]!) big = j;
      if (sizes[big]! <= 2) break;
      sizes[big]!--;
      sizes[i]!++;
    }
  }
  return [sizes[0]!, sizes[1]!, sizes[2]!];
}

/** Disjoint train, validation and test index sets (each ascending) covering 0..n-1. */
export function splitIndices(n: number, shares: Shares, seed: number): Split {
  const [a, b] = splitSizes(n, shares);
  const order = shuffledIndices(n, seed);
  const asc = (v: number[]) => v.sort((x, y) => x - y);
  return {
    train: asc(order.slice(0, a)),
    val: asc(order.slice(a, a + b)),
    test: asc(order.slice(a + b)),
  };
}

/** k folds of a seeded shuffle, sizes differing by at most 1. Null when k < 2 or k > n. */
export function kFoldIndices(n: number, k: number, seed: number): number[][] | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 2 || k > n) return null;
  const order = shuffledIndices(n, seed);
  const base = Math.floor(n / k);
  const extra = n % k;
  const folds: number[][] = [];
  let at = 0;
  for (let f = 0; f < k; f++) {
    const size = base + (f < extra ? 1 : 0);
    folds.push(order.slice(at, at + size).sort((x, y) => x - y));
    at += size;
  }
  return folds;
}

const pick = (v: ArrayLike<number>, idx: number[]): number[] => idx.map((i) => v[i]!);

// ---------- cross-validation on the temperature world ----------

export interface FoldResult {
  indices: number[];
  rmse: number;
}
export interface CvResult {
  pooledRmse: number;
  perFold: FoldResult[];
  /** True when the degree was cut down to the fold's training size - 1. */
  capped: boolean;
}

export function cvPoly(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  degree: number,
  folds: number[][],
): CvResult | null {
  const n = xs.length;
  if (n === 0 || folds.length === 0) return null;
  const perFold: FoldResult[] = [];
  let sum = 0;
  let count = 0;
  let capped = false;
  for (const held of folds) {
    if (held.length === 0) continue;
    const heldSet = new Set(held);
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (!heldSet.has(i)) rest.push(i);
    const model = fitPoly(pick(xs, rest), pick(ys, rest), degree);
    if (model.capped) capped = true;
    const hx = pick(xs, held);
    const hy = pick(ys, held);
    const r = rmse(model, hx, hy);
    sum += r * r * held.length;
    count += held.length;
    perFold.push({ indices: held, rmse: r });
  }
  if (count === 0) return null;
  return { pooledRmse: Math.sqrt(sum / count), perFold, capped };
}

/** Pooled cross-validation RMSE for degrees 1..maxDegree (index 0 = degree 1). */
export function cvByDegree(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  folds: number[][],
  maxDegree: number,
): number[] {
  const out: number[] = [];
  for (let d = 1; d <= maxDegree; d++)
    out.push(cvPoly(xs, ys, d, folds)?.pooledRmse ?? NaN);
  return out;
}

/** 1-based degree with the lowest value; ties go to the lower degree. Null for empty input. */
export function bestDegree(values: ArrayLike<number>): number | null {
  let best = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (best < 0 || v < values[best]! - 1e-12) best = i;
  }
  return best < 0 ? null : best + 1;
}

/** Validation RMSE per degree 1..maxDegree for one seeded holdback. */
export function singleSplitByDegree(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  valShare: number,
  seed: number,
  maxDegree: number,
): number[] {
  const n = xs.length;
  if (n < 4) return [];
  const nVal = Math.max(2, Math.min(n - 2, Math.round(n * valShare)));
  const order = shuffledIndices(n, seed);
  const val = order.slice(0, nVal).sort((a, b) => a - b);
  const train = order.slice(nVal).sort((a, b) => a - b);
  const tx = pick(xs, train);
  const ty = pick(ys, train);
  const vx = pick(xs, val);
  const vy = pick(ys, val);
  const out: number[] = [];
  for (let d = 1; d <= maxDegree; d++) out.push(rmse(fitPoly(tx, ty, d), vx, vy));
  return out;
}

/** Exact expected error for each degree 1..maxDegree, fitting on ALL the given points. */
export function realErrorByDegree(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  noiseSd: number,
  maxDegree: number,
): number[] {
  const out: number[] = [];
  for (let d = 1; d <= maxDegree; d++)
    out.push(expectedError(fitPoly(xs, ys, d), noiseSd));
  return out;
}

/** Leave-one-out RMSE by brute force: n refits. */
export function pressRmse(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  degree: number,
): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const folds = Array.from({ length: n }, (_, i) => [i]);
  return cvPoly(xs, ys, degree, folds)?.pooledRmse ?? null;
}

// ---------- pools for the temperature world ----------

const repSeed = (seed: number, rep: number): number => seed * 7919 + rep * 104729 + 17;

export function temperaturePool(seed: number, n: number, noiseSd = DEFAULT_NOISE) {
  return trainingSet(makeStream(seed, n), n, noiseSd);
}

export interface MethodPicks {
  /** Picked degree per pool. */
  picks: number[];
  /** Exact error on new data of the model refitted on all points at the picked degree. */
  errors: number[];
}
export interface CvPicks {
  single: MethodPicks;
  k5: MethodPicks;
  k10: MethodPicks;
  n: number;
  reps: number;
  maxDegree: number;
}

/** Many fresh pools; the degree picked by one 25% split, 5-fold and 10-fold cross-validation. */
export function cvPicks(
  seed: number,
  reps = 100,
  n = 40,
  noiseSd = DEFAULT_NOISE,
  maxDegree = MAX_DEGREE,
): CvPicks {
  const out: CvPicks = {
    single: { picks: [], errors: [] },
    k5: { picks: [], errors: [] },
    k10: { picks: [], errors: [] },
    n,
    reps,
    maxDegree,
  };
  for (let r = 0; r < reps; r++) {
    const s = repSeed(seed, r);
    const pool = temperaturePool(s, n, noiseSd);
    const record = (m: MethodPicks, values: number[]) => {
      const d = bestDegree(values) ?? 1;
      m.picks.push(d);
      m.errors.push(expectedError(fitPoly(pool.x, pool.y, d), noiseSd));
    };
    record(out.single, singleSplitByDegree(pool.x, pool.y, 0.25, s + 1, maxDegree));
    record(out.k5, cvByDegree(pool.x, pool.y, kFoldIndices(n, 5, s + 2)!, maxDegree));
    record(out.k10, cvByDegree(pool.x, pool.y, kFoldIndices(n, 10, s + 3)!, maxDegree));
  }
  return out;
}

export interface Optimism {
  /** Validation MSE of the validation-picked degree, per pool. */
  valMse: number[];
  /** Test MSE of the same fitted model, per pool. */
  testMse: number[];
}

/** The small selection effect the test set exists to catch. */
export function optimismOfSelection(
  seed: number,
  reps: number,
  n = 60,
  shares: Shares = { train: 0.6, val: 0.2, test: 0.2 },
  noiseSd = DEFAULT_NOISE,
): Optimism {
  const valMse: number[] = [];
  const testMse: number[] = [];
  for (let r = 0; r < reps; r++) {
    const s = repSeed(seed, r);
    const pool = temperaturePool(s, n, noiseSd);
    const sp = splitIndices(n, shares, s + 1);
    const tx = pick(pool.x, sp.train);
    const ty = pick(pool.y, sp.train);
    const vx = pick(pool.x, sp.val);
    const vy = pick(pool.y, sp.val);
    const ex = pick(pool.x, sp.test);
    const ey = pick(pool.y, sp.test);
    const top = Math.min(MAX_DEGREE, tx.length - 1);
    let best = Infinity;
    let bestTest = 0;
    for (let d = 1; d <= top; d++) {
      const m = fitPoly(tx, ty, d);
      const v = rmse(m, vx, vy);
      if (v < best - 1e-12) {
        best = v;
        bestTest = rmse(m, ex, ey);
      }
    }
    valMse.push(best * best);
    testMse.push(bestTest * bestTest);
  }
  return { valMse, testMse };
}

// ---------- the winner's curse: coin-flip models ----------

const tableCache = new Map<string, Float64Array>();

/** P(X <= k) for X ~ Binomial(m, p), k = 0..m, built in log space. */
export function binomialCdfTable(m: number, p = 0.5): Float64Array {
  const key = `${m}:${p}`;
  const hit = tableCache.get(key);
  if (hit) return hit;
  const cdf = new Float64Array(m + 1);
  const lf = new Float64Array(m + 2); // log k!
  for (let i = 1; i <= m; i++) lf[i] = lf[i - 1]! + Math.log(i);
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let acc = 0;
  for (let k = 0; k <= m; k++) {
    const logPmf = lf[m]! - lf[k]! - lf[m - k]! + k * lp + (m - k) * lq;
    acc += Math.exp(logPmf);
    cdf[k] = Math.min(1, acc);
  }
  cdf[m] = 1;
  if (tableCache.size > 24) tableCache.clear();
  tableCache.set(key, cdf);
  return cdf;
}

/** Inverse CDF: the smallest k with P(X <= k) >= u. */
export function binomialQuantile(u: number, table: Float64Array): number {
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid]! >= u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** E[max of K iid Binomial(m, p) / m], exact: sum of x (F(x)^K - F(x-1)^K) / m. */
export function exactMaxAccuracy(m: number, K: number, p = 0.5): number {
  if (!(m > 0) || !(K >= 1)) return p;
  const F = binomialCdfTable(m, p);
  let prev = 0;
  let sum = 0;
  for (let x = 0; x <= m; x++) {
    const cur = Math.pow(F[x]!, K);
    sum += x * (cur - prev);
    prev = cur;
  }
  return sum / m;
}

/** P(the best of K models scores at least a). */
export function probBestAtLeast(m: number, K: number, a: number, p = 0.5): number {
  const F = binomialCdfTable(m, p);
  const x0 = Math.ceil(a * m - 1e-9);
  if (x0 <= 0) return 1;
  if (x0 > m) return 0;
  return 1 - Math.pow(F[x0 - 1]!, K);
}

/** Fixed uniforms: u (trial-major, K per trial) for validation draws, v per trial for the test draw. */
export function winnerUniforms(seed: number, K: number, trials: number) {
  const u = new Float64Array(trials * K);
  const v = new Float64Array(trials);
  for (let t = 0; t < trials; t++) {
    const ru = mulberry32(seed * 100003 + t * 7 + 1);
    for (let k = 0; k < K; k++) u[t * K + k] = ru();
    v[t] = mulberry32(seed * 100019 + t * 13 + 5)();
  }
  return { u, v };
}

export interface Winners {
  /** Best validation accuracy per trial (0..1). */
  best: Float64Array;
  /** Test accuracy of the picked model per trial (0..1). */
  fresh: Float64Array;
}

export function simulateWinners(
  seed: number,
  m: number,
  K: number,
  trials: number,
): Winners {
  const table = binomialCdfTable(m);
  const { u, v } = winnerUniforms(seed, K, trials);
  const best = new Float64Array(trials);
  const fresh = new Float64Array(trials);
  for (let t = 0; t < trials; t++) {
    let top = -1;
    for (let k = 0; k < K; k++) {
      const c = binomialQuantile(u[t * K + k]!, table);
      if (c > top) top = c; // ties keep the lower model index
    }
    best[t] = top / m;
    fresh[t] = binomialQuantile(v[t]!, table) / m;
  }
  return { best, fresh };
}

export interface SingleRun {
  /** Score of each model on the mock test (0..1). */
  scores: number[];
  winner: number;
  /** The winner's score on fresh questions. */
  fresh: number;
}

/** Trial 0 of simulateWinners, with every model's score. */
export function singleRun(seed: number, m: number, K: number): SingleRun {
  const table = binomialCdfTable(m);
  const { u, v } = winnerUniforms(seed, K, 1);
  const scores = Array.from({ length: K }, (_, k) => binomialQuantile(u[k]!, table) / m);
  let winner = 0;
  for (let k = 1; k < K; k++) if (scores[k]! > scores[winner]!) winner = k;
  return { scores, winner, fresh: binomialQuantile(v[0]!, table) / m };
}

// ---------- the electricity bill world ----------

export const BILL_MONTHS = 60;
export const OBSERVED = 48;
export const BILL_NOISE = 80;
/** Stand-in for a prediction that is not a sensible number. Errors from 100000 up read "100000+". */
export const BILL_BIG = 100000;
export const BILL_MAX_DEGREE = 8;

export const billTruth = (t: number): number =>
  1500 + 12 * t + 300 * Math.sin((2 * Math.PI * (t - 4)) / 12);

export interface Bills {
  seed: number;
  /** Standard normals, one per month. */
  z: Float64Array;
}
export interface BillSeries {
  t: number[];
  y: number[];
}

export function makeBills(seed: number, months = BILL_MONTHS): Bills {
  const rng = mulberry32(seed);
  const z = new Float64Array(months);
  for (let i = 0; i < months; i++) z[i] = normal(rng);
  return { seed, z };
}

/** The first upTo months: bill = truth + noiseSd * z. */
export function observed(
  bills: Bills,
  upTo = OBSERVED,
  noiseSd = BILL_NOISE,
): BillSeries {
  const n = Math.max(0, Math.min(upTo, bills.z.length));
  const t = Array.from({ length: n }, (_, i) => i);
  return { t, y: t.map((i) => billTruth(i) + noiseSd * bills.z[i]!) };
}

export interface BillModel {
  degree: number;
  capped: boolean;
  /** Clamped to +-BILL_BIG. */
  predict: (t: number) => number;
}

const clampBill = (v: number): number =>
  Number.isFinite(v)
    ? Math.max(-BILL_BIG, Math.min(BILL_BIG, v))
    : v > 0
      ? BILL_BIG
      : -BILL_BIG;

/** Polynomial in a Chebyshev basis on time scaled to the training range. Extrapolation allowed. */
export function fitBill(
  ts: ArrayLike<number>,
  ys: ArrayLike<number>,
  degree: number,
): BillModel {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < ts.length; i++) {
    lo = Math.min(lo, ts[i]!);
    hi = Math.max(hi, ts[i]!);
  }
  const span = hi > lo ? hi - lo : 1;
  const toHour = (t: number) => ((t - lo) / span) * 24;
  const m = fitPoly(Array.from(ts, toHour), ys, degree);
  return {
    degree: m.degree,
    capped: m.capped,
    predict: (t) => clampBill(m.predict(toHour(t))),
  };
}

export type SplitMethod = 'random' | 'future';

export interface BillSplit {
  train: number[];
  val: number[];
}

/** Random: a seeded 25% of the months held back. Future: months 36-47 held back. */
export function billSplit(n: number, method: SplitMethod, seed: number): BillSplit {
  if (method === 'future') {
    const cut = Math.round(n * 0.75);
    return {
      train: Array.from({ length: cut }, (_, i) => i),
      val: Array.from({ length: n - cut }, (_, i) => cut + i),
    };
  }
  const nVal = Math.max(2, Math.round(n * 0.25));
  const order = shuffledIndices(n, seed);
  return {
    val: order.slice(0, nVal).sort((a, b) => a - b),
    train: order.slice(nVal).sort((a, b) => a - b),
  };
}

export interface BillFit {
  model: BillModel;
  split: BillSplit;
  valRmse: number;
  clipped: boolean;
}

export function billFit(
  pool: BillSeries,
  method: SplitMethod,
  degree: number,
  seed: number,
): BillFit | null {
  if (pool.t.length < 8) return null;
  const split = billSplit(pool.t.length, method, seed);
  const model = fitBill(pick(pool.t, split.train), pick(pool.y, split.train), degree);
  let s = 0;
  let clipped = false;
  for (const i of split.val) {
    const p = model.predict(pool.t[i]!);
    if (Math.abs(p) >= BILL_BIG) clipped = true;
    s += (pool.y[i]! - p) ** 2;
  }
  return { model, split, valRmse: Math.sqrt(s / split.val.length), clipped };
}

export function validationSplitByMethod(
  pool: BillSeries,
  method: SplitMethod,
  degree: number,
  seed: number,
): number {
  return billFit(pool, method, degree, seed)?.valRmse ?? NaN;
}

export interface NextYear {
  error: number;
  clipped: boolean;
}

/** Refit on all observed months; exact expected RMSE on months 48..59. Always finite. */
export function realNextYearError(
  pool: BillSeries,
  degree: number,
  noiseSd = BILL_NOISE,
  from = OBSERVED,
  to = BILL_MONTHS,
): NextYear {
  if (pool.t.length < 3) return { error: noiseSd, clipped: false };
  const model = fitBill(pool.t, pool.y, degree);
  let s = 0;
  let clipped = false;
  for (let t = from; t < to; t++) {
    const p = model.predict(t);
    if (Math.abs(p) >= BILL_BIG) clipped = true;
    s += (billTruth(t) - p) ** 2;
  }
  return { error: Math.sqrt(noiseSd * noiseSd + s / Math.max(1, to - from)), clipped };
}

export interface BillCurves {
  validation: number[];
  real: number[];
  clippedValidation: boolean[];
  clippedReal: boolean[];
}

/** Both error lines of the second panel, degrees 1..maxDegree. */
export function billErrorsByDegree(
  pool: BillSeries,
  method: SplitMethod,
  seed: number,
  maxDegree = BILL_MAX_DEGREE,
): BillCurves {
  const out: BillCurves = {
    validation: [],
    real: [],
    clippedValidation: [],
    clippedReal: [],
  };
  for (let d = 1; d <= maxDegree; d++) {
    const f = billFit(pool, method, d, seed);
    const r = realNextYearError(pool, d);
    out.validation.push(f?.valRmse ?? NaN);
    out.clippedValidation.push(f?.clipped ?? false);
    out.real.push(r.error);
    out.clippedReal.push(r.clipped);
  }
  return out;
}

export interface BillPicks {
  random: MethodPicks;
  future: MethodPicks;
  reps: number;
}

/** Many fresh 48-month datasets; the degree 1..8 each split method picks and what it costs next year. */
export function pickByMethod(seed: number, reps = 100): BillPicks {
  const out: BillPicks = {
    random: { picks: [], errors: [] },
    future: { picks: [], errors: [] },
    reps,
  };
  for (let r = 0; r < reps; r++) {
    const s = repSeed(seed, r);
    const pool = observed(makeBills(s));
    for (const method of ['random', 'future'] as const) {
      const values = Array.from({ length: BILL_MAX_DEGREE }, (_, i) =>
        validationSplitByMethod(pool, method, i + 1, s + 1),
      );
      const d = bestDegree(values) ?? 1;
      out[method].picks.push(d);
      out[method].errors.push(realNextYearError(pool, d).error);
    }
  }
  return out;
}

/** Counts per value 1..maxValue (index 0 = value 1). */
export function histogramOf(values: number[], maxValue: number): number[] {
  const h = new Array<number>(maxValue).fill(0);
  for (const v of values) if (v >= 1 && v <= maxValue) h[v - 1]!++;
  return h;
}

export const mean = (v: ArrayLike<number>): number => {
  if (v.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  return s / v.length;
};

export const sd = (v: ArrayLike<number>): number => {
  if (v.length < 2) return 0;
  const m = mean(v);
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i]! - m) ** 2;
  return Math.sqrt(s / (v.length - 1));
};
