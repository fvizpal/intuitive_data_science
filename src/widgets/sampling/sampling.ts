/**
 * Pure math for the "Sampling and the central limit theorem" page. No React.
 * Nothing here returns NaN or Infinity: bad input gives null or an empty result.
 */
import { Phi } from '../../lib/normal';
import { mulberry32 } from '../../lib/random';

export { Phi };

// ---------- the population ----------

/** Population average. 0 for an empty population. */
export function popMean(pop: ArrayLike<number>): number {
  const n = pop.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += pop[i]!;
  return s / n;
}

/** Population SD: divide by N, because the population is a fixed list, not a sample. */
export function popSd(pop: ArrayLike<number>): number {
  const n = pop.length;
  if (n === 0) return 0;
  const m = popMean(pop);
  let s = 0;
  for (let i = 0; i < n; i++) s += (pop[i]! - m) ** 2;
  return Math.sqrt(s / n);
}

/** Theory: the SD of sample averages (the standard error) is sigma / sqrt(n). */
export function se(pop: ArrayLike<number>, n: number): number {
  return n >= 1 ? popSd(pop) / Math.sqrt(n) : 0;
}

/** n values drawn with replacement, seeded. */
export function drawSample(pop: ArrayLike<number>, n: number, seed: number): number[] {
  if (!(n >= 1) || pop.length === 0) return [];
  const rng = mulberry32(seed);
  const out = new Array<number>(Math.floor(n));
  for (let i = 0; i < out.length; i++) out[i] = pop[Math.floor(rng() * pop.length)]!;
  return out;
}

// ---------- the sample-average matrix ----------

export const REPS = 2000;
export const MAX_N = 800;

/** A fixed, per-row seed so rows fill independently (and in chunks). */
const rowSeed = (seed: number, r: number) =>
  (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(r + 1, 0x85ebca6b)) >>> 0;

/**
 * reps x maxN population indices. Row r is one "sample number r + 1"; its first n columns
 * are that sample at size n. Moving n up reuses the same draws (common random numbers), so
 * a histogram of averages narrows smoothly instead of flickering.
 */
export class SampleMatrix {
  readonly idx: Uint16Array;
  private readonly values: Float64Array;
  private filled = 0;
  private readonly cache = new Map<number, Float64Array>();

  constructor(
    readonly pop: ArrayLike<number>,
    readonly maxN: number,
    readonly reps: number,
    readonly seed: number,
  ) {
    this.idx = new Uint16Array(reps * maxN);
    this.values = Float64Array.from(pop as ArrayLike<number>);
  }

  get complete(): boolean {
    return this.filled >= this.reps;
  }

  /** Fill rows until `budgetMs` has passed (or all are done). Returns true when complete. */
  fillSome(budgetMs: number): boolean {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const N = this.pop.length;
    while (this.filled < this.reps) {
      const r = this.filled;
      const rng = mulberry32(rowSeed(this.seed, r));
      const base = r * this.maxN;
      for (let c = 0; c < this.maxN; c++) this.idx[base + c] = Math.floor(rng() * N);
      this.filled++;
      if (budgetMs > 0 && (this.filled & 15) === 0 && performance.now() - t0 > budgetMs)
        break;
    }
    return this.complete;
  }

  /** Fill everything now (tests, or after the async build has finished). */
  ensure(): void {
    if (!this.complete) this.fillSome(0);
  }

  /** The reps sample averages using the first n columns of each row. null if n is out of range. */
  meansForN(n: number): Float64Array | null {
    if (!(n >= 1) || n > this.maxN || !Number.isFinite(n)) return null;
    n = Math.floor(n);
    const hit = this.cache.get(n);
    if (hit) return hit;
    this.ensure();
    const out = new Float64Array(this.reps);
    const { idx, values, maxN } = this;
    for (let r = 0; r < this.reps; r++) {
      const base = r * maxN;
      let s = 0;
      for (let c = 0; c < n; c++) s += values[idx[base + c]!]!;
      out[r] = s / n;
    }
    if (this.cache.size >= 16)
      this.cache.delete(this.cache.keys().next().value as number);
    this.cache.set(n, out);
    return out;
  }

  /** The first n values of sample number row + 1. Empty when row or n is out of range. */
  sampleValues(row: number, n: number): number[] {
    if (!(n >= 1) || n > this.maxN || row < 0 || row >= this.reps) return [];
    this.ensure();
    const out = new Array<number>(Math.floor(n));
    const base = row * this.maxN;
    for (let c = 0; c < out.length; c++) out[c] = this.values[this.idx[base + c]!]!;
    return out;
  }
}

interface Entry {
  matrix: SampleMatrix;
  pending: Promise<SampleMatrix> | null;
}
const matrices = new WeakMap<object, Map<string, Entry>>();

function entryFor(
  pop: ArrayLike<number>,
  maxN: number,
  reps: number,
  seed: number,
): Entry | null {
  if (!(maxN >= 1) || !(reps >= 1) || maxN > 65535 || pop.length === 0) return null;
  if (pop.length > 65535) return null;
  const key = `${maxN}|${reps}|${seed}`;
  let byKey = matrices.get(pop as object);
  if (!byKey) {
    byKey = new Map();
    matrices.set(pop as object, byKey);
  }
  let e = byKey.get(key);
  if (!e) {
    e = {
      matrix: new SampleMatrix(pop, Math.floor(maxN), Math.floor(reps), seed),
      pending: null,
    };
    byKey.set(key, e);
  }
  return e;
}

/** The (memoized) matrix, built right now. null for impossible sizes. */
export function sampleMeansMatrix(
  pop: ArrayLike<number>,
  maxN: number,
  reps: number,
  seed: number,
): SampleMatrix | null {
  const e = entryFor(pop, maxN, reps, seed);
  if (!e) return null;
  e.matrix.ensure();
  return e.matrix;
}

/** The matrix if it is already fully built, otherwise null (never builds anything). */
export function readyMatrix(
  pop: ArrayLike<number>,
  maxN: number,
  reps: number,
  seed: number,
): SampleMatrix | null {
  const e = matrices.get(pop as object)?.get(`${maxN}|${reps}|${seed}`);
  return e && e.matrix.complete ? e.matrix : null;
}

/**
 * Build the matrix in small slices so the page stays responsive. Resolves with the same
 * memoized matrix `sampleMeansMatrix` would return; null for impossible sizes.
 */
export function prepareMatrix(
  pop: ArrayLike<number>,
  maxN: number,
  reps: number,
  seed: number,
): Promise<SampleMatrix | null> {
  const e = entryFor(pop, maxN, reps, seed);
  if (!e) return Promise.resolve(null);
  if (e.matrix.complete) return Promise.resolve(e.matrix);
  if (!e.pending) {
    const m = e.matrix;
    e.pending = new Promise<SampleMatrix>((resolve) => {
      const step = () => {
        if (m.fillSome(8)) resolve(m);
        else setTimeout(step, 0);
      };
      setTimeout(step, 0);
    });
  }
  return e.pending;
}

/** The reps sample averages for n people, from a matrix. null for an unusable n. */
export function meansForN(matrix: SampleMatrix | null, n: number): Float64Array | null {
  return matrix ? matrix.meansForN(n) : null;
}

// ---------- reading a pile of averages ----------

export function sdOf(values: ArrayLike<number>, sample = true): number | null {
  const n = values.length;
  const d = sample ? n - 1 : n;
  if (n < 1 || d < 1) return null;
  let m = 0;
  for (let i = 0; i < n; i++) m += values[i]!;
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (values[i]! - m) ** 2;
  return Math.sqrt(s / d);
}

export function meanOf(values: ArrayLike<number>): number | null {
  const n = values.length;
  if (n < 1) return null;
  let s = 0;
  for (let i = 0; i < n; i++) s += values[i]!;
  return s / n;
}

/** Share of values within +/- halfWidth of center. null for an empty list. */
export function shareWithin(
  means: ArrayLike<number>,
  center: number,
  halfWidth: number,
): number | null {
  const n = means.length;
  if (n === 0) return null;
  let c = 0;
  for (let i = 0; i < n; i++) if (Math.abs(means[i]! - center) <= halfWidth) c++;
  return c / n;
}

/**
 * How far a pile of averages is from a bell: standardize them (sample mean, sample SD) and
 * take the biggest vertical distance between their cumulative curve and the bell's. 0 is a
 * perfect bell. null for fewer than 30 averages or no spread.
 */
export function bellGap(means: ArrayLike<number>): number | null {
  const m = means.length;
  if (m < 30) return null;
  const mu = meanOf(means)!;
  const sd = sdOf(means);
  if (sd === null || !(sd > 1e-12)) return null;
  const sorted = Float64Array.from(means as ArrayLike<number>).sort();
  let d = 0;
  for (let i = 0; i < m; i++) {
    const c = Phi((sorted[i]! - mu) / sd);
    d = Math.max(d, (i + 1) / m - c, c - i / m);
  }
  return d;
}

/** Conventions, not laws: calibrated on the populations of this page. */
export const BELL_CLOSE = 0.04;
export const BELL_FAR = 0.06;

export type BellLabel = 'close to a bell' | 'getting there' | 'not a bell yet';

export function bellReading(gap: number | null): BellLabel | null {
  if (gap === null || !Number.isFinite(gap)) return null;
  if (gap < BELL_CLOSE) return 'close to a bell';
  if (gap < BELL_FAR) return 'getting there';
  return 'not a bell yet';
}

// ---------- rare events ----------

/** Sample proportions of ones (e.g. faulty bulbs) in `reps` samples of n, via the matrix. */
export function proportionSamples(
  pop: ArrayLike<number>,
  n: number,
  reps: number,
  seed = 1,
): Float64Array | null {
  if (!(n >= 1) || !(reps >= 1)) return null;
  const m = sampleMeansMatrix(pop, Math.max(Math.floor(n), 1000), reps, seed);
  return m ? m.meansForN(n) : null;
}

/** Share of samples of n with no events at all when each item has chance p: (1 - p)^n. */
export function expectedZeroShare(p: number, n: number): number {
  if (!(n >= 1) || !(p >= 0) || p > 1) return 0;
  return Math.pow(1 - p, n);
}

/** Share a bell-curve approximation would put below zero events. */
export function normalBelowZero(p: number, n: number): number {
  if (!(n >= 1) || !(p > 0) || !(p < 1)) return 0;
  return Phi((0 - p) / Math.sqrt((p * (1 - p)) / n));
}

/** Rule of thumb: about 10 events per sample. */
export function needForTenEvents(p: number): number {
  return p > 0 && p <= 1 ? Math.ceil(10 / p - 1e-9) : 0;
}

// ---------- histogram helper ----------

export interface BinResult {
  counts: Int32Array;
  below: number;
  above: number;
}

/** Equal-width bin counts over [lo, hi] for the first `count` values; hi goes in the last bin. */
export function binCounts(
  values: ArrayLike<number>,
  lo: number,
  hi: number,
  width: number,
  count = values.length,
): BinResult {
  const nBins = width > 0 && hi > lo ? Math.max(1, Math.round((hi - lo) / width)) : 1;
  const counts = new Int32Array(nBins);
  let below = 0;
  let above = 0;
  const n = Math.min(count, values.length);
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < lo) below++;
    else if (v > hi) above++;
    else counts[Math.min(nBins - 1, Math.floor((v - lo) / width + 1e-9))]!++;
  }
  return { counts, below, above };
}
