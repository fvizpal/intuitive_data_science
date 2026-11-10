/**
 * Gradient descent on a two-weight least-squares loss, and feature standardizing.
 * The loss is 0.5 * mean((y - X w)^2) with centred columns, so its gradient is H (w - w*)
 * with H = X'X / n. No React.
 */
import {
  CHART_STEPS,
  DONE_SHARE,
  GAP_CAP,
  MAX_STEPS,
  pickIndices,
  type Pt,
} from './bowl';

export type Mat2 = readonly [readonly [number, number], readonly [number, number]];

const ok = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** H = X'X / n for rows of [x1, x2]. Empty input gives zeros. */
export function Hessian2(rows: ArrayLike<Pt>): Mat2 {
  const n = rows.length;
  if (n === 0)
    return [
      [0, 0],
      [0, 0],
    ];
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    a += r[0] * r[0];
    b += r[0] * r[1];
    c += r[1] * r[1];
  }
  return [
    [a / n, b / n],
    [b / n, c / n],
  ];
}

export interface Eig2 {
  /** lambda[0] >= lambda[1]. */
  values: [number, number];
  /** Unit eigenvectors, vectors[i] pairs with values[i]. */
  vectors: [Pt, Pt];
}

/** Eigenvalues and unit eigenvectors of a symmetric 2 x 2 matrix, in closed form. */
export function eig2(H: Mat2): Eig2 {
  const a = H[0][0];
  const b = H[0][1];
  const c = H[1][1];
  const mid = (a + c) / 2;
  const rad = Math.hypot((a - c) / 2, b);
  const l1 = mid + rad;
  const l2 = mid - rad;
  let v1: Pt;
  if (rad === 0) v1 = [1, 0];
  else if (Math.abs(b) > 1e-300) {
    const n = Math.hypot(b, l1 - a);
    v1 = [b / n, (l1 - a) / n];
  } else v1 = a >= c ? [1, 0] : [0, 1];
  return { values: [l1, l2], vectors: [v1, [-v1[1], v1[0]]] };
}

/** Least-squares weights from the normal equations H w = X'y / n (two columns). */
export function olsFromNormalEquations(X: ArrayLike<Pt>, y: ArrayLike<number>): Pt {
  const n = Math.min(X.length, y.length);
  if (n === 0) return [0, 0];
  const H = Hessian2(Array.prototype.slice.call(X, 0, n) as Pt[]);
  let g1 = 0;
  let g2 = 0;
  for (let i = 0; i < n; i++) {
    g1 += X[i]![0] * y[i]!;
    g2 += X[i]![1] * y[i]!;
  }
  g1 /= n;
  g2 /= n;
  const det = H[0][0] * H[1][1] - H[0][1] * H[0][1];
  if (!(Math.abs(det) > 0)) return [0, 0];
  return [(H[1][1] * g1 - H[0][1] * g2) / det, (H[0][0] * g2 - H[0][1] * g1) / det];
}

export const maxSafeLrQuad = (H: Mat2): number => {
  const l = eig2(H).values[0];
  return l > 0 ? 2 / l : 0;
};
export const bestLrQuad = (H: Mat2): number => {
  const { values } = eig2(H);
  const s = values[0] + values[1];
  return s > 0 ? 2 / s : 0;
};
/** Stretch: how many times steeper the steepest direction is than the gentlest. */
export const stretchOf = (H: Mat2): number => {
  const { values } = eig2(H);
  return values[1] > 0 ? values[0] / values[1] : 1;
};

/** One literal gradient step, w - lr * H (w - wStar). Used to check the closed form. */
export function stepQuadratic(H: Mat2, w: Pt, wStar: Pt, lr: number): Pt {
  const d0 = w[0] - wStar[0];
  const d1 = w[1] - wStar[1];
  return [
    w[0] - lr * (H[0][0] * d0 + H[0][1] * d1),
    w[1] - lr * (H[0][1] * d0 + H[1][1] * d1),
  ];
}

export interface QuadRun {
  invalid: boolean;
  steps: number | null;
  capped: boolean;
  diverged: boolean;
  path: Pt[];
  pathSteps: number[];
  /** Loss gap divided by its start, steps 0..300. */
  gaps: number[];
  /** Loss gap divided by its start after `maxSteps` steps (or when the run stopped). */
  fractionLeft: number;
  /** Weights at each requested checkpoint step. */
  at: (t: number) => Pt;
  /** Loss gap share remaining at step t. */
  gapAt: (t: number) => number;
}

const INVALID: QuadRun = {
  invalid: true,
  steps: null,
  capped: false,
  diverged: false,
  path: [],
  pathSteps: [],
  gaps: [],
  fractionLeft: 1,
  at: () => [0, 0],
  gapAt: () => 1,
};

/**
 * Gradient descent on the quadratic loss, run exactly in the eigenbasis of H: along each
 * eigen-direction the error is multiplied by (1 - lr * lambda) every step. Same 99% rule as
 * the bowl, on the loss gap 0.5 (w - w*)' H (w - w*).
 */
export function runQuadratic(
  H: Mat2,
  w0: Pt,
  wStar: Pt,
  lr: number,
  opts: { maxSteps?: number } = {},
): QuadRun {
  const maxSteps = Math.max(1, Math.floor(opts.maxSteps ?? MAX_STEPS));
  if (!ok(lr) || lr < 0 || ![...w0, ...wStar, H[0][0], H[0][1], H[1][1]].every(ok))
    return INVALID;
  const e = eig2(H);
  const [l1, l2] = e.values;
  if (!(l2 > 0)) return INVALID;
  const [v1, v2] = e.vectors;
  const d0: Pt = [w0[0] - wStar[0], w0[1] - wStar[1]];
  const c1 = d0[0] * v1[0] + d0[1] * v1[1];
  const c2 = d0[0] * v2[0] + d0[1] * v2[1];
  const f1 = 1 - lr * l1;
  const f2 = 1 - lr * l2;
  const gap = (u1: number, u2: number) => 0.5 * (l1 * u1 * u1 + l2 * u2 * u2);
  const gap0 = gap(c1, c2);
  const share = (t: number): number => {
    if (gap0 === 0) return 0;
    const g = gap(f1 ** t * c1, f2 ** t * c2) / gap0;
    return Number.isFinite(g) ? Math.min(g, GAP_CAP) : GAP_CAP;
  };
  const at = (t: number): Pt => {
    const u1 = f1 ** t * c1;
    const u2 = f2 ** t * c2;
    return [wStar[0] + u1 * v1[0] + u2 * v2[0], wStar[1] + u1 * v1[1] + u2 * v2[1]];
  };

  let steps: number | null = null;
  let diverged = false;
  let end: number;
  if (gap0 === 0) {
    steps = 0;
    end = 0;
  } else if (lr === 0) {
    end = Math.min(maxSteps, CHART_STEPS);
  } else {
    let u1 = c1;
    let u2 = c2;
    let t = 0;
    while (t < maxSteps) {
      t++;
      u1 *= f1;
      u2 *= f2;
      const g = gap(u1, u2) / gap0;
      if (g <= DONE_SHARE) {
        steps = t;
        break;
      }
      if (g > GAP_CAP) {
        diverged = true;
        break;
      }
    }
    end = steps ?? (diverged ? t : Math.min(maxSteps, CHART_STEPS));
  }
  const idx = pickIndices(end);
  const gaps: number[] = [];
  for (let t = 0; t <= CHART_STEPS; t++) gaps.push(share(t));
  return {
    invalid: false,
    steps,
    capped: steps === null,
    diverged,
    path: idx.map(at),
    pathSteps: idx,
    gaps,
    fractionLeft: diverged ? GAP_CAP : share(maxSteps),
    at,
    gapAt: share,
  };
}

export interface Standardized {
  /** Columns minus their averages, divided by their (population) SD. */
  Z: Pt[];
  means: Pt;
  sds: Pt;
}

/** Standardize two columns: subtract the average, divide by the SD (divide by n). */
export function standardize(X: ArrayLike<Pt>): Standardized {
  const n = X.length;
  if (n === 0) return { Z: [], means: [0, 0], sds: [1, 1] };
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    m1 += X[i]![0];
    m2 += X[i]![1];
  }
  m1 /= n;
  m2 /= n;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s1 += (X[i]![0] - m1) ** 2;
    s2 += (X[i]![1] - m2) ** 2;
  }
  const sd1 = Math.sqrt(s1 / n) || 1;
  const sd2 = Math.sqrt(s2 / n) || 1;
  const Z: Pt[] = [];
  for (let i = 0; i < n; i++) Z.push([(X[i]![0] - m1) / sd1, (X[i]![1] - m2) / sd2]);
  return { Z, means: [m1, m2], sds: [sd1, sd2] };
}

/**
 * Weights found on standardized features, converted back to raw units:
 * w_raw = w_std / sd, and the intercept absorbs the averages.
 */
export function convertBack(
  wStd: Pt,
  means: Pt,
  sds: Pt,
  yMean = 0,
): { weights: Pt; intercept: number } {
  const w: Pt = [wStd[0] / sds[0], wStd[1] / sds[1]];
  return { weights: w, intercept: yMean - w[0] * means[0] - w[1] * means[1] };
}
