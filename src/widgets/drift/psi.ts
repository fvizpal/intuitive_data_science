/**
 * Pure math for "PSI and drift". No React.
 *
 * Words: the "expected" population is the one the model was built on ("build time"); the
 * "actual" population is the one being monitored ("today"). Higher score = safer.
 * Bins are cut once from the build-time sample and reused unchanged for today's data;
 * the outer bins are open-ended. Anything that cannot be computed returns null, never
 * NaN or Infinity.
 */
import { Phi } from '../../lib/normal';
import { mulberry32, normal } from '../../lib/random';

// ---------- reading a PSI: conventions, not laws ----------

export const PSI_INVESTIGATE = 0.1;
export const PSI_SIGNIFICANT = 0.25;
export const PSI_FLOOR = 1e-4;

export type PsiBand = 'stable' | 'investigate' | 'significant shift';

export function psiBand(value: number): PsiBand {
  if (value < PSI_INVESTIGATE) return 'stable';
  if (value < PSI_SIGNIFICANT) return 'investigate';
  return 'significant shift';
}

// ---------- slicing the score line ----------

/** Linear-interpolation quantile of an ascending array (numpy's default). */
function quantileSorted(sorted: Float64Array, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (pos - lo) * (sorted[hi]! - sorted[lo]!);
}

function finiteSorted(values: ArrayLike<number>): Float64Array {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++)
    if (Number.isFinite(values[i]!)) out.push(values[i]!);
  const a = Float64Array.from(out);
  a.sort();
  return a;
}

/**
 * k - 1 interior edges that cut the baseline into k equal-count slices. Ties can make
 * edges coincide (or sit on the minimum, which would leave an empty first slice); those
 * are dropped, so fewer edges may come back. A baseline with no spread gives no edges.
 */
export function quantileEdges(baseline: ArrayLike<number>, k: number): number[] {
  const sorted = finiteSorted(baseline);
  const slices = Math.floor(k);
  if (sorted.length === 0 || slices < 2) return [];
  const min = sorted[0]!;
  const edges: number[] = [];
  for (let j = 1; j < slices; j++) {
    const e = quantileSorted(sorted, j / slices);
    if (e > min && (edges.length === 0 || e > edges[edges.length - 1]!)) edges.push(e);
  }
  return edges;
}

/** k - 1 interior edges evenly spaced between the baseline minimum and maximum. */
export function equalWidthEdges(baseline: ArrayLike<number>, k: number): number[] {
  const sorted = finiteSorted(baseline);
  const slices = Math.floor(k);
  if (sorted.length === 0 || slices < 2) return [];
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  if (!(max > min)) return [];
  const edges: number[] = [];
  for (let j = 1; j < slices; j++) edges.push(min + ((max - min) * j) / slices);
  return edges;
}

/** Slice index of a value: the number of edges at or below it (left-closed slices). */
export function binIndex(value: number, edges: readonly number[]): number {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (edges[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface BinShares {
  counts: number[];
  /** Counts divided by the number of finite values; sums to 1 (all zeros if empty). */
  shares: number[];
  n: number;
}

export function binShares(
  values: ArrayLike<number>,
  edges: readonly number[],
): BinShares {
  const counts = new Array<number>(edges.length + 1).fill(0);
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    counts[binIndex(v, edges)]!++;
    n++;
  }
  return { counts, shares: counts.map((c) => (n ? c / n : 0)), n };
}

// ---------- PSI ----------

export interface PsiResult {
  total: number;
  /** One term per slice: (a - e) * ln(a / e) after flooring. Never negative. */
  contributions: number[];
}

/** PSI between two share vectors. Shares below `floor` are raised to it (no renormalizing). */
export function psi(
  expectedShares: readonly number[],
  actualShares: readonly number[],
  { floor = PSI_FLOOR }: { floor?: number } = {},
): PsiResult | null {
  if (expectedShares.length !== actualShares.length || expectedShares.length === 0)
    return null;
  const contributions: number[] = [];
  let total = 0;
  for (let i = 0; i < expectedShares.length; i++) {
    const e0 = expectedShares[i]!;
    const a0 = actualShares[i]!;
    if (!Number.isFinite(e0) || !Number.isFinite(a0)) return null;
    const e = Math.max(e0, floor);
    const a = Math.max(a0, floor);
    const c = (a - e) * Math.log(a / e);
    contributions.push(c);
    total += c;
  }
  return { total, contributions };
}

export function psiFromSamples(
  baseline: ArrayLike<number>,
  today: ArrayLike<number>,
  edges: readonly number[],
): PsiResult | null {
  const e = binShares(baseline, edges);
  const a = binShares(today, edges);
  if (e.n === 0 || a.n === 0) return null;
  return psi(e.shares, a.shares);
}

// ---------- idealized populations (no sampling) ----------

export interface NormalPop {
  mean: number;
  sd: number;
}

function normalShares(edges: readonly number[], pop: NormalPop): number[] {
  const cdf = edges.map((e) => Phi((e - pop.mean) / pop.sd));
  const out: number[] = [];
  let prev = 0;
  for (const c of cdf) {
    out.push(c - prev);
    prev = c;
  }
  out.push(1 - prev);
  return out;
}

/** PSI of two idealized bell-shaped populations, from the normal curve, same slicing rules. */
export function psiNormalExact(
  edges: readonly number[],
  base: NormalPop,
  today: NormalPop,
  { floor = PSI_FLOOR }: { floor?: number } = {},
): number | null {
  if (!(base.sd > 0) || !(today.sd > 0)) return null;
  return (
    psi(normalShares(edges, base), normalShares(edges, today), { floor })?.total ?? null
  );
}

/**
 * The size of average shift (in score points, always positive; PSI is symmetric) at which
 * the idealized PSI reaches `target`. Null if no shift up to six standard deviations does.
 */
export function shiftForPsi(
  target: number,
  edges: readonly number[],
  base: NormalPop,
): number | null {
  if (!(target > 0) || !(base.sd > 0)) return null;
  const at = (s: number) =>
    psiNormalExact(edges, base, { mean: base.mean + s, sd: base.sd }) ?? 0;
  let lo = 0;
  let hi = 6 * base.sd;
  if (at(hi) < target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** About what PSI averages when nothing changed: (slices - 1) * (1 / today + 1 / build time). */
export function expectedNoisePsi(k: number, nExpected: number, nActual: number): number {
  if (!(k > 1) || !(nExpected > 0) || !(nActual > 0)) return 0;
  return (k - 1) * (1 / nActual + 1 / nExpected);
}

// ---------- made-up scores ----------

export const BASE_MEAN = 640;
export const BASE_SD = 60;
export const SEGMENT_MEAN = 540;
export const SEGMENT_SD = 50;

export interface DriftOptions {
  baseMean?: number;
  baseSd?: number;
  /** Points the average moves (negative = riskier). */
  shift?: number;
  /** Multiplier on the standard deviation. */
  spreadMult?: number;
  /** Share of today's applicants who come from a new, lower-scoring group. */
  newSegmentShare?: number;
  segmentMean?: number;
  segmentSd?: number;
}

/**
 * Integer bell-shaped scores. Common random numbers: the normal draws and the
 * segment-membership uniforms of applicant i depend only on (seed, i), so moving `shift`
 * or `spreadMult` slides the same applicants instead of reshuffling them.
 */
export function driftedScores(
  seed: number,
  n: number,
  {
    baseMean = BASE_MEAN,
    baseSd = BASE_SD,
    shift = 0,
    spreadMult = 1,
    newSegmentShare = 0,
    segmentMean = SEGMENT_MEAN,
    segmentSd = SEGMENT_SD,
  }: DriftOptions = {},
): number[] {
  const rng = mulberry32(seed);
  const out = new Array<number>(Math.max(0, Math.floor(n)));
  for (let i = 0; i < out.length; i++) {
    const z = normal(rng);
    const u = rng();
    const z2 = normal(rng);
    const v =
      u < newSegmentShare
        ? segmentMean + segmentSd * z2
        : baseMean + shift + spreadMult * baseSd * z;
    out[i] = Math.round(v);
  }
  return out;
}

// ---------- real-scorecard drift ----------

/**
 * Importance resampling with replacement: `n` rows drawn with weight exp(tilt * z-score of
 * the row's score). Negative tilt = more low-score applicants. Rows with a missing score
 * get weight 1. The uniforms depend only on the seed, so the draw moves smoothly with tilt.
 * Never mutates its inputs.
 */
export function tiltResample<T>(
  rows: readonly T[],
  scores: ArrayLike<number>,
  tilt: number,
  n: number,
  seed: number,
): T[] {
  const m = Math.min(rows.length, scores.length);
  if (m === 0 || n <= 0) return [];
  let count = 0;
  let sum = 0;
  for (let i = 0; i < m; i++) {
    const s = scores[i]!;
    if (Number.isFinite(s)) {
      count++;
      sum += s;
    }
  }
  const mean = count ? sum / count : 0;
  let ss = 0;
  for (let i = 0; i < m; i++) {
    const s = scores[i]!;
    if (Number.isFinite(s)) ss += (s - mean) * (s - mean);
  }
  const sd = count > 1 ? Math.sqrt(ss / count) : 0;
  const cum = new Float64Array(m);
  let total = 0;
  for (let i = 0; i < m; i++) {
    const s = scores[i]!;
    const z = Number.isFinite(s) && sd > 0 ? (s - mean) / sd : 0;
    total += Math.exp(tilt * z);
    cum[i] = total;
  }
  const rng = mulberry32(seed);
  const out: T[] = [];
  for (let j = 0; j < n; j++) {
    const target = rng() * total;
    let lo = 0;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cum[mid]! > target) hi = mid;
      else lo = mid + 1;
    }
    out.push(rows[lo]!);
  }
  return out;
}

/**
 * Flags are 1 = good, 0 = bad. With probability `fade`, a row's flag is replaced by a
 * Bernoulli draw at the overall good rate, independent of everything else, so the score
 * loses its grip while the overall default rate stays put. fade = 0 changes nothing.
 */
export function fadeRelationship(
  flags: ArrayLike<number>,
  fade: number,
  seed: number,
  goodRate: number,
): number[] {
  const rng = mulberry32(seed);
  const out = new Array<number>(flags.length);
  for (let i = 0; i < flags.length; i++) {
    const u = rng();
    const v = rng();
    out[i] = u < fade ? (v < goodRate ? 1 : 0) : flags[i]!;
  }
  return out;
}

/**
 * Default rate inside each slice. Flags are 1 = good, 0 = bad. A slice with nobody in it
 * reports null rather than NaN.
 */
export function bandDefaultRates(
  scores: ArrayLike<number>,
  flags: ArrayLike<number>,
  edges: readonly number[],
): (number | null)[] {
  const n = Math.min(scores.length, flags.length);
  const total = new Array<number>(edges.length + 1).fill(0);
  const bad = new Array<number>(edges.length + 1).fill(0);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(scores[i]!)) continue;
    const b = binIndex(scores[i]!, edges);
    total[b]!++;
    if (!flags[i]) bad[b]!++;
  }
  return total.map((t, b) => (t ? bad[b]! / t : null));
}
