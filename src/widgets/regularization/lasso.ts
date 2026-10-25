/**
 * Lasso by cyclic coordinate descent with soft thresholding. Pure TypeScript, no React.
 *
 * Objective: (1 / 2n) RSS + lambda * sum of |coefficients|, on standardized columns by default
 * (training rows only). The intercept is never penalized.
 */
import { buildDesign, gramOf, toFit, type Design, type LinearFit } from './design';
import type { FitOptions } from './ridge';
import type { Mat } from './linalg';

export interface LassoFit extends LinearFit {
  /** Number of coefficients with |standardized coefficient| > 0. */
  nonzero: number;
  converged: boolean;
}

export interface LassoOptions extends FitOptions {
  /** Standardized coefficients (original column order) to start from. */
  warm?: ArrayLike<number> | null;
  tol?: number;
  maxSweeps?: number;
}

export const softThreshold = (z: number, t: number): number =>
  z > t ? z - t : z < -t ? z + t : 0;

/** Coordinate descent on (g, c): minimizes 0.5 b'gb - c'b + lambda |b|_1. Updates `beta` in place. */
export function cdSolve(
  g: Float64Array,
  c: Float64Array,
  k: number,
  lambda: number,
  beta: Float64Array,
  tol = 1e-10,
  maxSweeps = 5000,
): { converged: boolean; sweeps: number } {
  const q = new Float64Array(k); // g * beta
  for (let a = 0; a < k; a++) {
    let s = 0;
    for (let b = 0; b < k; b++) s += g[a * k + b]! * beta[b]!;
    q[a] = s;
  }
  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    let moved = 0;
    for (let j = 0; j < k; j++) {
      const gjj = g[j * k + j]!;
      if (!(gjj > 0)) continue;
      const rho = c[j]! - q[j]! + gjj * beta[j]!;
      const next = softThreshold(rho, lambda) / gjj;
      const delta = next - beta[j]!;
      if (delta !== 0) {
        for (let a = 0; a < k; a++) q[a] = q[a]! + g[a * k + j]! * delta;
        beta[j] = next;
        moved = Math.max(moved, Math.abs(delta) * Math.sqrt(gjj));
      }
    }
    if (moved < tol) return { converged: true, sweeps: sweep };
  }
  return { converged: false, sweeps: maxSweeps };
}

function warmStart(d: Design, warm: ArrayLike<number> | null | undefined): Float64Array {
  const beta = new Float64Array(d.keep.length);
  if (warm) for (let c = 0; c < d.keep.length; c++) beta[c] = warm[d.keep[c]!] ?? 0;
  return beta;
}

function finish(d: Design, p: number, beta: Float64Array, converged: boolean): LassoFit {
  let nonzero = 0;
  for (let c = 0; c < beta.length; c++) if (Math.abs(beta[c]!) > 0) nonzero++;
  return { ...toFit(d, p, beta), nonzero, converged };
}

export function lassoFit(
  x: Mat,
  y: ArrayLike<number>,
  lambda: number,
  opts: LassoOptions = {},
): LassoFit {
  const {
    standardize = true,
    rows = null,
    warm = null,
    tol = 1e-10,
    maxSweeps = 5000,
  } = opts;
  const d = buildDesign(x, y, standardize, rows);
  const { g, c, k } = gramOf(d);
  const beta = warmStart(d, warm);
  const r = cdSolve(g, c, k, Math.max(0, lambda), beta, tol, maxSweeps);
  return finish(d, x.p, beta, r.converged);
}

/** Smallest lambda at which the lasso keeps no feature: max_j |(1/n) Z_j'(y - ybar)|. */
export function lambdaMax(x: Mat, y: ArrayLike<number>, opts: FitOptions = {}): number {
  const { standardize = true, rows = null } = opts;
  const d = buildDesign(x, y, standardize, rows);
  const { c } = gramOf(d);
  let m = 0;
  for (let j = 0; j < c.length; j++) m = Math.max(m, Math.abs(c[j]!));
  return m;
}

/** Lasso at many lambdas, warm-started from the largest down. Results follow the input order. */
export function lassoPath(
  x: Mat,
  y: ArrayLike<number>,
  lambdas: ArrayLike<number>,
  opts: LassoOptions = {},
): LassoFit[] {
  const { standardize = true, rows = null, tol = 1e-10, maxSweeps = 5000 } = opts;
  const d = buildDesign(x, y, standardize, rows);
  const { g, c, k } = gramOf(d);
  const order = Array.from({ length: lambdas.length }, (_, i) => i).sort(
    (a, b) => lambdas[b]! - lambdas[a]!,
  );
  const out = new Array<LassoFit>(lambdas.length);
  const beta = new Float64Array(k);
  for (const i of order) {
    const r = cdSolve(g, c, k, Math.max(0, lambdas[i]!), beta, tol, maxSweeps);
    out[i] = finish(d, x.p, beta.slice(), r.converged);
  }
  return out;
}
