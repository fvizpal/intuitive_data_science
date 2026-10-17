/**
 * Polynomial fitting for the bias-variance page. Pure TypeScript, no React.
 *
 * The world: temperature through the day. Truth f(h) = 24 + 6 sin(2 pi (h - 9) / 24).
 * Hour is scaled to [-1, 1] for fitting and the curve is a polynomial in a Chebyshev basis,
 * solved by Householder QR (never the normal equations).
 */
import { mulberry32, normal, uniform } from '../../lib/random';

export const DAY = 24;
export const DEFAULT_NOISE = 2;
export const MAX_DEGREE = 12;
export const GRID_POINTS = 400;
/** Stand-in for a prediction that is not a finite number. */
export const BIG = 1e9;

/** What the world really does: warmest about 3pm, coolest about 3am. */
export function trueCurve(h: number): number {
  return 24 + 6 * Math.sin((2 * Math.PI * (h - 9)) / DAY);
}

const clampBig = (v: number): number =>
  Number.isFinite(v) ? Math.max(-BIG, Math.min(BIG, v)) : v > 0 ? BIG : -BIG;

/** Evenly spaced hours covering [0, 24], cell centres. */
export function hourGrid(points = GRID_POINTS): Float64Array {
  const g = new Float64Array(points);
  for (let i = 0; i < points; i++) g[i] = ((i + 0.5) / points) * DAY;
  return g;
}

/** Truth on the default grid, cached. */
let gridCache: { g: Float64Array; f: Float64Array } | null = null;
export function defaultGrid(): { g: Float64Array; f: Float64Array } {
  if (!gridCache) {
    const g = hourGrid();
    gridCache = { g, f: g.map(trueCurve) };
  }
  return gridCache;
}

// ---------- data ----------

export interface Stream {
  seed: number;
  x: Float64Array;
  z: Float64Array;
}

export interface TrainingSet {
  /** Hours, sorted ascending. */
  x: number[];
  y: number[];
  /** Position of each sorted point in the stream (so prefixes can be compared). */
  index: number[];
}

/** A fixed seeded stream of (hour, standard-normal) pairs. */
export function makeStream(seed: number, maxN = 200): Stream {
  const rng = mulberry32(seed);
  const x = new Float64Array(maxN);
  const z = new Float64Array(maxN);
  for (let i = 0; i < maxN; i++) {
    x[i] = uniform(rng, 0, DAY);
    z[i] = normal(rng);
  }
  return { seed, x, z };
}

/** The first n pairs of the stream: y = f(x) + noiseSd * z, sorted by x. */
export function trainingSet(stream: Stream, n: number, noiseSd: number): TrainingSet {
  const k = Math.max(0, Math.min(n, stream.x.length));
  const order = Array.from({ length: k }, (_, i) => i).sort(
    (a, b) => stream.x[a]! - stream.x[b]!,
  );
  return {
    x: order.map((i) => stream.x[i]!),
    y: order.map((i) => trueCurve(stream.x[i]!) + noiseSd * stream.z[i]!),
    index: order,
  };
}

/** `count` independent streams (seed + index) for the averaged widgets. */
export function makeTrainingSets(seed: number, count: number, maxN = 200): Stream[] {
  return Array.from({ length: count }, (_, i) => makeStream(seed + i, maxN));
}

// ---------- least squares ----------

/** Chebyshev T_0..T_degree at t, into out (length degree + 1). */
function chebyshev(
  t: number,
  degree: number,
  out: ArrayLike<number> & { [i: number]: number },
) {
  out[0] = 1;
  if (degree >= 1) out[1] = t;
  for (let k = 2; k <= degree; k++) out[k] = 2 * t * out[k - 1]! - out[k - 2]!;
}

export interface Model {
  /** Degree actually fitted. */
  degree: number;
  /** Degree that was asked for. */
  requested: number;
  /** True when the request was cut down to n - 1. */
  capped: boolean;
  coef: Float64Array;
  predict: (h: number) => number;
}

/** Hour -> [-1, 1]. */
export const scaleHour = (h: number): number => (2 * h) / DAY - 1;

function makePredict(coef: Float64Array): (h: number) => number {
  const deg = coef.length - 1;
  return (h) => {
    // Clenshaw would do; the plain recurrence is fine at degree <= 12.
    const t = scaleHour(h);
    let a = 1;
    let b = t;
    let s = coef[0]! + (deg >= 1 ? coef[1]! * t : 0);
    for (let k = 2; k <= deg; k++) {
      const c = 2 * t * b - a;
      s += coef[k]! * c;
      a = b;
      b = c;
    }
    return clampBig(s);
  };
}

/** The Householder QR of the design matrix for fixed x and degree; solve() for any y. */
export interface Factor {
  degree: number;
  requested: number;
  capped: boolean;
  /** n x p design matrix (row-major): the basis at the training hours. */
  design: Float64Array;
  n: number;
  p: number;
  solve: (y: ArrayLike<number>) => Float64Array;
}

export function factorPoly(xs: ArrayLike<number>, degree: number): Factor {
  const n = xs.length;
  const requested = Math.max(0, Math.floor(degree));
  let d = requested;
  let capped = false;
  if (n === 0) {
    return {
      degree: 0,
      requested,
      capped: requested > 0,
      design: new Float64Array(0),
      n: 0,
      p: 1,
      solve: () => new Float64Array(1),
    };
  }
  if (d >= n) {
    d = n - 1;
    capped = true;
  }
  // A zero x-range: every hour is the same, so only a constant can be fitted.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, xs[i]!);
    hi = Math.max(hi, xs[i]!);
  }
  if (!(hi > lo)) {
    if (d > 0) capped = true;
    d = 0;
  }
  const p = d + 1;
  const A = new Float64Array(n * p);
  const row = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    chebyshev(scaleHour(xs[i]!), d, row);
    for (let j = 0; j < p; j++) A[i * p + j] = row[j]!;
  }
  const design = A.slice();
  // Householder QR in place. Column j holds R above the diagonal and the reflector below.
  const diag = new Float64Array(p);
  const beta = new Float64Array(p);
  let scale = 0;
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += A[i * p + j]! ** 2;
    scale = Math.max(scale, Math.sqrt(s));
  }
  const tiny = 1e-10 * (scale || 1);
  for (let j = 0; j < p; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i * p + j]! ** 2;
    norm = Math.sqrt(norm);
    if (norm <= tiny) {
      diag[j] = 0;
      beta[j] = 0;
      continue;
    }
    const ajj = A[j * p + j]!;
    const alpha = ajj > 0 ? -norm : norm;
    // v = x - alpha e1, stored in column j from row j down.
    A[j * p + j] = ajj - alpha;
    let vtv = 0;
    for (let i = j; i < n; i++) vtv += A[i * p + j]! ** 2;
    beta[j] = vtv > 0 ? 2 / vtv : 0;
    diag[j] = alpha;
    for (let c = j + 1; c < p; c++) {
      let dot = 0;
      for (let i = j; i < n; i++) dot += A[i * p + j]! * A[i * p + c]!;
      const f = beta[j]! * dot;
      for (let i = j; i < n; i++) A[i * p + c] = A[i * p + c]! - f * A[i * p + j]!;
    }
  }
  const solve = (y: ArrayLike<number>): Float64Array => {
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) b[i] = y[i]!;
    for (let j = 0; j < p; j++) {
      if (beta[j] === 0) continue;
      let dot = 0;
      for (let i = j; i < n; i++) dot += A[i * p + j]! * b[i]!;
      const f = beta[j]! * dot;
      for (let i = j; i < n; i++) b[i] = b[i]! - f * A[i * p + j]!;
    }
    const coef = new Float64Array(p);
    for (let j = p - 1; j >= 0; j--) {
      if (diag[j] === 0) {
        coef[j] = 0; // a dependent column (duplicate hours): leave it out
        continue;
      }
      let s = b[j]!;
      for (let c = j + 1; c < p; c++) s -= A[j * p + c]! * coef[c]!;
      coef[j] = s / diag[j]!;
    }
    return coef;
  };
  return { degree: d, requested, capped, design, n, p, solve };
}

/** Least-squares polynomial of the given degree (capped at n - 1). */
export function fitPoly(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  degree: number,
): Model {
  const f = factorPoly(xs, degree);
  let coef = f.solve(ys);
  if (f.degree === 0 && ys.length > 0) {
    // Constant fit: the mean (also what QR gives, but be explicit about degenerate input).
    let s = 0;
    for (let i = 0; i < ys.length; i++) s += ys[i]!;
    coef = new Float64Array([s / ys.length]);
  }
  return {
    degree: f.degree,
    requested: f.requested,
    capped: f.capped,
    coef,
    predict: makePredict(coef),
  };
}

/** Training error: root of the average squared gap to the points the model learned from. */
export function rmse(model: Model, xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const n = xs.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += (ys[i]! - model.predict(xs[i]!)) ** 2;
  return Math.sqrt(s / n);
}

export interface ExpectedError {
  /** sqrt(noise^2 + mean squared gap between truth and fit over the day). */
  error: number;
  /** True when some prediction was not finite or beyond the sentinel. */
  clipped: boolean;
}

export function expectedErrorDetail(
  model: Model,
  noiseSd: number,
  gridPoints = GRID_POINTS,
): ExpectedError {
  const g = gridPoints === GRID_POINTS ? defaultGrid().g : hourGrid(gridPoints);
  let s = 0;
  let clipped = false;
  for (let i = 0; i < g.length; i++) {
    const p = model.predict(g[i]!);
    if (Math.abs(p) >= BIG) clipped = true;
    s += (trueCurve(g[i]!) - p) ** 2;
  }
  return { error: Math.sqrt(noiseSd * noiseSd + s / g.length), clipped };
}

/** Exact expected error on fresh data. Deterministic and always finite. */
export function expectedError(
  model: Model,
  noiseSd: number,
  gridPoints = GRID_POINTS,
): number {
  return expectedErrorDetail(model, noiseSd, gridPoints).error;
}

/** Predictions of a model on the default 400-point grid. */
export function gridPredictions(model: Model): Float64Array {
  return defaultGrid().g.map((h) => model.predict(h));
}

// ---------- bias, variance, noise ----------

export interface Decomposition {
  bias2: number;
  variance: number;
  noise2: number;
  total: number;
  meanFitCurve: Float64Array;
}

/**
 * fits[r] = predictions on the 400-point grid for training set r.
 * bias2 = mean over grid (f - fbar)^2; variance = mean over grid and fits (fit - fbar)^2.
 */
export function decompose(fits: ArrayLike<number>[], noiseSd: number): Decomposition {
  const { f } = defaultGrid();
  const R = fits.length;
  const G = f.length;
  const fbar = new Float64Array(G);
  for (let r = 0; r < R; r++)
    for (let g = 0; g < G; g++) fbar[g] = fbar[g]! + fits[r]![g]! / R;
  let bias2 = 0;
  for (let g = 0; g < G; g++) bias2 += (f[g]! - fbar[g]!) ** 2;
  bias2 /= G;
  let variance = 0;
  for (let r = 0; r < R; r++)
    for (let g = 0; g < G; g++) variance += (fits[r]![g]! - fbar[g]!) ** 2;
  variance /= R * G;
  const noise2 = noiseSd * noiseSd;
  return {
    bias2,
    variance,
    noise2,
    total: bias2 + variance + noise2,
    meanFitCurve: fbar,
  };
}

export interface DegreeErrors {
  degrees: number[];
  /** Average training RMSE (squared errors averaged, then rooted). */
  train: number[];
  /** Average error on new data, same way. */
  test: number[];
  bestDegree: number;
}

export function bestIndex(test: number[]): number {
  let b = 0;
  for (let i = 1; i < test.length; i++) if (test[i]! < test[b]! - 1e-12) b = i;
  return b;
}

export function errorsByDegree(
  trainingSets: TrainingSet[],
  noiseSd: number,
  maxDegree = MAX_DEGREE,
): DegreeErrors {
  const n = trainingSets[0]?.x.length ?? 0;
  const top = Math.max(1, Math.min(maxDegree, n - 1));
  const degrees: number[] = [];
  const train: number[] = [];
  const test: number[] = [];
  for (let d = 1; d <= top; d++) {
    let tr = 0;
    let te = 0;
    for (const s of trainingSets) {
      const m = fitPoly(s.x, s.y, d);
      const t = rmse(m, s.x, s.y);
      const e = expectedError(m, noiseSd);
      tr += t * t;
      te += e * e;
    }
    degrees.push(d);
    train.push(Math.sqrt(tr / trainingSets.length));
    test.push(Math.sqrt(te / trainingSets.length));
  }
  const bi = bestIndex(test);
  return { degrees, train, test, bestDegree: degrees[bi] ?? 1 };
}

// ---------- plain reading of one fit ----------

export type FitLabel = 'underfit' | 'good fit' | 'overfit';

/** Conventions, calibrated by simulation (see fit.test.ts). */
export const UNDERFIT_TRAIN_RATIO = 1.15;
export const UNDERFIT_GAP_RATIO = 1.35;
export const OVERFIT_GAP_RATIO = 2;

export function fitReading({
  train,
  test,
  noise,
}: {
  train: number;
  test: number;
  noise: number;
}): FitLabel {
  if (test > OVERFIT_GAP_RATIO * train) return 'overfit';
  if (train > UNDERFIT_TRAIN_RATIO * noise && test < UNDERFIT_GAP_RATIO * train)
    return 'underfit';
  return 'good fit';
}

/** Training error below the noise floor: the curve is fitting noise. */
export const belowNoiseFloor = (train: number, noise: number): boolean => train < noise;

// ---------- choosing the degree ----------

export interface PickOptions {
  poolSize?: number;
  validationShare?: number;
  noiseSd?: number;
}

export interface Repetition {
  trainPick: number;
  validPick: number;
  /** Expected error on new data of the model each rule chose. */
  trainRuleError: number;
  validRuleError: number;
  train: { x: number[]; y: number[] };
  held: { x: number[]; y: number[] };
  trainModel: Model;
  validModel: Model;
}

/** One repetition: a fresh pool, split by a seeded shuffle, degrees chosen two ways. */
export function repetition(
  seed: number,
  rep: number,
  opts: PickOptions = {},
): Repetition {
  const { poolSize = 40, validationShare = 0.25, noiseSd = DEFAULT_NOISE } = opts;
  const stream = makeStream(seed * 7919 + rep * 104729 + 13, poolSize);
  const pool = trainingSet(stream, poolSize, noiseSd);
  const rng = mulberry32(seed * 31 + rep * 977 + 5);
  const order = Array.from({ length: pool.x.length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const nHeld = Math.max(
    1,
    Math.min(pool.x.length - 3, Math.round(pool.x.length * validationShare)),
  );
  const heldIdx = order.slice(0, nHeld);
  const trainIdx = order.slice(nHeld).sort((a, b) => a - b);
  heldIdx.sort((a, b) => a - b);
  const train = {
    x: trainIdx.map((i) => pool.x[i]!),
    y: trainIdx.map((i) => pool.y[i]!),
  };
  const held = { x: heldIdx.map((i) => pool.x[i]!), y: heldIdx.map((i) => pool.y[i]!) };
  const top = Math.min(MAX_DEGREE, train.x.length - 1);
  let trainPick = 1;
  let validPick = 1;
  let bestT = Infinity;
  let bestV = Infinity;
  let trainModel!: Model;
  let validModel!: Model;
  for (let d = 1; d <= top; d++) {
    const m = fitPoly(train.x, train.y, d);
    const t = rmse(m, train.x, train.y);
    const v = rmse(m, held.x, held.y);
    if (t < bestT - 1e-12) {
      bestT = t;
      trainPick = d;
      trainModel = m;
    }
    if (v < bestV - 1e-12) {
      bestV = v;
      validPick = d;
      validModel = m;
    }
  }
  return {
    trainPick,
    validPick,
    trainRuleError: expectedError(trainModel, noiseSd),
    validRuleError: expectedError(validModel, noiseSd),
    train,
    held,
    trainModel,
    validModel,
  };
}

export const median = (v: number[]): number => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface PickResult {
  reps: Repetition[];
  trainPicks: number[];
  validPicks: number[];
  trainMedian: number;
  validMedian: number;
  /** Count of picks per degree, index 0 = degree 1. */
  trainHistogram: number[];
  validHistogram: number[];
  maxDegree: number;
}

export function pickDegrees(seed: number, reps = 50, opts: PickOptions = {}): PickResult {
  const all: Repetition[] = [];
  for (let r = 0; r < reps; r++) all.push(repetition(seed, r, opts));
  const maxDegree = Math.min(MAX_DEGREE, (all[0]?.train.x.length ?? MAX_DEGREE + 1) - 1);
  const hist = (picks: number[]) => {
    const h = new Array<number>(maxDegree).fill(0);
    for (const p of picks) h[p - 1] = (h[p - 1] ?? 0) + 1;
    return h;
  };
  const trainPicks = all.map((r) => r.trainPick);
  const validPicks = all.map((r) => r.validPick);
  return {
    reps: all,
    trainPicks,
    validPicks,
    trainMedian: median(all.map((r) => r.trainRuleError)),
    validMedian: median(all.map((r) => r.validRuleError)),
    trainHistogram: hist(trainPicks),
    validHistogram: hist(validPicks),
    maxDegree,
  };
}
