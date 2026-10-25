/**
 * Centering and standardizing from training rows only, shared by ridge and lasso.
 * Population SD (divide by n). A zero-variance column is dropped and reported.
 */
import type { Mat } from './linalg';

export interface Design {
  /** Rows used (training rows). */
  rows: number[];
  /** Centered (and, when standardizing, unit-spread) kept columns, row-major rows x keep.length. */
  z: Float64Array;
  /** Centered y over the training rows. */
  yc: Float64Array;
  ybar: number;
  n: number;
  /** Original index of each kept column. */
  keep: number[];
  /** Original indices of dropped (constant) columns. */
  dropped: number[];
  mean: Float64Array;
  /** Scale used per original column (1 when not standardizing). */
  scale: Float64Array;
}

const allRows = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export function buildDesign(
  x: Mat,
  y: ArrayLike<number>,
  standardize: boolean,
  rowsIn?: ArrayLike<number> | null,
): Design {
  const rows = rowsIn ? Array.from(rowsIn) : allRows(x.n);
  const n = rows.length;
  const p = x.p;
  const mean = new Float64Array(p);
  const scale = new Float64Array(p).fill(1);
  const keep: number[] = [];
  const dropped: number[] = [];
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x.a[rows[i]! * p + j]!;
    const m = n > 0 ? s / n : 0;
    mean[j] = m;
    let v = 0;
    for (let i = 0; i < n; i++) v += (x.a[rows[i]! * p + j]! - m) ** 2;
    const sd = n > 0 ? Math.sqrt(v / n) : 0;
    if (!(sd > 1e-12 * (1 + Math.abs(m)))) {
      dropped.push(j);
      continue;
    }
    keep.push(j);
    if (standardize) scale[j] = sd;
  }
  const k = keep.length;
  const z = new Float64Array(n * k);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < k; c++) {
      const j = keep[c]!;
      z[i * k + c] = (x.a[rows[i]! * p + j]! - mean[j]!) / scale[j]!;
    }
  let ybar = 0;
  for (let i = 0; i < n; i++) ybar += y[rows[i]!]!;
  ybar = n > 0 ? ybar / n : 0;
  const yc = new Float64Array(n);
  for (let i = 0; i < n; i++) yc[i] = y[rows[i]!]! - ybar;
  return { rows, z, yc, ybar, n, keep, dropped, mean, scale };
}

/** Gram matrix Z'Z / n and c = Z'yc / n of a design. */
export function gramOf(d: Design): { g: Float64Array; c: Float64Array; k: number } {
  const k = d.keep.length;
  const g = new Float64Array(k * k);
  const c = new Float64Array(k);
  const n = d.n || 1;
  for (let i = 0; i < d.n; i++) {
    const row = i * k;
    for (let a = 0; a < k; a++) {
      const za = d.z[row + a]!;
      c[a] = c[a]! + za * d.yc[i]!;
      for (let b = a; b < k; b++) g[a * k + b] = g[a * k + b]! + za * d.z[row + b]!;
    }
  }
  for (let a = 0; a < k; a++) {
    c[a] = c[a]! / n;
    for (let b = a; b < k; b++) {
      const v = g[a * k + b]! / n;
      g[a * k + b] = v;
      g[b * k + a] = v;
    }
  }
  return { g, c, k };
}

export interface LinearFit {
  intercept: number;
  /** Coefficients in original units, one per original column (0 for dropped). */
  coefs: Float64Array;
  /** Coefficients on the scale that was penalized (standardized when standardizing). */
  standardizedCoefs: Float64Array;
  dropped: number[];
}

/** Turns coefficients on the kept, scaled columns into a fit in original units. */
export function toFit(d: Design, p: number, betaKept: ArrayLike<number>): LinearFit {
  const coefs = new Float64Array(p);
  const std = new Float64Array(p);
  let intercept = d.ybar;
  for (let c = 0; c < d.keep.length; c++) {
    const j = d.keep[c]!;
    const b = betaKept[c]!;
    std[j] = b;
    coefs[j] = b / d.scale[j]!;
    intercept -= coefs[j]! * d.mean[j]!;
  }
  return { intercept, coefs, standardizedCoefs: std, dropped: d.dropped };
}

/** Prediction of a fit for row i of x. */
export function predictRow(
  f: { intercept: number; coefs: ArrayLike<number> },
  x: Mat,
  i: number,
): number {
  let s = f.intercept;
  for (let j = 0; j < x.p; j++) s += f.coefs[j]! * x.a[i * x.p + j]!;
  return s;
}
