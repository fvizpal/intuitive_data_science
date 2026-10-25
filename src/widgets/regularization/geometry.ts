/**
 * Two coefficients as a plane: the penalized solution, the error contours and the budget region.
 * Pure TypeScript, no React.
 *
 * Minimizes 0.5 (beta - b)' Sigma (beta - b) + penalty, where b is the least-squares point.
 * Ridge penalty: (lambda / 2) ||beta||_2^2. Lasso penalty: lambda ||beta||_1.
 */
import type { Method } from './wide';

export type Sigma2 = readonly [readonly [number, number], readonly [number, number]];
export type Pt = readonly [number, number];

/** Unit-variance features with correlation rho. */
export const sigmaOf = (rho: number): Sigma2 => [
  [1, rho],
  [rho, 1],
];

const soft = (z: number, t: number): number => (z > t ? z - t : z < -t ? z + t : 0);

/** Ridge closed form: (Sigma + lambda I)^-1 Sigma b. */
function ridge2D(s: Sigma2, b: Pt, lambda: number): Pt {
  const [[a, c], [, d]] = s;
  const sb0 = a * b[0] + c * b[1];
  const sb1 = c * b[0] + d * b[1];
  const m00 = a + lambda;
  const m11 = d + lambda;
  const det = m00 * m11 - c * c;
  if (!(Math.abs(det) > 1e-300)) return [0, 0];
  return [(m11 * sb0 - c * sb1) / det, (m00 * sb1 - c * sb0) / det];
}

/** Lasso by coordinate descent to 1e-13. */
function lasso2D(s: Sigma2, b: Pt, lambda: number): Pt {
  const [[a, c], [, d]] = s;
  const sb0 = a * b[0] + c * b[1];
  const sb1 = c * b[0] + d * b[1];
  let x = 0;
  let y = 0;
  for (let sweep = 0; sweep < 200000; sweep++) {
    const nx = a > 0 ? soft(sb0 - c * y, lambda) / a : 0;
    const ny = d > 0 ? soft(sb1 - c * nx, lambda) / d : 0;
    const moved = Math.max(Math.abs(nx - x), Math.abs(ny - y));
    x = nx;
    y = ny;
    if (moved < 1e-14) break;
  }
  return [x, y];
}

export function solve2D(s: Sigma2, b: Pt, lambda: number, method: Method): Pt {
  const lam = Math.max(0, lambda);
  const r = method === 'ridge' ? ridge2D(s, b, lam) : lasso2D(s, b, lam);
  return [Number.isFinite(r[0]) ? r[0] : 0, Number.isFinite(r[1]) ? r[1] : 0];
}

/** Squared error contour value 0.5 (beta - b)' Sigma (beta - b). */
export function errorLevel(s: Sigma2, b: Pt, beta: Pt): number {
  const d0 = beta[0] - b[0];
  const d1 = beta[1] - b[1];
  return 0.5 * (s[0][0] * d0 * d0 + 2 * s[0][1] * d0 * d1 + s[1][1] * d1 * d1);
}

/** Eigen-decomposition of a 2x2 symmetric matrix: values (large first) and unit vectors. */
export function eig2(s: Sigma2): { values: [number, number]; vectors: [Pt, Pt] } {
  const a = s[0][0];
  const c = s[0][1];
  const d = s[1][1];
  const mean = (a + d) / 2;
  const diff = Math.hypot((a - d) / 2, c);
  const l1 = mean + diff;
  const l2 = mean - diff;
  let v1: Pt;
  if (Math.abs(c) > 1e-14) {
    const n = Math.hypot(c, l1 - a);
    v1 = [c / n, (l1 - a) / n];
  } else v1 = a >= d ? [1, 0] : [0, 1];
  return { values: [l1, l2], vectors: [v1, [-v1[1], v1[0]]] };
}

/** The point on the contour 0.5 (beta - b)' Sigma (beta - b) = level at angle t. */
export function ellipsePoint(s: Sigma2, b: Pt, level: number, t: number): Pt {
  const { values, vectors } = eig2(s);
  const r = Math.sqrt(2 * Math.max(0, level));
  const u0 = (r * Math.cos(t)) / Math.sqrt(values[0]);
  const u1 = (r * Math.sin(t)) / Math.sqrt(values[1]);
  return [
    b[0] + u0 * vectors[0][0] + u1 * vectors[1][0],
    b[1] + u0 * vectors[0][1] + u1 * vectors[1][1],
  ];
}

/** The angle t at which the contour through `point` passes it (inverse of ellipsePoint). */
export function ellipseAngle(s: Sigma2, b: Pt, point: Pt): number {
  const { values, vectors } = eig2(s);
  const d0 = point[0] - b[0];
  const d1 = point[1] - b[1];
  const u0 = d0 * vectors[0][0] + d1 * vectors[0][1];
  const u1 = d0 * vectors[1][0] + d1 * vectors[1][1];
  return Math.atan2(u1 * Math.sqrt(values[1]), u0 * Math.sqrt(values[0]));
}

/** Closed polyline (steps + 1 points) of the error contour at `level`. */
export function contourEllipse(s: Sigma2, b: Pt, level: number, steps = 96): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++)
    out.push(ellipsePoint(s, b, level, (2 * Math.PI * i) / steps));
  return out;
}

/** Size of a point in the region's own norm: 2-norm for ridge (circle), 1-norm for lasso (diamond). */
export function regionNorm(method: Method, p: Pt): number {
  return method === 'ridge' ? Math.hypot(p[0], p[1]) : Math.abs(p[0]) + Math.abs(p[1]);
}

/** Closed polyline (steps + 1 points, steps a multiple of 4) of the circle or diamond of the given radius. */
export function regionBoundary(method: Method, radius: number, steps = 120): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const k = method === 'ridge' ? radius : radius / (Math.abs(c) + Math.abs(s));
    out.push([k * c, k * s]);
  }
  return out;
}

/** The region size the solution defines: its own norm, so region and contour touch at the solution. */
export const regionRadius = (method: Method, solution: Pt): number =>
  regionNorm(method, solution);

/**
 * Where would lasso put each weight at exactly zero? For a least-squares point b, returns
 * [feature 1 is zero, feature 2 is zero] in closed form (no iteration), so it is cheap enough
 * to test thousands of handle positions. Handle positions that give a zero form the "zero zone".
 */
export function lassoZeros(s: Sigma2, b: Pt, lambda: number): [boolean, boolean] {
  const lam = Math.max(0, lambda);
  const [[a, c], [, d]] = s;
  const g0 = a * b[0] + c * b[1];
  const g1 = c * b[0] + d * b[1];
  if (Math.abs(g0) <= lam && Math.abs(g1) <= lam) return [true, true];
  // Try "weight 2 is zero": weight 1 is then a soft-thresholded value; check weight 2 stays at zero.
  const w1 = soft(g0, lam) / a;
  if (Math.abs(g1 - c * w1) <= lam) return [false, true];
  const w2 = soft(g1, lam) / d;
  if (Math.abs(g0 - c * w2) <= lam) return [true, false];
  return [false, false];
}
