/**
 * Pure math for the "Threshold, precision and recall" page. No React.
 *
 * World: a spam filter scores every email from 0 to 100 (higher = more spammy). Good mail
 * scores ~ Normal(35, 15), spam ~ Normal(65, 15), clipped to [0, 100] and not rounded.
 * An email is flagged when its score is at or above the cutoff.
 */
import { mulberry32, normal } from '../../lib/random';
import { Phi } from '../../lib/normal';

export interface MailParams {
  meanGood: number;
  meanSpam: number;
  sd: number;
}
export const DEFAULT_PARAMS: MailParams = { meanGood: 35, meanSpam: 65, sd: 15 };

export interface Confusion {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}
export interface CurveRow extends Confusion {
  t: number;
}
export interface Metrics {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  falseAlarmRate: number | null;
  f1: number | null;
  flagged: number;
}
export interface Costs {
  costFN?: number;
  costFP: number;
}
export interface Best {
  threshold: number;
  value: number;
}

const clip = (x: number) => Math.min(100, Math.max(0, x));
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** The thresholds the widgets use: 0 (flag everything) to 101 (flag nothing). */
export const DEFAULT_THRESHOLDS: readonly number[] = Array.from(
  { length: 102 },
  (_, i) => i,
);

// ---------------------------------------------------------------- mail streams

/**
 * The fixed random numbers behind a mail stream: a uniform u_i that decides spam or good,
 * and a standard normal z_i that decides the score. They depend only on (seed, i), so a
 * longer stream keeps the shorter one as its prefix.
 */
export function makeStream(
  seed: number,
  n: number,
): { u: Float64Array; z: Float64Array } {
  const rng = mulberry32(seed);
  const u = new Float64Array(n);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = rng();
    z[i] = normal(rng);
  }
  return { u, z };
}

/** Labels (1 = spam) and scores for the first n emails. Changing the share flips labels only. */
export function mailFromStream(
  stream: { u: Float64Array; z: Float64Array },
  n: number,
  prevalence: number,
  { meanGood, meanSpam, sd }: MailParams = DEFAULT_PARAMS,
): { scores: Float64Array; labels: Uint8Array } {
  const scores = new Float64Array(n);
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const spam = stream.u[i]! < prevalence;
    labels[i] = spam ? 1 : 0;
    scores[i] = clip((spam ? meanSpam : meanGood) + sd * stream.z[i]!);
  }
  return { scores, labels };
}

export function makeMail(
  seed: number,
  n: number,
  prevalence: number,
  params: Partial<MailParams> = {},
): { scores: Float64Array; labels: Uint8Array } {
  return mailFromStream(makeStream(seed, n), n, prevalence, {
    ...DEFAULT_PARAMS,
    ...params,
  });
}

// ---------------------------------------------------------------- counts and metrics

export function confusion(
  scores: ArrayLike<number>,
  labels: ArrayLike<number>,
  t: number,
): Confusion {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (let i = 0; i < scores.length; i++) {
    const flagged = scores[i]! >= t;
    if (labels[i]) {
      if (flagged) tp++;
      else fn++;
    } else if (flagged) fp++;
    else tn++;
  }
  return { tp, fn, fp, tn };
}

export function metrics(c: Confusion): Metrics {
  const n = c.tp + c.fn + c.fp + c.tn;
  const flagged = c.tp + c.fp;
  const precision = ratio(c.tp, flagged);
  const recall = ratio(c.tp, c.tp + c.fn);
  const falseAlarmRate = ratio(c.fp, c.fp + c.tn);
  let f1: number | null = null;
  if (precision !== null && recall !== null) {
    f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  }
  return {
    accuracy: ratio(c.tp + c.tn, n),
    precision,
    recall,
    falseAlarmRate,
    f1,
    flagged,
  };
}

function lowerBound(sorted: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** One confusion row per threshold, in O(n log n + T): sort once, count with prefix sums. */
export function curveByThreshold(
  scores: ArrayLike<number>,
  labels: ArrayLike<number>,
  thresholds: readonly number[] = DEFAULT_THRESHOLDS,
): CurveRow[] {
  const n = scores.length;
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => scores[a]! - scores[b]!,
  );
  const sorted = new Float64Array(n);
  const spamBelow = new Uint32Array(n + 1);
  for (let k = 0; k < n; k++) {
    const i = order[k]!;
    sorted[k] = scores[i]!;
    spamBelow[k + 1] = spamBelow[k]! + (labels[i] ? 1 : 0);
  }
  const spam = spamBelow[n]!;
  const good = n - spam;
  return thresholds.map((t) => {
    const below = lowerBound(sorted, t); // emails scoring under t, not flagged
    const fn = spamBelow[below]!;
    const tn = below - fn;
    return { t, tp: spam - fn, fn, fp: good - tn, tn };
  });
}

// ---------------------------------------------------------------- costs and best cutoffs

/** Cost in "miss units": one unit is one missed spam (costFN defaults to 1). */
export function costOf(c: Confusion, { costFN = 1, costFP }: Costs): number {
  return c.fn * costFN + c.fp * costFP;
}
export function costPer1000(c: Confusion, costs: Costs, n: number): number {
  return n > 0 ? (costOf(c, costs) / n) * 1000 : 0;
}

function pickBest(
  curve: readonly CurveRow[],
  value: (c: CurveRow) => number | null,
  better: (a: number, b: number) => boolean,
): Best | null {
  let best: Best | null = null;
  for (const row of curve) {
    const v = value(row);
    if (v === null) continue;
    // `>=` style comparison: later (higher) thresholds win ties.
    if (best === null || !better(best.value, v)) best = { threshold: row.t, value: v };
  }
  return best;
}
export const bestByF1 = (curve: readonly CurveRow[]): Best | null =>
  pickBest(
    curve,
    (c) => metrics(c).f1,
    (a, b) => a > b,
  );
export const bestByAccuracy = (curve: readonly CurveRow[]): Best | null =>
  pickBest(
    curve,
    (c) => metrics(c).accuracy,
    (a, b) => a > b,
  );
export const bestByCost = (curve: readonly CurveRow[], costs: Costs): Best | null =>
  pickBest(
    curve,
    (c) => costOf(c, costs),
    (a, b) => a < b,
  );

// ---------------------------------------------------------------- theory (unclipped normals)

export interface TheoryMetrics {
  recall: number;
  falseAlarmRate: number;
  precision: number | null;
  accuracy: number;
  f1: number | null;
  /** Expected cost per email, in miss units. */
  cost: number;
}

export function precisionAt(
  prevalence: number,
  recall: number,
  falseAlarmRate: number,
): number | null {
  const caught = prevalence * recall;
  return ratio(caught, caught + (1 - prevalence) * falseAlarmRate);
}

export function theoryMetrics(
  t: number,
  prevalence: number,
  params: Partial<MailParams> = {},
  costs: Costs = { costFP: 1 },
): TheoryMetrics {
  const { meanGood, meanSpam, sd } = { ...DEFAULT_PARAMS, ...params };
  const recall = 1 - Phi((t - meanSpam) / sd);
  const falseAlarmRate = 1 - Phi((t - meanGood) / sd);
  const precision = precisionAt(prevalence, recall, falseAlarmRate);
  const accuracy = prevalence * recall + (1 - prevalence) * (1 - falseAlarmRate);
  const f1 =
    precision === null
      ? null
      : precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
  const cost =
    prevalence * (1 - recall) * (costs.costFN ?? 1) +
    (1 - prevalence) * falseAlarmRate * costs.costFP;
  return { recall, falseAlarmRate, precision, accuracy, f1, cost };
}

export function theoryBest(
  prevalence: number,
  params: Partial<MailParams> = {},
  objective: 'f1' | 'accuracy' | { costFN?: number; costFP: number } = 'f1',
): Best {
  let best: Best | null = null;
  for (let k = 0; k <= 1400; k++) {
    const t = -20 + k * 0.1;
    const m = theoryMetrics(
      t,
      prevalence,
      params,
      typeof objective === 'object' ? objective : undefined,
    );
    const v = objective === 'f1' ? m.f1 : objective === 'accuracy' ? m.accuracy : m.cost;
    if (v === null) continue;
    const minimise = typeof objective === 'object';
    if (best === null || (minimise ? v <= best.value : v >= best.value)) {
      best = { threshold: t, value: v };
    }
  }
  return best ?? { threshold: 0, value: 0 };
}

/** Cheapest cutoff for two equal-width bells; ratio = cost of a false alarm / cost of a miss. */
export function closedFormBest(
  prevalence: number,
  costRatio: number,
  params: Partial<MailParams> = {},
): number {
  const { meanGood, meanSpam, sd } = { ...DEFAULT_PARAMS, ...params };
  return (
    (meanGood + meanSpam) / 2 +
    ((sd * sd) / (meanSpam - meanGood)) *
      Math.log(((1 - prevalence) * costRatio) / prevalence)
  );
}

/** Cutoff for an honest probability: flag if p >= cost of a false alarm / (both costs). */
export const costRuleThreshold = (costFN: number, costFP: number): number =>
  costFP / (costFP + costFN);

// ---------------------------------------------------------------- rare events

export interface Frequencies {
  spam: number;
  good: number;
  caught: number;
  missed: number;
  falseAlarms: number;
  passed: number;
  flagged: number;
  precision: number | null;
  accuracy: number;
  /** Whole-dot counts that sum to exactly n (largest-remainder rounding). */
  dots: { caught: number; missed: number; falseAlarms: number; passed: number };
}

export function naturalFrequencies({
  n = 1000,
  prevalence,
  recall,
  falseAlarmRate,
}: {
  n?: number;
  prevalence: number;
  recall: number;
  falseAlarmRate: number;
}): Frequencies {
  const spam = n * prevalence;
  const good = n - spam;
  const caught = spam * recall;
  const missed = spam - caught;
  const falseAlarms = good * falseAlarmRate;
  const passed = good - falseAlarms;
  const flagged = caught + falseAlarms;

  const parts = [caught, missed, falseAlarms, passed];
  const floors = parts.map(Math.floor);
  let left = n - floors.reduce((a, b) => a + b, 0);
  const order = parts
    .map((p, i) => ({ i, r: p - Math.floor(p) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k]!.i]!++;
  const [dc, dm, dfa, dp] = floors as [number, number, number, number];

  return {
    spam,
    good,
    caught,
    missed,
    falseAlarms,
    passed,
    flagged,
    precision: ratio(caught, flagged),
    accuracy: (caught + passed) / n,
    dots: { caught: dc, missed: dm, falseAlarms: dfa, passed: dp },
  };
}

// ---------------------------------------------------------------- honest probabilities

/** Risk scores that are honest probabilities by construction: label_i ~ Bernoulli(p_i). */
export function calibratedRisk(
  seed: number,
  n: number,
  { mu = -2.6, s = 1.2 }: { mu?: number; s?: number } = {},
): { p: Float64Array; labels: Uint8Array } {
  const rng = mulberry32(seed);
  const p = new Float64Array(n);
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const z = normal(rng);
    p[i] = 1 / (1 + Math.exp(-(mu + s * z)));
    labels[i] = rng() < p[i]! ? 1 : 0;
  }
  return { p, labels };
}
