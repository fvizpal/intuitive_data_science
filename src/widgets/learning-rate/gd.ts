/** Pure gradient-descent math for the learning-rate widget. No React, no DOM. */

export const X_MIN = -3;
export const X_MAX = 7;
export const MIN_X = 2;
export const MIN_LOSS = 1;
export const MAX_STEPS = 50;
export const X0_DEFAULT = -2;
export const ETA_MIN = 0.01;
export const ETA_MAX = 1.2;
export const ETA_DEFAULT = 0.1;

/** Slider granularity is finer than a person can hit 0.5 or 1 exactly, so we snap near them. */
const SNAP_TOLERANCE = 0.006;

export const loss = (x: number): number => (x - MIN_X) ** 2 + MIN_LOSS;
export const grad = (x: number): number => 2 * (x - MIN_X);

/** One gradient-descent update: x - eta * L'(x). */
export const gdStep = (x: number, eta: number): number => x - eta * grad(x);

/** Snaps eta to exactly 0.5 or 1 when within slider resolution of them. */
export function snapEta(eta: number): number {
  for (const special of [0.5, 1]) {
    if (Math.abs(eta - special) <= SNAP_TOLERANCE) return special;
  }
  return eta;
}

export type Status = 'smooth' | 'one-step' | 'bounce-converge' | 'stuck' | 'diverging';

export const STATUS_LABELS: Record<Status, string> = {
  smooth: 'Converging smoothly',
  'one-step': 'Lands on the minimum in one step',
  'bounce-converge': 'Bouncing but converging',
  stuck: 'Stuck bouncing forever',
  diverging: 'Diverging',
};

/** Behavior of gradient descent on L(x) = (x - 2)^2 + 1, where the error scales by (1 - 2 eta) each step. */
export function classify(eta: number): Status {
  const e = snapEta(eta);
  if (e < 0.5) return 'smooth';
  if (e === 0.5) return 'one-step';
  if (e < 1) return 'bounce-converge';
  if (e === 1) return 'stuck';
  return 'diverging';
}

export interface Run {
  /** xs[0] is the start; xs[i] is the position after i steps. */
  xs: number[];
  /** True if the last point left the plotted range [X_MIN, X_MAX]. */
  escaped: boolean;
}

/** Runs up to maxSteps steps, stopping early once x leaves the plot. */
export function simulate(x0: number, eta: number, maxSteps: number = MAX_STEPS): Run {
  const e = snapEta(eta);
  const xs = [x0];
  let escaped = false;
  for (let i = 0; i < maxSteps; i++) {
    const x = gdStep(xs[i] as number, e);
    xs.push(x);
    if (x < X_MIN || x > X_MAX) {
      escaped = true;
      break;
    }
  }
  return { xs, escaped };
}
