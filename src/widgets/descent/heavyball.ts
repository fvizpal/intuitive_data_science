/**
 * Gradient descent with momentum (the heavy ball) on the bowl. No React.
 * v_{t+1} = beta * v_t - lr * grad(p_t); p_{t+1} = p_t + v_{t+1}.
 */
import {
  CHART_STEPS,
  DONE_SHARE,
  GAP_CAP,
  MAX_STEPS,
  bowlGrad,
  bowlLoss,
  pickIndices,
  type BowlRun,
  type Pt,
} from './bowl';

const ok = (v: number) => typeof v === 'number' && Number.isFinite(v);

const EMPTY: BowlRun = {
  invalid: true,
  steps: null,
  capped: false,
  diverged: false,
  path: [],
  pathSteps: [],
  gaps: [],
};

/** Bigger learning rates than this diverge: 2 (1 + beta) / kappa. */
export const maxStableLrMomentum = (beta: number, kappa: number): number =>
  (2 * (1 + beta)) / Math.max(1, kappa);

export function optimalMomentum(kappa: number): { lr: number; beta: number } {
  const s = Math.sqrt(Math.max(1, kappa));
  return { lr: 4 / (s + 1) ** 2, beta: ((s - 1) / (s + 1)) ** 2 };
}

/** Per-step shrink of the error along a direction of curvature lambda: largest root modulus. */
export function momentumRate(lr: number, beta: number, lambda: number): number {
  const s = 1 + beta - lr * lambda;
  const disc = s * s - 4 * beta;
  if (disc < 0) return Math.sqrt(beta);
  // A double root: rounding noise this small must not be square-rooted into a bigger one.
  if (disc < 1e-14) return Math.abs(s) / 2;
  const r = Math.sqrt(disc);
  return Math.max(Math.abs((s + r) / 2), Math.abs((s - r) / 2));
}

export const momentumRateBowl = (lr: number, beta: number, kappa: number): number =>
  Math.max(momentumRate(lr, beta, 1), momentumRate(lr, beta, kappa));

export type MomentumStatus = 'smooth' | 'rings' | 'diverging' | 'invalid';

export const MOMENTUM_TEXT: Record<MomentumStatus, string> = {
  smooth: 'Smooth',
  rings: 'Overshoots and rings',
  diverging: 'Diverging',
  invalid: 'Not a valid setting',
};

/** Ringing this slight (relative discriminant) still reads as smooth: the optimal settings sit right on the edge. */
const RING_TOL = 0.005;

export function momentumStatus(lr: number, beta: number, kappa: number): MomentumStatus {
  if (!ok(lr) || !ok(beta) || !ok(kappa) || lr < 0 || beta < 0 || beta >= 1 || kappa < 1)
    return 'invalid';
  if (momentumRateBowl(lr, beta, kappa) > 1 + 1e-9) return 'diverging';
  for (const lam of [1, kappa]) {
    const s = 1 + beta - lr * lam;
    const disc = s * s - 4 * beta;
    if (disc < -RING_TOL * 4 * beta) return 'rings';
  }
  return 'smooth';
}

/** One pass of the heavy ball, calling visit(t, x, y, gapShare) for t = 0..until. */
function walk(
  start: Pt,
  lr: number,
  beta: number,
  kappa: number,
  until: number,
  gap0: number,
  visit: (t: number, x: number, y: number, share: number) => boolean,
) {
  let x = start[0];
  let y = start[1];
  let vx = 0;
  let vy = 0;
  if (visit(0, x, y, 1)) return;
  for (let t = 1; t <= until; t++) {
    vx = beta * vx - lr * x;
    vy = beta * vy - lr * kappa * y;
    x += vx;
    y += vy;
    const share = gap0 > 0 ? bowlLoss(x, y, kappa) / gap0 : 0;
    if (visit(t, x, y, share)) return;
  }
}

export function runHeavyBall(
  start: Pt,
  lr: number,
  beta: number,
  kappa: number,
  opts: { maxSteps?: number; pathShare?: number } = {},
): BowlRun {
  const pathShare = Math.min(opts.pathShare ?? DONE_SHARE, DONE_SHARE);
  const maxSteps = Math.max(1, Math.floor(opts.maxSteps ?? MAX_STEPS));
  if (
    !ok(lr) ||
    !ok(beta) ||
    !ok(kappa) ||
    !ok(start[0]) ||
    !ok(start[1]) ||
    lr < 0 ||
    beta < 0 ||
    beta >= 1 ||
    kappa < 1
  )
    return EMPTY;
  const gap0 = bowlLoss(start[0], start[1], kappa);
  if (gap0 === 0)
    return {
      invalid: false,
      steps: 0,
      capped: false,
      diverged: false,
      path: [start],
      pathSteps: [0],
      gaps: new Array<number>(CHART_STEPS + 1).fill(0),
    };

  // Pass 1: when does it reach 99%, or blow up?
  let steps: number | null = null;
  let diverged = false;
  let last = 0;
  walk(start, lr, beta, kappa, maxSteps, gap0, (t, _x, _y, share) => {
    last = t;
    if (t > 0 && steps === null && share <= DONE_SHARE) steps = t;
    if (t > 0 && share <= pathShare) return true;
    if (share > GAP_CAP || !Number.isFinite(share)) {
      diverged = true;
      return true;
    }
    return false;
  });
  const end: number =
    steps === null ? (diverged ? last : Math.min(maxSteps, CHART_STEPS)) : last;

  // Pass 2: keep only the points we draw, and the first 300 gap ratios.
  const want = pickIndices(end);
  const keep = new Map<number, Pt>();
  const wantSet = new Set(want);
  const gaps: number[] = new Array<number>(CHART_STEPS + 1).fill(GAP_CAP);
  walk(start, lr, beta, kappa, Math.max(end, CHART_STEPS), gap0, (t, x, y, share) => {
    if (wantSet.has(t)) keep.set(t, [x, y]);
    if (t <= CHART_STEPS)
      gaps[t] = Number.isFinite(share) ? Math.min(share, GAP_CAP) : GAP_CAP;
    return !Number.isFinite(share) || share > GAP_CAP;
  });
  const idx = want.filter((t) => keep.has(t));
  return {
    invalid: false,
    steps,
    capped: steps === null,
    diverged,
    path: idx.map((t) => keep.get(t)!),
    pathSteps: idx,
    gaps,
  };
}

/** The same step as above, one at a time, for tests. */
export function heavyBallStep(
  p: Pt,
  v: Pt,
  lr: number,
  beta: number,
  kappa: number,
): { p: Pt; v: Pt } {
  const g = bowlGrad(p[0], p[1], kappa);
  const nv: Pt = [beta * v[0] - lr * g[0], beta * v[1] - lr * g[1]];
  return { p: [p[0] + nv[0], p[1] + nv[1]], v: nv };
}

/**
 * Step sizes when each step is the new push plus a share `beta` of the last step:
 * v_n = beta * v_(n-1) + push_n, with v_0 = 0. beta = 0 gives the pushes back unchanged.
 */
export function accumulateSteps(pushes: readonly number[], beta: number): number[] {
  const b = ok(beta) && beta >= 0 && beta < 1 ? beta : 0;
  const out: number[] = [];
  let v = 0;
  for (const push of pushes) {
    v = b * v + (ok(push) ? push : 0);
    out.push(v);
  }
  return out;
}

/** Where steady pushes of 1 build up to: 1 / (1 - beta). */
export const steadyAlong = (beta: number): number =>
  ok(beta) && beta >= 0 && beta < 1 ? 1 / (1 - beta) : 1;

/** Where pushes that flip every step settle, as a share of a plain swing: 1 / (1 + beta). */
export const steadyAcross = (beta: number): number =>
  ok(beta) && beta >= 0 && beta < 1 ? 1 / (1 + beta) : 1;
