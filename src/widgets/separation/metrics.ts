/**
 * Pure math for "how well does a score separate goods from bads".
 * Convention: flags are 1 = good (repaid), 0 = bad (defaulted); higher score = safer.
 * A cutoff REJECTS scores below it. Anything that cannot be computed (an empty group)
 * returns null, never NaN or Infinity.
 */
import { Phi } from '../../lib/normal';
import { mulberry32, normal } from '../../lib/random';

export interface Groups {
  goods: number[];
  bads: number[];
}

export function splitGroups(scores: readonly number[], flags: readonly number[]): Groups {
  const goods: number[] = [];
  const bads: number[] = [];
  for (let i = 0; i < scores.length; i++) (flags[i] ? goods : bads).push(scores[i]!);
  return { goods, bads };
}

const ascending = (values: readonly number[]): Float64Array => {
  const a = Float64Array.from(values);
  a.sort();
  return a;
};

// ---------- AUC / Gini ----------

/** P(good scores higher than bad) + 0.5 * P(tie), via average ranks (Mann-Whitney U). */
export function auc(goods: readonly number[], bads: readonly number[]): number | null {
  const ng = goods.length;
  const nb = bads.length;
  if (ng === 0 || nb === 0) return null;
  const n = ng + nb;
  const values = new Float64Array(n);
  for (let i = 0; i < ng; i++) values[i] = goods[i]!;
  for (let i = 0; i < nb; i++) values[ng + i] = bads[i]!;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => values[a]! - values[b]!);

  let goodRankSum = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]!] === values[order[i]!]) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) if (order[k]! < ng) goodRankSum += avgRank;
    i = j + 1;
  }
  const u = goodRankSum - (ng * (ng + 1)) / 2;
  return u / (ng * nb);
}

export const gini = (a: number | null): number | null => (a === null ? null : 2 * a - 1);

// ---------- cumulative curves and KS ----------

export interface Ecdf {
  /** Fraction of the sample with value <= x. */
  le: (x: number) => number;
  /** Fraction of the sample with value < x. */
  lt: (x: number) => number;
}

/** Number of sorted entries strictly below x (or at most x when `inclusive`). */
function countBelow(sorted: ArrayLike<number>, x: number, inclusive: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (inclusive ? sorted[mid]! <= x : sorted[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function ecdf(values: readonly number[]): Ecdf {
  const sorted = ascending(values);
  const n = sorted.length;
  return {
    le: (x) => (n ? countBelow(sorted, x, true) / n : 0),
    lt: (x) => (n ? countBelow(sorted, x, false) / n : 0),
  };
}

export interface Curves {
  xs: number[];
  /** Fraction of goods with a score below each x. */
  goods: number[];
  /** Fraction of bads with a score below each x. */
  bads: number[];
}

/** Cumulative curves on an even grid from lo to hi (default: the data range). */
export function cumulativeCurves(
  goods: readonly number[],
  bads: readonly number[],
  gridPoints: number,
  lo?: number,
  hi?: number,
): Curves | null {
  if (goods.length === 0 || bads.length === 0) return null;
  const all = [...goods, ...bads];
  const a = lo ?? Math.min(...all);
  const b = hi ?? Math.max(...all);
  const k = Math.max(2, Math.floor(gridPoints));
  const fg = ecdf(goods);
  const fb = ecdf(bads);
  const xs: number[] = [];
  const g: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < k; i++) {
    const x = a + ((b - a) * i) / (k - 1);
    xs.push(x);
    g.push(fg.lt(x));
    d.push(fb.lt(x));
  }
  return { xs, goods: g, bads: d };
}

export interface RocPoint {
  x: number;
  y: number;
  /** The cutoff that produces this point: rejects scores below it. */
  cutoff: number;
}

/**
 * Walk the distinct scores in ascending order. After passing score s (cutoff = s + 1 for
 * integer scores) we have rejected F_good(s) of goods and F_bad(s) of bads.
 * Calls `visit(score, fGood, fBad)` for each distinct score.
 */
function walk(
  sg: Float64Array,
  sb: Float64Array,
  visit: (score: number, fGood: number, fBad: number) => void,
) {
  const ng = sg.length;
  const nb = sb.length;
  let gi = 0;
  let bi = 0;
  while (gi < ng || bi < nb) {
    const v = Math.min(gi < ng ? sg[gi]! : Infinity, bi < nb ? sb[bi]! : Infinity);
    while (gi < ng && sg[gi]! === v) gi++;
    while (bi < nb && sb[bi]! === v) bi++;
    visit(v, gi / ng, bi / nb);
  }
}

export interface KsResult {
  ks: number;
  /** First observed score at which the gap reaches its maximum. */
  atScore: number;
}

export function ks(goods: readonly number[], bads: readonly number[]): KsResult | null {
  if (goods.length === 0 || bads.length === 0) return null;
  let best = -1;
  let at = 0;
  walk(ascending(goods), ascending(bads), (s, fg, fb) => {
    const gap = Math.abs(fb - fg);
    if (gap > best + 1e-12) {
      best = gap;
      at = s;
    }
  });
  return { ks: best, atScore: at };
}

/**
 * ROC for a cutoff that rejects scores below it: x = share of goods rejected, y = share of
 * bads rejected. One point per distinct score, from (0, 0) to (1, 1).
 */
export function rocPoints(
  goods: readonly number[],
  bads: readonly number[],
): RocPoint[] | null {
  if (goods.length === 0 || bads.length === 0) return null;
  const pts: RocPoint[] = [];
  let first = true;
  walk(ascending(goods), ascending(bads), (s, fg, fb) => {
    if (first) {
      pts.push({ x: 0, y: 0, cutoff: s });
      first = false;
    }
    pts.push({ x: fg, y: fb, cutoff: s + 1 });
  });
  return pts;
}

export function rocArea(points: readonly RocPoint[]): number {
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    area += ((points[i]!.x - points[i - 1]!.x) * (points[i]!.y + points[i - 1]!.y)) / 2;
  }
  return area;
}

export interface CutoffRates {
  goodsRejected: number;
  badsRejected: number;
  /** badsRejected - goodsRejected (can be negative for a reversed score). */
  gap: number;
}

export function cutoffRates(
  goods: readonly number[],
  bads: readonly number[],
  cutoff: number,
): CutoffRates | null {
  if (goods.length === 0 || bads.length === 0) return null;
  const rate = (v: readonly number[]) => {
    let n = 0;
    for (const s of v) if (s < cutoff) n++;
    return n / v.length;
  };
  const goodsRejected = rate(goods);
  const badsRejected = rate(bads);
  return { goodsRejected, badsRejected, gap: badsRejected - goodsRejected };
}

// ---------- random pairs ----------

export interface Pair {
  good: number;
  bad: number;
  /** 1 if the good scored higher, 0.5 for a tie, 0 if the bad did. */
  goodWins: 0 | 0.5 | 1;
}

export function pickPairs(
  goods: readonly number[],
  bads: readonly number[],
  count: number,
  seed: number,
): Pair[] {
  if (goods.length === 0 || bads.length === 0) return [];
  const rng = mulberry32(seed);
  const out: Pair[] = [];
  for (let i = 0; i < count; i++) {
    const good = goods[Math.floor(rng() * goods.length)]!;
    const bad = bads[Math.floor(rng() * bads.length)]!;
    out.push({ good, bad, goodWins: good > bad ? 1 : good === bad ? 0.5 : 0 });
  }
  return out;
}

/** Mean of goodWins over the first 1, 2, 3, ... pairs. */
export function runningMean(pairs: readonly Pair[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < pairs.length; i++) {
    sum += pairs[i]!.goodWins;
    out.push(sum / (i + 1));
  }
  return out;
}

// ---------- histograms ----------

/** Counts per bin over [lo, hi); values outside are clipped into the edge bins. */
export function histogram(
  values: readonly number[],
  lo: number,
  hi: number,
  bins: number,
): number[] {
  const out = new Array<number>(bins).fill(0);
  const width = (hi - lo) / bins;
  for (const v of values) {
    out[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)))]!++;
  }
  return out;
}

// ---------- synthetic crowds ----------

export const DEFAULT_MEAN = 640;
export const DEFAULT_SD = 60;

/**
 * Goods ~ Normal(mean, sd), bads ~ Normal(mean - separation * sd, sd). The same standard
 * normal draws are reused for every separation, so dragging the knob slides the bads
 * smoothly instead of reshuffling them.
 */
export function normalGroups(
  seed: number,
  nGood: number,
  nBad: number,
  separation: number,
  { mean = DEFAULT_MEAN, sd = DEFAULT_SD }: { mean?: number; sd?: number } = {},
): Groups {
  const rng = mulberry32(seed);
  const goods: number[] = [];
  const bads: number[] = [];
  for (let i = 0; i < nGood; i++) goods.push(Math.round(mean + normal(rng) * sd));
  for (let i = 0; i < nBad; i++)
    bads.push(Math.round(mean - separation * sd + normal(rng) * sd));
  return { goods, bads };
}

// ---------- theory for two equal-width bell curves ----------

export { Phi };

export const theory = {
  aucNormal: (d: number): number => Phi(d / Math.SQRT2),
  ksNormal: (d: number): number => 2 * Phi(d / 2) - 1,
};

// ---------- reading an AUC ----------

/** Conventions, not laws. */
export const AUC_BANDS = {
  weak: 0.55,
  acceptable: 0.7,
  strong: 0.8,
  suspicious: 0.9,
} as const;

export function bandLabel(a: number): string {
  if (!Number.isFinite(a)) return 'not available';
  if (a < AUC_BANDS.weak) return 'coin flip';
  if (a < AUC_BANDS.acceptable) return 'weak';
  if (a < AUC_BANDS.strong) return 'acceptable';
  if (a <= AUC_BANDS.suspicious) return 'strong';
  return 'suspiciously high: check for leakage';
}

// ---------- a small ranked line-up ----------

export interface Customer {
  score: number;
  good: boolean;
}

function quantiles(sorted: Float64Array, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      sorted[
        Math.min(sorted.length - 1, Math.floor(((i + 0.5) / count) * sorted.length))
      ]!,
    );
  }
  return out;
}

/**
 * A few customers who stand in for everyone: evenly spaced quantiles of each group, then
 * lined up riskiest (lowest score) first. Ties put bads first.
 */
export function rankedSample(
  goods: readonly number[],
  bads: readonly number[],
  nGood: number,
  nBad: number,
): Customer[] {
  if (goods.length === 0 || bads.length === 0) return [];
  const all: Customer[] = [
    ...quantiles(ascending(goods), nGood).map((score) => ({ score, good: true })),
    ...quantiles(ascending(bads), nBad).map((score) => ({ score, good: false })),
  ];
  return all.sort((a, b) => a.score - b.score || Number(a.good) - Number(b.good));
}

export interface WalkStep {
  /** Customers passed so far. */
  k: number;
  bads: number;
  goods: number;
  /** Share of all bads passed minus share of all goods passed. */
  gap: number;
}

/** Walk down the line: after each customer, how many bads and goods are behind us. */
export function walkLine(line: readonly Customer[]): WalkStep[] {
  const nBad = line.filter((c) => !c.good).length;
  const nGood = line.length - nBad;
  const steps: WalkStep[] = [{ k: 0, bads: 0, goods: 0, gap: 0 }];
  let b = 0;
  let g = 0;
  line.forEach((c, i) => {
    if (c.good) g++;
    else b++;
    steps.push({
      k: i + 1,
      bads: b,
      goods: g,
      gap: (nBad ? b / nBad : 0) - (nGood ? g / nGood : 0),
    });
  });
  return steps;
}
