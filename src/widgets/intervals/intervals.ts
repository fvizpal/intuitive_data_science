/**
 * Pure math for the "Confidence intervals" page. No React.
 * Nothing here returns NaN or Infinity: bad input gives null or an explicit empty result.
 */
import { normalQuantile } from '../../lib/normal';
import { sampleMeansMatrix, type SampleMatrix, meansForN } from '../sampling/sampling';

export const REPS = 2000;
/** Largest sample for averages (commute, cricket, bias). */
export const MAX_N = 800;
/** Largest batch for yes/no rates (the poll goes to 1,000). */
export const MAX_N_RATE = 1000;

export type Level = 0.8 | 0.9 | 0.95 | 0.99;
export const LEVELS: readonly Level[] = [0.8, 0.9, 0.95, 0.99];
export const DEFAULT_LEVEL: Level = 0.95;

const validLevel = (level: number) => Number.isFinite(level) && level > 0 && level < 1;

// ---------- special functions ----------

/** ln Gamma(x) for x > 0 (Lanczos, g = 7). */
function lgamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (modified Lentz). */
function betacf(x: number, a: number, b: number): number {
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b), 0 <= x <= 1. */
function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(x, a, b)) / a
    : 1 - (bt * betacf(1 - x, b, a)) / b;
}

// ---------- t and z multipliers ----------

/** Cumulative probability of Student's t with df degrees of freedom. */
export function tCdf(x: number, df: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const d = Math.max(1, df);
  const tail = 0.5 * incBeta(d / (d + x * x), d / 2, 0.5);
  return x > 0 ? 1 - tail : tail;
}

/** The t with tCdf(t, df) = p. p is clamped to (1e-9, 1 - 1e-9); df to at least 1. */
export function tQuantile(p: number, df: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, Number.isFinite(p) ? p : 0.5));
  if (q === 0.5) return 0;
  if (q < 0.5) return -tQuantile(1 - q, df);
  let lo = 0;
  let hi = 1;
  while (tCdf(hi, df) < q && hi < 1e12) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const critCache = new Map<string, number>();

/** Multiplier for a two-sided interval: tQuantile(1 - (1 - level) / 2, df). Cached. */
export function tCrit(level: number, df: number): number {
  if (!validLevel(level)) return 0;
  const d = Math.max(1, Math.floor(df));
  const key = `${level}|${d}`;
  let v = critCache.get(key);
  if (v === undefined) {
    v = tQuantile(1 - (1 - level) / 2, d);
    critCache.set(key, v);
  }
  return v;
}

/** The large-sample multiplier (1.96 at 95%). */
export function zCrit(level: number): number {
  return validLevel(level) ? normalQuantile(1 - (1 - level) / 2) : 0;
}

// ---------- one interval for an average ----------

export interface MeanInterval {
  mean: number;
  /** Sample SD, divide by n - 1. */
  sd: number;
  /** Standard error: sd / sqrt(n). */
  se: number;
  crit: number;
  /** Margin of error: crit * se. */
  half: number;
  lo: number;
  hi: number;
  n: number;
}

export function sampleInterval(
  values: ArrayLike<number>,
  level: number,
): MeanInterval | null {
  const n = values.length;
  if (n < 2 || !validLevel(level)) return null;
  let m = 0;
  for (let i = 0; i < n; i++) m += values[i]!;
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (values[i]! - m) ** 2;
  const sd = Math.sqrt(s / (n - 1));
  const se = sd / Math.sqrt(n);
  const crit = tCrit(level, n - 1);
  const half = crit * se;
  if (![m, sd, se, half].every(Number.isFinite)) return null;
  return { mean: m, sd, se, crit, half, lo: m - half, hi: m + half, n };
}

export function covers(iv: { lo: number; hi: number } | null, truth: number): boolean {
  return iv !== null && Number.isFinite(truth) && iv.lo <= truth && truth <= iv.hi;
}

// ---------- many intervals at once (shared samples) ----------

export interface IntervalStats {
  n: number;
  reps: number;
  mean: Float64Array;
  /** Sample SD (n - 1) of each row. */
  sd: Float64Array;
}

export interface IntervalSet {
  n: number;
  level: number;
  crit: number;
  lo: Float64Array;
  hi: Float64Array;
  half: Float64Array;
  /** 1 when the interval caught the truth. All zero when no truth was given. */
  caught: Uint8Array;
}

const statsCache = new WeakMap<SampleMatrix, Map<number, IntervalStats>>();

/**
 * Per-row mean and SD of `reps` samples of n. Rows come from the memoized index matrix, so
 * moving n up reuses the same draws and the first n columns of a row are a prefix of the
 * first m columns. Memoized per (population identity, seed, n). null for n < 2 or n too big.
 */
export function intervalStatsForN(
  pop: ArrayLike<number>,
  n: number,
  reps: number,
  seed: number,
  maxN: number = MAX_N,
): IntervalStats | null {
  if (!(n >= 2) || !Number.isFinite(n) || !(reps >= 1) || pop.length === 0) return null;
  n = Math.floor(n);
  const matrix = sampleMeansMatrix(pop, Math.max(maxN, n), reps, seed);
  if (!matrix) return null;
  let byN = statsCache.get(matrix);
  if (!byN) {
    byN = new Map();
    statsCache.set(matrix, byN);
  }
  const hit = byN.get(n);
  if (hit) return hit;
  const { idx, maxN: stride } = matrix;
  const rows = matrix.reps;
  const mean = new Float64Array(rows);
  const sd = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const base = r * stride;
    let s = 0;
    for (let c = 0; c < n; c++) s += pop[idx[base + c]!]!;
    const m = s / n;
    let ss = 0;
    for (let c = 0; c < n; c++) ss += (pop[idx[base + c]!]! - m) ** 2;
    mean[r] = m;
    sd[r] = Math.sqrt(ss / (n - 1));
  }
  const out: IntervalStats = { n, reps: rows, mean, sd };
  if (byN.size >= 24) byN.delete(byN.keys().next().value as number);
  byN.set(n, out);
  return out;
}

/** Intervals for any level from cached stats. Only the multiplier changes: no redraw. */
export function intervalsFromStats(
  stats: IntervalStats | null,
  level: number,
  truth?: number,
): IntervalSet | null {
  if (!stats || stats.n < 2 || !validLevel(level)) return null;
  const crit = tCrit(level, stats.n - 1);
  const k = crit / Math.sqrt(stats.n);
  const rows = stats.reps;
  const lo = new Float64Array(rows);
  const hi = new Float64Array(rows);
  const half = new Float64Array(rows);
  const caught = new Uint8Array(rows);
  const hasTruth = truth !== undefined && Number.isFinite(truth);
  for (let r = 0; r < rows; r++) {
    const h = stats.sd[r]! * k;
    half[r] = h;
    lo[r] = stats.mean[r]! - h;
    hi[r] = stats.mean[r]! + h;
    if (hasTruth && lo[r]! <= truth && truth <= hi[r]!) caught[r] = 1;
  }
  return { n: stats.n, level, crit, lo, hi, half, caught };
}

/** Share of intervals in [from, to) that caught the truth. null when the range is empty. */
export function coverage(
  iv: { lo: ArrayLike<number>; hi: ArrayLike<number> } | null,
  truth: number,
  from = 0,
  to?: number,
): number | null {
  if (!iv || !Number.isFinite(truth)) return null;
  const end = Math.min(to ?? iv.lo.length, iv.lo.length);
  const start = Math.max(0, from);
  if (end <= start) return null;
  let c = 0;
  for (let r = start; r < end; r++) if (iv.lo[r]! <= truth && truth <= iv.hi[r]!) c++;
  return c / (end - start);
}

/** Average of an array range. null when empty. */
export function meanRange(a: ArrayLike<number>, from = 0, to = a.length): number | null {
  const end = Math.min(to, a.length);
  if (end <= from) return null;
  let s = 0;
  for (let i = from; i < end; i++) s += a[i]!;
  return s / (end - from);
}

/** The central `level` share of the population's own values (linear interpolation). */
export function individualRange(
  pop: ArrayLike<number>,
  level: number,
): { lo: number; hi: number } | null {
  if (pop.length === 0 || !validLevel(level)) return null;
  const sorted = Float64Array.from(pop as ArrayLike<number>).sort();
  const q = (p: number) => {
    const pos = p * (sorted.length - 1);
    const i = Math.floor(pos);
    const next = sorted[Math.min(sorted.length - 1, i + 1)]!;
    return sorted[i]! + (pos - i) * (next - sorted[i]!);
  };
  return { lo: q((1 - level) / 2), hi: q(1 - (1 - level) / 2) };
}

// ---------- yes/no rates ----------

export type RateMethod = 'simple' | 'wilson';

export interface RateInterval {
  pHat: number;
  /** Raw for "simple" (can go below 0 or above 1); always inside [0, 1] for "wilson". */
  lo: number;
  hi: number;
  half: number;
  /** Simple only: the lower end fell below 0. */
  belowZero: boolean;
  /** Simple only: k = 0 or k = n, so the interval has zero width. */
  degenerate: boolean;
}

export function proportionInterval(
  k: number,
  n: number,
  level: number,
  method: RateMethod,
): RateInterval | null {
  if (!(n >= 1) || !Number.isInteger(n) || !(k >= 0) || k > n || !validLevel(level))
    return null;
  const p = k / n;
  const z = zCrit(level);
  if (method === 'simple') {
    const half = z * Math.sqrt((p * (1 - p)) / n);
    return {
      pHat: p,
      lo: p - half,
      hi: p + half,
      half,
      belowZero: p - half < 0,
      degenerate: k === 0 || k === n,
    };
  }
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    pHat: p,
    lo: Math.max(0, center - half),
    hi: Math.min(1, center + half),
    half,
    belowZero: false,
    degenerate: false,
  };
}

/**
 * Exact chance that the interval catches the true rate p when each batch has n items:
 * add up the binomial probability of every k whose interval contains p.
 * The pmf is built by a recurrence in log space, so it never overflows.
 */
export function exactCoverage(
  p: number,
  n: number,
  level: number,
  method: RateMethod,
): number | null {
  if (!(n >= 1) || !Number.isInteger(n) || !(p >= 0) || p > 1 || !validLevel(level))
    return null;
  const hit = (k: number) => {
    const iv = proportionInterval(k, n, level, method);
    return iv !== null && iv.lo <= p && p <= iv.hi;
  };
  if (p === 0) return hit(0) ? 1 : 0;
  if (p === 1) return hit(n) ? 1 : 0;
  const ratio = Math.log(p / (1 - p));
  let logPmf = n * Math.log(1 - p);
  let total = 0;
  for (let k = 0; k <= n; k++) {
    if (hit(k)) total += Math.exp(logPmf);
    logPmf += Math.log((n - k) / (k + 1)) + ratio;
  }
  return Math.min(1, Math.max(0, total));
}

/**
 * Sample proportions of ones in `reps` samples of n (yes/no populations), from the memoized
 * index matrix. Moving n reuses the same draws. null for n < 1.
 */
export function proportionSamples(
  pop: ArrayLike<number>,
  n: number,
  reps: number,
  seed: number,
): Float64Array | null {
  if (!(n >= 1) || !(reps >= 1) || pop.length === 0) return null;
  const matrix = sampleMeansMatrix(pop, Math.max(MAX_N_RATE, Math.ceil(n)), reps, seed);
  return matrix ? meansForN(matrix, n) : null;
}

/** Number of "yes" in each sample (the proportion times n, rounded). */
export function countsFromProportions(p: Float64Array, n: number): Int32Array {
  const out = new Int32Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = Math.round(p[i]! * n);
  return out;
}
