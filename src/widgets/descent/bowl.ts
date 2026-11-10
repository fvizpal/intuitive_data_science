/**
 * Pure math for the "Gradient descent" page. No React, no DOM.
 * The bowl is f(x, y) = 0.5 * (x^2 + kappa * y^2): gradient (x, kappa * y), minimum at (0, 0).
 * kappa >= 1 is the "stretch". Nothing here returns NaN or Infinity; bad input gives an
 * explicit `invalid` state and never throws.
 */

export type Pt = readonly [number, number];

export const MAX_STEPS = 100_000;
/** Loss-gap ratios are clamped here so a diverging run stays finite. */
export const GAP_CAP = 1e12;
export const CHART_STEPS = 300;
export const MAX_PATH_POINTS = 400;
/** The fixed start used by the trail widgets. */
export const START: Pt = [8, 2];
/** 99% of the way down: the loss gap has fallen to this share of its start. */
export const DONE_SHARE = 0.01;

export const bowlLoss = (x: number, y: number, kappa: number): number =>
  0.5 * (x * x + kappa * y * y);

export const bowlGrad = (x: number, y: number, kappa: number): Pt => [x, kappa * y];

/** One gradient descent step. */
export function stepBowl(p: Pt, lr: number, kappa: number): Pt {
  const g = bowlGrad(p[0], p[1], kappa);
  return [p[0] - lr * g[0], p[1] - lr * g[1]];
}

/** Largest learning rate that still converges: 2 / kappa. */
export const maxSafeLr = (kappa: number): number => 2 / Math.max(1, kappa);
/** Learning rate where both per-step factors have the same size. */
export const bestLr = (kappa: number): number => 2 / (1 + Math.max(1, kappa));
/** That common size, (kappa - 1) / (kappa + 1). */
export const bestRate = (kappa: number): number => {
  const k = Math.max(1, kappa);
  return (k - 1) / (k + 1);
};

/** Closed-form steps to 99% at the best learning rate. */
export function stepsAtBestLr(kappa: number): number {
  const r = bestRate(kappa);
  if (r <= 0) return 1;
  return Math.max(1, Math.ceil(Math.log(DONE_SHARE) / (2 * Math.log(r))));
}

export type BowlStatus =
  'diverging' | 'stuck' | 'bouncing' | 'crawling' | 'smooth' | 'invalid';

export const STATUS_TEXT: Record<BowlStatus, string> = {
  diverging: 'Diverging',
  stuck: 'Stuck bouncing',
  bouncing: 'Bouncing, but converging',
  crawling: 'Crawling: under 2% progress per step in the gentle direction',
  smooth: 'Converging smoothly',
  invalid: 'Not a valid setting',
};

const okNum = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** Per-step factors a = 1 - lr (gentle direction x) and b = 1 - lr * kappa (steep direction y). */
export function bowlStatus(lr: number, kappa: number): BowlStatus {
  if (!okNum(lr) || !okNum(kappa) || kappa < 1 || lr < 0) return 'invalid';
  const a = 1 - lr;
  const b = 1 - lr * kappa;
  if (Math.abs(a) > 1 + 1e-12 || Math.abs(b) > 1 + 1e-9) return 'diverging';
  if (Math.abs(Math.abs(b) - 1) <= 1e-9 && b < 0) return 'stuck';
  if (b < 0) return 'bouncing';
  if (a >= 0.98 && b >= 0) return 'crawling';
  return 'smooth';
}

export interface BowlRun {
  invalid: boolean;
  /** Step at which the loss gap first falls to 1% of its start; null if it never does within maxSteps. */
  steps: number | null;
  capped: boolean;
  diverged: boolean;
  /** Up to 400 points: every step up to 200, then every k-th, and the final point. */
  path: Pt[];
  /** Step number of each path point. */
  pathSteps: number[];
  /** Loss gap divided by its start, for steps 0..300, clamped to [0, GAP_CAP]. */
  gaps: number[];
}

const EMPTY_RUN: BowlRun = {
  invalid: true,
  steps: null,
  capped: false,
  diverged: false,
  path: [],
  pathSteps: [],
  gaps: [],
};

/** The step numbers to keep for a run of `end` steps, at most MAX_PATH_POINTS of them. */
export function pickIndices(end: number): number[] {
  const out: number[] = [];
  const head = Math.min(end, 200);
  for (let i = 0; i <= head; i++) out.push(i);
  if (end > 200) {
    const k = Math.ceil((end - 200) / (MAX_PATH_POINTS - 202));
    for (let i = 200 + k; i < end; i += k) out.push(i);
    out.push(end);
  }
  return out;
}

/**
 * Gradient descent on the bowl. Uses the exact per-step factors, so a 100000-step count is a
 * tight loop and path points come from the closed form. The path ends at the 99% step, or
 * later when `pathShare` (a smaller loss-gap share) is given, so a ringing trail is visible.
 */
export function runBowl(
  start: Pt,
  lr: number,
  kappa: number,
  opts: { maxSteps?: number; pathShare?: number } = {},
): BowlRun {
  const maxSteps = Math.max(1, Math.floor(opts.maxSteps ?? MAX_STEPS));
  const pathShare = Math.min(opts.pathShare ?? DONE_SHARE, DONE_SHARE);
  if (
    !okNum(lr) ||
    !okNum(kappa) ||
    !okNum(start[0]) ||
    !okNum(start[1]) ||
    lr < 0 ||
    kappa < 1
  )
    return EMPTY_RUN;
  const a = 1 - lr;
  const b = 1 - lr * kappa;
  const x0 = start[0];
  const y0 = start[1];
  const gap0 = bowlLoss(x0, y0, kappa);
  const ratio = (t: number): number => {
    if (gap0 === 0) return 0;
    const g = bowlLoss(a ** t * x0, b ** t * y0, kappa) / gap0;
    return Number.isFinite(g) ? Math.min(g, GAP_CAP) : GAP_CAP;
  };

  // Count the steps to 99% with a running product.
  let steps: number | null = null;
  let diverged = false;
  let end: number;
  if (gap0 === 0) {
    steps = 0;
    end = 0;
  } else if (lr === 0) {
    end = Math.min(maxSteps, CHART_STEPS);
  } else {
    let px = x0;
    let py = y0;
    let t = 0;
    let pathEnd: number | null = null;
    while (t < maxSteps) {
      t++;
      px *= a;
      py *= b;
      const g = bowlLoss(px, py, kappa) / gap0;
      if (steps === null && g <= DONE_SHARE) steps = t;
      if (g <= pathShare) {
        pathEnd = t;
        break;
      }
      if (g > GAP_CAP) {
        diverged = true;
        break;
      }
    }
    end =
      steps === null ? (diverged ? t : Math.min(maxSteps, CHART_STEPS)) : (pathEnd ?? t);
  }

  const idx = pickIndices(end);
  const path = idx.map((t): Pt => [a ** t * x0, b ** t * y0]);
  const gaps: number[] = [];
  for (let t = 0; t <= CHART_STEPS; t++) gaps.push(ratio(t));
  return {
    invalid: false,
    steps,
    capped: steps === null,
    diverged,
    path,
    pathSteps: idx,
    gaps,
  };
}

/** Unit tangent of the contour (the ring) through a point. A point at the bottom gives (1, 0). */
export function tangentAt(x: number, y: number, kappa: number): Pt {
  const g = bowlGrad(x, y, kappa);
  const n = Math.hypot(g[0], g[1]);
  if (n === 0) return [1, 0];
  return [-g[1] / n, g[0] / n];
}

/** Slope of the loss along a direction, by central finite difference (for tests). */
export function gradDirectional(
  x: number,
  y: number,
  kappa: number,
  dir: Pt,
  h = 1e-5,
): number {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const dx = dir[0] / n;
  const dy = dir[1] / n;
  return (
    (bowlLoss(x + h * dx, y + h * dy, kappa) - bowlLoss(x - h * dx, y - h * dy, kappa)) /
    (2 * h)
  );
}
