/**
 * Gradient descent on one number, the guess of an average, with a few rows per step.
 * Loss per row is 0.5 * (w - y)^2, so the gradient on a batch is w - (batch average of y).
 * Rows are drawn with replacement. No React.
 */
import { mulberry32 } from '../../lib/random';

export const STREAM_STEPS = 600;
export const STREAM_MAX_B = 1000;

export type Batch = number | 'all';

/**
 * Fixed uniform draws, as indices into the population: row t holds the draws for step t.
 * Each row has its own generator, so the first B entries of a row do not depend on how many
 * columns are built: the batch for a smaller B is a prefix of the batch for a larger B
 * (common random numbers), and changing B morphs the same run instead of redrawing it.
 */
export function makeIndexStream(
  seed: number,
  steps: number = STREAM_STEPS,
  maxB: number = STREAM_MAX_B,
  N = 10_000,
): Uint16Array {
  const rows = Math.max(0, Math.floor(steps));
  const cols = Math.max(0, Math.floor(maxB));
  const n = Math.max(1, Math.min(65_536, Math.floor(N)));
  const out = new Uint16Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const rng = mulberry32(
      (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(r + 1, 0x85ebca6b)) >>> 0,
    );
    const o = r * cols;
    for (let j = 0; j < cols; j++) out[o + j] = Math.floor(rng() * n);
  }
  return out;
}

export interface SgdOpts {
  decay?: boolean;
  decayHalf?: number;
  /** Prebuilt stream (steps x maxB). Built here if absent. */
  stream?: Uint16Array;
  /** Columns of `stream`. Defaults to STREAM_MAX_B. */
  streamB?: number;
}

const meanOf = (pop: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < pop.length; i++) s += pop[i]!;
  return pop.length ? s / pop.length : 0;
};

/** The learning rate used at step t. */
export const lrAt = (lr: number, t: number, decay: boolean, half: number): number =>
  decay ? lr / (1 + t / Math.max(1e-9, half)) : lr;

/** Path of the guess: path[0] is the start, path[t] the guess after t steps. */
export function runSgdMean(
  pop: ArrayLike<number>,
  w0: number,
  lr: number,
  B: Batch,
  steps: number,
  seed: number,
  opts: SgdOpts = {},
): Float64Array {
  const T = Math.max(0, Math.floor(Number.isFinite(steps) ? steps : 0));
  const path = new Float64Array(T + 1);
  path[0] = Number.isFinite(w0) ? w0 : 0;
  if (pop.length === 0 || !Number.isFinite(lr) || lr < 0) {
    path.fill(path[0]);
    return path;
  }
  const decay = opts.decay ?? false;
  const half = opts.decayHalf ?? 50;
  const ybar = meanOf(pop);
  if (B === 'all') {
    let w = path[0];
    for (let t = 0; t < T; t++) {
      w -= lrAt(lr, t, decay, half) * (w - ybar);
      path[t + 1] = w;
    }
    return path;
  }
  const b = Math.max(1, Math.min(STREAM_MAX_B * 10, Math.floor(B)));
  const cols = opts.stream ? (opts.streamB ?? STREAM_MAX_B) : b;
  const stream = opts.stream ?? makeIndexStream(seed, T, b, pop.length);
  const use = Math.min(b, cols);
  const rowsAvailable = Math.floor(stream.length / Math.max(1, cols));
  let w = path[0];
  for (let t = 0; t < T; t++) {
    let s = 0;
    const o = (t % Math.max(1, rowsAvailable)) * cols;
    for (let j = 0; j < use; j++) s += pop[stream[o + j]!]!;
    w -= lrAt(lr, t, decay, half) * (w - s / use);
    path[t + 1] = w;
  }
  return path;
}

export function popVariance(pop: ArrayLike<number>): number {
  const n = pop.length;
  if (n === 0) return 0;
  const m = meanOf(pop);
  let s = 0;
  for (let i = 0; i < n; i++) s += (pop[i]! - m) ** 2;
  return s / n;
}

/** Stationary SD of the guess for a constant learning rate; 0 for a full batch; 0 for a rate that is not in (0, 2). */
export function sgdTheory(pop: ArrayLike<number>, lr: number, B: Batch): number {
  if (B === 'all' || !(B >= 1) || !(lr > 0) || !(lr < 2) || pop.length === 0) return 0;
  return Math.sqrt((lr * popVariance(pop)) / (B * (2 - lr)));
}

/** Without any noise: the guess after t steps is ybar + (1 - lr)^t (w0 - ybar). */
export function meanPath(w0: number, ybar: number, lr: number, t: number): number {
  const v = ybar + (1 - lr) ** t * (w0 - ybar);
  return Number.isFinite(v) ? v : ybar;
}

/** SD of the last `last` entries of a path (population SD). 0 for an empty path. */
export function wobble(path: ArrayLike<number>, last = 200): number {
  const n = path.length;
  const m = Math.min(Math.max(1, Math.floor(last)), n);
  if (n === 0) return 0;
  let s = 0;
  for (let i = n - m; i < n; i++) s += path[i]!;
  const mu = s / m;
  let v = 0;
  for (let i = n - m; i < n; i++) v += (path[i]! - mu) ** 2;
  return Math.sqrt(v / m);
}
