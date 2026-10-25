/**
 * Small dense linear algebra for the regularization page. Pure TypeScript, no React.
 * Row-major Float64Arrays. Householder QR for least squares; Jacobi for symmetric eigenproblems.
 */

/** An n x p matrix, row-major. */
export interface Mat {
  n: number;
  p: number;
  a: Float64Array;
}

export const matOf = (n: number, p: number, a?: Float64Array): Mat => ({
  n,
  p,
  a: a ?? new Float64Array(n * p),
});

/** Rows `rows` of x as a new matrix (all rows when `rows` is null). */
export function takeRows(x: Mat, rows: ArrayLike<number> | null): Mat {
  if (!rows) return x;
  const out = matOf(rows.length, x.p);
  for (let i = 0; i < rows.length; i++)
    out.a.set(x.a.subarray(rows[i]! * x.p, rows[i]! * x.p + x.p), i * x.p);
  return out;
}

export interface QR {
  m: number;
  p: number;
  /** R above the diagonal, Householder vectors on and below it. */
  a: Float64Array;
  diag: Float64Array;
  beta: Float64Array;
}

/** Householder QR of an m x p matrix (m >= 1). The input is not modified. */
export function qrFactor(a0: Float64Array, m: number, p: number): QR {
  const a = a0.slice();
  const diag = new Float64Array(p);
  const beta = new Float64Array(p);
  let scale = 0;
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += a[i * p + j]! ** 2;
    scale = Math.max(scale, Math.sqrt(s));
  }
  const tiny = 1e-12 * (scale || 1);
  for (let j = 0; j < p; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm += a[i * p + j]! ** 2;
    norm = Math.sqrt(norm);
    if (j >= m || norm <= tiny) {
      diag[j] = 0;
      beta[j] = 0;
      continue;
    }
    const ajj = a[j * p + j]!;
    const alpha = ajj > 0 ? -norm : norm;
    a[j * p + j] = ajj - alpha;
    let vtv = 0;
    for (let i = j; i < m; i++) vtv += a[i * p + j]! ** 2;
    beta[j] = vtv > 0 ? 2 / vtv : 0;
    diag[j] = alpha;
    for (let c = j + 1; c < p; c++) {
      let dot = 0;
      for (let i = j; i < m; i++) dot += a[i * p + j]! * a[i * p + c]!;
      const f = beta[j]! * dot;
      for (let i = j; i < m; i++) a[i * p + c] = a[i * p + c]! - f * a[i * p + j]!;
    }
  }
  return { m, p, a, diag, beta };
}

/** Least-squares solution of the factored system for right-hand side b (length m). */
export function qrSolve(f: QR, b0: ArrayLike<number>): Float64Array {
  const { m, p, a, diag, beta } = f;
  const b = new Float64Array(m);
  for (let i = 0; i < m; i++) b[i] = b0[i]!;
  for (let j = 0; j < p; j++) {
    if (beta[j] === 0) continue;
    let dot = 0;
    for (let i = j; i < m; i++) dot += a[i * p + j]! * b[i]!;
    const g = beta[j]! * dot;
    for (let i = j; i < m; i++) b[i] = b[i]! - g * a[i * p + j]!;
  }
  const x = new Float64Array(p);
  for (let j = p - 1; j >= 0; j--) {
    if (diag[j] === 0) continue; // dependent column: leave it out
    let s = b[j]!;
    for (let c = j + 1; c < p; c++) s -= a[j * p + c]! * x[c]!;
    x[j] = s / diag[j]!;
  }
  return x;
}

/** Squared length of R^-T v, where R is the triangular factor. Dependent columns contribute 0. */
export function rInvTNorm2(f: QR, v: ArrayLike<number>): number {
  const { p, a, diag } = f;
  const z = new Float64Array(p);
  let total = 0;
  for (let j = 0; j < p; j++) {
    if (diag[j] === 0) continue;
    let s = v[j]!;
    for (let k = 0; k < j; k++) s -= a[k * p + j]! * z[k]!;
    z[j] = s / diag[j]!;
    total += z[j]! ** 2;
  }
  return total;
}

/** Eigen-decomposition of a symmetric p x p matrix by cyclic Jacobi. Columns of `vectors` are eigenvectors. */
export function symEig(
  g: Float64Array,
  p: number,
): { values: Float64Array; vectors: Float64Array } {
  const a = g.slice();
  const v = new Float64Array(p * p);
  for (let i = 0; i < p; i++) v[i * p + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i * p + j]! ** 2;
    if (off < 1e-30) break;
    for (let i = 0; i < p - 1; i++) {
      for (let j = i + 1; j < p; j++) {
        const aij = a[i * p + j]!;
        if (Math.abs(aij) < 1e-300) continue;
        const theta = (a[j * p + j]! - a[i * p + i]!) / (2 * aij);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < p; k++) {
          const aik = a[i * p + k]!;
          const ajk = a[j * p + k]!;
          a[i * p + k] = c * aik - s * ajk;
          a[j * p + k] = s * aik + c * ajk;
        }
        for (let k = 0; k < p; k++) {
          const aki = a[k * p + i]!;
          const akj = a[k * p + j]!;
          a[k * p + i] = c * aki - s * akj;
          a[k * p + j] = s * aki + c * akj;
        }
        for (let k = 0; k < p; k++) {
          const vki = v[k * p + i]!;
          const vkj = v[k * p + j]!;
          v[k * p + i] = c * vki - s * vkj;
          v[k * p + j] = s * vki + c * vkj;
        }
      }
    }
  }
  const values = new Float64Array(p);
  for (let i = 0; i < p; i++) values[i] = a[i * p + i]!;
  return { values, vectors: v };
}

export const finiteOr = (v: number, fallback = 0): number =>
  Number.isFinite(v) ? v : fallback;
