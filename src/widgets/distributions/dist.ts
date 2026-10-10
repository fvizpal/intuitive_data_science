/**
 * Pure math for the "Distributions and the bell curve" page. No React.
 * Nothing here returns NaN or Infinity: degenerate input gives null or an empty result.
 */
import { Phi } from '../../lib/normal';
import { iqr, mean, std } from '../averages/stats';

export { Phi };

// ---------- the bell curve ----------

/** Height of the bell curve at x. 0 when there is no spread. */
export function normalPdf(x: number, mu: number, sd: number): number {
  if (!(sd > 0)) return 0;
  const z = (x - mu) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/** Share of a bell curve below x. With no spread, everything sits at the mean. */
export function normalCdf(x: number, mu: number, sd: number): number {
  if (!(sd > 0)) return x >= mu ? 1 : 0;
  return Phi((x - mu) / sd);
}

/**
 * Inverse of the bell-curve CDF (Acklam's rational approximation, relative error about
 * 1e-9). p is clamped to (1e-9, 1 - 1e-9) so the answer is always finite.
 */
export function normalQuantile(p: number, mu = 0, sd = 1): number {
  const q = Number.isNaN(p) ? 0.5 : Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const lo = 0.02425;
  let z: number;
  if (q < lo) {
    const r = Math.sqrt(-2 * Math.log(q));
    z =
      (((((c[0]! * r + c[1]!) * r + c[2]!) * r + c[3]!) * r + c[4]!) * r + c[5]!) /
      ((((d[0]! * r + d[1]!) * r + d[2]!) * r + d[3]!) * r + 1);
  } else if (q > 1 - lo) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    z =
      -(((((c[0]! * r + c[1]!) * r + c[2]!) * r + c[3]!) * r + c[4]!) * r + c[5]!) /
      ((((d[0]! * r + d[1]!) * r + d[2]!) * r + d[3]!) * r + 1);
  } else {
    const r = (q - 0.5) * (q - 0.5);
    z =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) *
        (q - 0.5)) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  return mu + sd * z;
}

/** Share of a bell curve within k standard deviations of its mean. */
export const withinSD = (k: number): number => Phi(k) - Phi(-k);

/** Share of a bell curve more than z standard deviations above its mean. */
export const tailAbove = (z: number): number => 1 - Phi(z);

/** Share of a bell curve between a and b (0 if b is not above a). */
export function shareBetween(a: number, b: number, mu: number, sd: number): number {
  if (!(b > a)) return 0;
  return Math.max(0, normalCdf(b, mu, sd) - normalCdf(a, mu, sd));
}

/** "about 7 in 10", "about 1 in 44": a share in everyday words. */
export function shareReading(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return 'almost none';
  if (p >= 0.995) return 'almost all';
  if (p < 0.5) {
    const n = Math.round(1 / p);
    return n >= 2 ? `about 1 in ${n}` : 'about half';
  }
  const tenths = Math.round(p * 10);
  return tenths >= 10
    ? 'nearly all'
    : tenths === 5
      ? 'about half'
      : `about ${tenths} in 10`;
}

// ---------- z-scores ----------

/** How many standard deviations x sits from the mean. null when there is no spread. */
export function zScore(x: number, mu: number, sd: number): number | null {
  if (!(sd > 0) || !Number.isFinite(x) || !Number.isFinite(mu)) return null;
  return (x - mu) / sd;
}

/** z-score of every value (sample SD). null for fewer than 2 values or no spread. */
export function standardize(values: readonly number[]): number[] | null {
  if (values.length < 2) return null;
  const m = mean(values);
  const s = std(values);
  if (!(s > 0)) return null;
  return values.map((v) => (v - m) / s);
}

// ---------- histograms ----------

export interface Bin {
  x0: number;
  x1: number;
  count: number;
  /** count divided by the number of values that fell in any bin. */
  share: number;
}

export interface Hist {
  bins: Bin[];
  min: number;
  max: number;
  binWidth: number;
  /** Values that landed in a bin. */
  n: number;
}

/** Number of equal bins of `binWidth` needed to cover [min, max] (at least 1). */
export function binCountForWidth(min: number, max: number, binWidth: number): number {
  if (!(binWidth > 0) || !(max > min)) return 1;
  return Math.max(1, Math.ceil((max - min) / binWidth - 1e-9));
}

/**
 * Equal-width histogram. min and max default to the data range; values outside are left
 * out and the largest value goes in the last bin. null for empty data or a bad width.
 */
export function histogram(
  values: readonly number[],
  opts: { binWidth: number; min?: number; max?: number },
): Hist | null {
  const vals = values.filter(Number.isFinite);
  if (vals.length === 0 || !(opts.binWidth > 0)) return null;
  const min = opts.min ?? Math.min(...vals);
  const max = opts.max ?? Math.max(...vals);
  const nBins = binCountForWidth(min, max, opts.binWidth);
  const counts = new Array<number>(nBins).fill(0);
  let n = 0;
  for (const v of vals) {
    if (v < min || v > max) continue;
    counts[Math.min(nBins - 1, Math.floor((v - min) / opts.binWidth))]!++;
    n++;
  }
  const bins = counts.map((count, i) => ({
    x0: min + i * opts.binWidth,
    x1: min + (i + 1) * opts.binWidth,
    count,
    share: n ? count / n : 0,
  }));
  return { bins, min, max, binWidth: opts.binWidth, n };
}

/** Freedman-Diaconis rule of thumb: 2 x IQR x n^(-1/3). null when it cannot be used. */
export function suggestedBinWidth(values: readonly number[]): number | null {
  const vals = values.filter(Number.isFinite);
  if (vals.length < 2) return null;
  const w = 2 * iqr(vals) * Math.pow(vals.length, -1 / 3);
  return w > 0 && Number.isFinite(w) ? w : null;
}

/** Conventions, not laws. */
export const BINS_TOO_FINE = 40;
export const BINS_TOO_COARSE = 6;

export type BinQuality = 'fine' | 'good' | 'coarse';

export function binQuality(binCount: number): BinQuality {
  if (binCount > BINS_TOO_FINE) return 'fine';
  if (binCount < BINS_TOO_COARSE) return 'coarse';
  return 'good';
}

export function binReading(binCount: number): string {
  const q = binQuality(binCount);
  const text =
    q === 'fine'
      ? 'too fine: noisy spikes'
      : q === 'coarse'
        ? 'too coarse: detail lost'
        : 'a readable shape';
  return `${binCount} bins: ${text}`;
}

// ---------- squashing a long tail ----------

export interface Transformed {
  values: number[];
  /** Values left out because they were zero or negative. */
  excluded: number;
}

/**
 * Box-Cox power family: (x^lambda - 1) / lambda, and ln x at lambda = 0. Only positive
 * values can be transformed; the rest are dropped and counted.
 */
export function boxCox(values: readonly number[], lambda: number): Transformed {
  const out: number[] = [];
  let excluded = 0;
  for (const x of values) {
    if (!(x > 0) || !Number.isFinite(x)) {
      excluded++;
      continue;
    }
    const lx = Math.log(x);
    // Taylor-safe near zero: (e^(lambda ln x) - 1) / lambda = ln x + lambda (ln x)^2 / 2 + ...
    out.push(
      lambda === 1
        ? x - 1
        : Math.abs(lambda) < 1e-6
          ? lx
          : Math.expm1(lambda * lx) / lambda,
    );
  }
  return { values: out, excluded };
}

/** Where an original value lands after boxCox (for axis ticks). null if not positive. */
export function boxCoxOne(x: number, lambda: number): number | null {
  const t = boxCox([x], lambda);
  return t.values.length ? t.values[0]! : null;
}

/** Count of values more than k sample SDs from the mean. 0 when there is no spread. */
export function beyondSD(values: readonly number[], k: number): number {
  const vals = values.filter(Number.isFinite);
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const s = std(vals);
  if (!(s > 0)) return 0;
  let c = 0;
  for (const v of vals) if (Math.abs(v - m) > k * s) c++;
  return c;
}
