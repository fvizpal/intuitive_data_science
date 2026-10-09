/** Pure descriptive statistics. No React; everything here is unit-tested. */

/** Skewness beyond this (either way) counts as a visible tail. */
export const SKEW_THRESHOLD = 0.5;

export type SkewLabel = 'roughly symmetric' | 'tail to the right' | 'tail to the left';

const sortedCopy = (values: readonly number[]): number[] =>
  [...values].sort((a, b) => a - b);

/** Mean. NaN for an empty list; the UI checks `n` first. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function median(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return NaN;
  const s = sortedCopy(values);
  const mid = Math.floor(n / 2);
  return n % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * Every value tied for the highest count, ascending. Empty when no value repeats
 * (every count is 1), because then there is no "most common" value.
 */
export function modes(values: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let top = 0;
  for (const c of counts.values()) if (c > top) top = c;
  if (top <= 1) return [];
  return [...counts.entries()]
    .filter(([, c]) => c === top)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

export function range(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return Math.max(...values) - Math.min(...values);
}

/** Sample variance (divide by n − 1) by default; population variance with `sample = false`. */
export function variance(values: readonly number[], sample = true): number {
  const n = values.length;
  const d = sample ? n - 1 : n;
  if (n === 0 || d <= 0) return NaN;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return s / d;
}

export function std(values: readonly number[], sample = true): number {
  return Math.sqrt(variance(values, sample));
}

/** Quantile with linear interpolation, the same as numpy.percentile's default. q is in [0, 1]. */
export function quantile(values: readonly number[], q: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const s = sortedCopy(values);
  const h = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return (s[lo] as number) + (h - lo) * ((s[hi] as number) - (s[lo] as number));
}

export function quartiles(values: readonly number[]): {
  q1: number;
  q2: number;
  q3: number;
} {
  return {
    q1: quantile(values, 0.25),
    q2: quantile(values, 0.5),
    q3: quantile(values, 0.75),
  };
}

export function iqr(values: readonly number[]): number {
  const { q1, q3 } = quartiles(values);
  return q3 - q1;
}

/** Share (0 to 1) of values strictly below `v`. */
export function percentileRank(values: readonly number[], v: number): number {
  if (values.length === 0) return NaN;
  let below = 0;
  for (const x of values) if (x < v) below++;
  return below / values.length;
}

export interface BoxStats {
  q1: number;
  median: number;
  q3: number;
  iqr: number;
  /** Lowest data point inside the fences. */
  whiskerLow: number;
  /** Highest data point inside the fences. */
  whiskerHigh: number;
  fenceLow: number;
  fenceHigh: number;
  /** Points beyond the 1.5 × IQR fences, ascending. */
  outliers: number[];
}

export function boxStats(values: readonly number[]): BoxStats {
  const { q1, q2, q3 } = quartiles(values);
  const spread = q3 - q1;
  const fenceLow = q1 - 1.5 * spread;
  const fenceHigh = q3 + 1.5 * spread;
  const s = sortedCopy(values);
  const inside = s.filter((v) => v >= fenceLow && v <= fenceHigh);
  return {
    q1,
    median: q2,
    q3,
    iqr: spread,
    whiskerLow: inside.length ? (inside[0] as number) : NaN,
    whiskerHigh: inside.length ? (inside[inside.length - 1] as number) : NaN,
    fenceLow,
    fenceHigh,
    outliers: s.filter((v) => v < fenceLow || v > fenceHigh),
  };
}

/** Adjusted Fisher-Pearson skewness (G1). 0 when there are fewer than 3 values or no spread. */
export function skewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = std(values);
  if (!(sd > 0)) return 0;
  let s = 0;
  for (const v of values) s += ((v - m) / sd) ** 3;
  return (n / ((n - 1) * (n - 2))) * s;
}

export function skewLabel(skew: number): SkewLabel {
  if (skew > SKEW_THRESHOLD) return 'tail to the right';
  if (skew < -SKEW_THRESHOLD) return 'tail to the left';
  return 'roughly symmetric';
}

/** Mean after dropping `floor(proportion × n)` values from each end. */
export function trimmedMean(values: readonly number[], proportion: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const p = Math.min(0.49, Math.max(0, proportion));
  const cut = Math.floor(p * n);
  return mean(sortedCopy(values).slice(cut, n - cut));
}

/** Σ(w·x) / Σ(w). Throws when the weights do not add up to something positive. */
export function weightedMean(
  values: readonly number[],
  weights: readonly number[],
): number {
  if (values.length !== weights.length)
    throw new RangeError('values and weights differ in length');
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] as number;
    if (w < 0) throw new RangeError('weights must not be negative');
    sw += w;
    swx += w * (values[i] as number);
  }
  if (!(sw > 0)) throw new RangeError('weights must sum to more than zero');
  return swx / sw;
}

/** Counts per equal-width bin over [lo, hi]; values outside are ignored, hi goes in the last bin. */
export function histogramCounts(
  values: readonly number[],
  lo: number,
  hi: number,
  bins: number,
): number[] {
  const counts = new Array<number>(bins).fill(0);
  const width = (hi - lo) / bins;
  if (!(width > 0)) return counts;
  for (const v of values) {
    if (v < lo || v > hi) continue;
    const b = Math.min(bins - 1, Math.floor((v - lo) / width));
    counts[b] = (counts[b] as number) + 1;
  }
  return counts;
}

/**
 * Indexes of the histogram peaks: bins that are the tallest within `radius` bins on each
 * side and at least `minShare` of the tallest bin overall. Used for the "mode" of
 * continuous data, which has no repeated values.
 */
export function histogramPeaks(
  counts: readonly number[],
  radius = 3,
  minShare = 0.6,
): number[] {
  const top = Math.max(0, ...counts);
  if (top === 0) return [];
  const peaks: number[] = [];
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i] as number;
    if (c < top * minShare) continue;
    let best = true;
    for (
      let j = Math.max(0, i - radius);
      j <= Math.min(counts.length - 1, i + radius);
      j++
    ) {
      const other = counts[j] as number;
      if (other > c || (other === c && j < i)) {
        best = false;
        break;
      }
    }
    if (best) peaks.push(i);
  }
  return peaks;
}
