/**
 * Ridge regression. Pure TypeScript, no React.
 *
 * Objective: (1 / 2n) RSS + (lambda / 2) sum of squared coefficients. The intercept is never penalized.
 * Solved by Householder QR on the augmented system [X; sqrt(n lambda) I] (never the normal equations).
 */
import { chebyshev, makePredict, scaleHour, type Model } from '../biasvar/fit';
import { buildDesign, gramOf, toFit, type LinearFit } from './design';
import { qrFactor, qrSolve, rInvTNorm2, symEig, type Mat } from './linalg';

/** What lambda = 0 falls back to when there are not enough rows to determine the fit. */
export const TINY_RIDGE = 1e-10;

export interface CenteredRidge {
  beta: Float64Array;
  /** Trace of the hat matrix for the penalized columns (the intercept adds 1 more). */
  dfPenalized: number;
  undetermined: boolean;
  lambdaUsed: number;
}

/** Ridge on centered columns z (n x k) and centered y. */
export function ridgeCentered(
  z: Float64Array,
  yc: Float64Array,
  n: number,
  k: number,
  lambda: number,
): CenteredRidge {
  if (k === 0 || n === 0)
    return {
      beta: new Float64Array(k),
      dfPenalized: 0,
      undetermined: false,
      lambdaUsed: lambda,
    };
  let lam = Math.max(0, lambda);
  const undetermined = lam === 0 && n <= k;
  if (undetermined) lam = TINY_RIDGE;
  const extra = lam > 0 ? k : 0;
  const m = n + extra;
  const a = new Float64Array(m * k);
  a.set(z.subarray(0, n * k));
  const b = new Float64Array(m);
  b.set(yc.subarray(0, n));
  if (extra) {
    const r = Math.sqrt(n * lam);
    for (let j = 0; j < k; j++) a[(n + j) * k + j] = r;
  }
  const f = qrFactor(a, m, k);
  const beta = qrSolve(f, b);
  let df = 0;
  for (let i = 0; i < n; i++) df += rInvTNorm2(f, z.subarray(i * k, i * k + k));
  return { beta, dfPenalized: df, undetermined, lambdaUsed: lam };
}

export interface RidgeFit extends LinearFit {
  /** 1 (intercept) + trace of the penalized hat matrix. */
  effectiveDf: number;
  undetermined: boolean;
}

export interface FitOptions {
  standardize?: boolean;
  /** Training rows (default: all). Scaling uses these rows only. */
  rows?: ArrayLike<number> | null;
}

export function ridgeFit(
  x: Mat,
  y: ArrayLike<number>,
  lambda: number,
  opts: FitOptions = {},
): RidgeFit {
  const { standardize = true, rows = null } = opts;
  const d = buildDesign(x, y, standardize, rows);
  const r = ridgeCentered(d.z, d.yc, d.n, d.keep.length, lambda);
  return {
    ...toFit(d, x.p, r.beta),
    effectiveDf: 1 + r.dfPenalized,
    undetermined: r.undetermined,
  };
}

/** Effective degrees of freedom of ridge at lambda for design x (intercept included, columns used as given). */
export function effectiveDf(x: Mat, lambda: number): number {
  const d = buildDesign(x, new Float64Array(x.n), false);
  const r = ridgeCentered(d.z, d.yc, d.n, d.keep.length, lambda);
  return 1 + r.dfPenalized;
}

/**
 * Ridge for many lambdas from one eigen-decomposition of the Gram matrix (O(p^2) per lambda).
 * Same answers as ridgeFit up to rounding.
 */
export function ridgePath(
  x: Mat,
  y: ArrayLike<number>,
  lambdas: ArrayLike<number>,
  opts: FitOptions = {},
): RidgeFit[] {
  const { standardize = true, rows = null } = opts;
  const d = buildDesign(x, y, standardize, rows);
  const { g, c, k } = gramOf(d);
  const out: RidgeFit[] = [];
  if (k === 0) {
    for (let i = 0; i < lambdas.length; i++)
      out.push({ ...toFit(d, x.p, []), effectiveDf: 1, undetermined: false });
    return out;
  }
  const { values, vectors } = symEig(g, k);
  // w = V'c
  const w = new Float64Array(k);
  for (let a = 0; a < k; a++) {
    let s = 0;
    for (let i = 0; i < k; i++) s += vectors[i * k + a]! * c[i]!;
    w[a] = s;
  }
  const top = values.reduce((m, v) => Math.max(m, v), 0);
  const floor = 1e-12 * (top || 1);
  for (let li = 0; li < lambdas.length; li++) {
    let lam = Math.max(0, lambdas[li]!);
    const undetermined = lam === 0 && d.n <= k;
    if (undetermined) lam = TINY_RIDGE;
    const beta = new Float64Array(k);
    let df = 0;
    for (let a = 0; a < k; a++) {
      const ev = values[a]!;
      const denom = ev + lam;
      if (ev <= floor && lam === 0) continue;
      df += ev / denom;
      const f = w[a]! / denom;
      for (let i = 0; i < k; i++) beta[i] = beta[i]! + f * vectors[i * k + a]!;
    }
    out.push({ ...toFit(d, x.p, beta), effectiveDf: 1 + df, undetermined });
  }
  return out;
}

// ---------- the temperature curve ----------

export interface RidgePolyFit {
  model: Model;
  /** [intercept, c1, ..., c_degree] in the Chebyshev basis. */
  coefs: Float64Array;
  effectiveDf: number;
  /** Length of the non-intercept coefficient vector. */
  coefNorm: number;
  undetermined: boolean;
}

/**
 * A degree-`degree` curve in the Chebyshev basis, fitted by ridge. Hours are scaled to [-1, 1];
 * the columns are not standardized (they are already on a similar scale).
 */
export function fitRidgePoly(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  degree: number,
  lambda: number,
): RidgePolyFit {
  const n = xs.length;
  const deg = Math.max(0, Math.floor(degree));
  const row = new Float64Array(deg + 1);
  const z = new Float64Array(n * deg);
  const mean = new Float64Array(deg);
  for (let i = 0; i < n; i++) {
    chebyshev(scaleHour(xs[i]!), deg, row);
    for (let j = 0; j < deg; j++) {
      z[i * deg + j] = row[j + 1]!;
      mean[j] = mean[j]! + row[j + 1]! / n;
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < deg; j++) z[i * deg + j] = z[i * deg + j]! - mean[j]!;
  let ybar = 0;
  for (let i = 0; i < n; i++) ybar += ys[i]!;
  ybar = n > 0 ? ybar / n : 0;
  const yc = new Float64Array(n);
  for (let i = 0; i < n; i++) yc[i] = ys[i]! - ybar;
  // lambda = 0 needs more rows than parameters; otherwise fall back to a tiny ridge.
  const r = ridgeCentered(z, yc, n, deg, lambda);
  const coefs = new Float64Array(deg + 1);
  let intercept = ybar;
  let norm2 = 0;
  for (let j = 0; j < deg; j++) {
    coefs[j + 1] = r.beta[j]!;
    intercept -= r.beta[j]! * mean[j]!;
    norm2 += r.beta[j]! ** 2;
  }
  coefs[0] = intercept;
  const undetermined = r.undetermined;
  return {
    model: {
      degree: deg,
      requested: deg,
      capped: false,
      coef: coefs,
      predict: makePredict(coefs),
    },
    coefs,
    effectiveDf: 1 + r.dfPenalized,
    coefNorm: Math.sqrt(norm2),
    undetermined,
  };
}
