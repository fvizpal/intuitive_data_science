/** Pure WoE / IV math. "Good" = repaid (flag 0), "bad" = defaulted (flag 1). */

export interface BinStat {
  /** Position in the bin order; the Missing bin (if any) comes last. */
  index: number;
  isMissing: boolean;
  count: number;
  good: number;
  bad: number;
  /** Raw bad / count (never smoothed). */
  defaultRate: number;
  /** Share of all people that fall in this bin. */
  pctOfPopulation: number;
  /** Share of ALL goods that fall in this bin. */
  pctGood: number;
  /** Share of ALL bads that fall in this bin. */
  pctBad: number;
  /** ln(pctGood / pctBad): positive = safer than the portfolio, negative = riskier. */
  woe: number;
  /** (pctGood − pctBad) × woe, always ≥ 0. */
  ivContribution: number;
}

const isMissingValue = (v: number | null | undefined): boolean =>
  v === null || v === undefined || Number.isNaN(v);

/**
 * Bin index for every row. Bins are [e0,e1), [e1,e2), …, with the last bin closed on the
 * right; values outside the outer edges fall into the first or last bin. With
 * `missingAsOwnBin`, NaN/null rows go to a separate bin numbered edges.length − 1
 * (otherwise they get −1 and are ignored by `computeBins`).
 */
export function binFeature(
  values: readonly (number | null | undefined)[],
  edges: readonly number[],
  { missingAsOwnBin = true }: { missingAsOwnBin?: boolean } = {},
): number[] {
  const k = Math.max(1, edges.length - 1);
  return values.map((v) => {
    if (isMissingValue(v)) return missingAsOwnBin ? k : -1;
    const x = v as number;
    let b = 0;
    while (b < k - 1 && x >= (edges[b + 1] as number)) b++;
    return b;
  });
}

const finite = (values: readonly (number | null | undefined)[]): number[] =>
  values.filter((v): v is number => !isMissingValue(v));

export function equalWidthEdges(
  values: readonly (number | null | undefined)[],
  k: number,
): number[] {
  const v = finite(values);
  if (v.length === 0) return [0, 1];
  let lo = v[0] as number;
  let hi = lo;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (hi === lo) hi = lo + 1;
  return Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
}

/** Quantile edges (about n/k rows per bin). Tied edges are merged, so you may get fewer than k bins. */
export function equalCountEdges(
  values: readonly (number | null | undefined)[],
  k: number,
): number[] {
  const v = finite(values).sort((a, b) => a - b);
  if (v.length === 0) return [0, 1];
  const lo = v[0] as number;
  let hi = v[v.length - 1] as number;
  if (hi === lo) hi = lo + 1;
  const edges = [lo];
  for (let i = 1; i < k; i++) {
    const e = v[Math.floor((i * v.length) / k)] as number;
    if (e > (edges[edges.length - 1] as number) && e < hi) edges.push(e);
  }
  edges.push(hi);
  return edges;
}

/**
 * Per-bin statistics. A bin with zero goods or zero bads gets `smoothing` added to the
 * empty side so WoE stays finite; empty bins report zeros. `nBins` fixes the number of
 * bins (default: highest index + 1) and `missingIndex` marks the Missing bin.
 */
export function computeBins(
  binIdx: readonly number[],
  defaultFlags: readonly number[],
  {
    smoothing = 0.5,
    nBins,
    missingIndex,
  }: { smoothing?: number; nBins?: number; missingIndex?: number } = {},
): BinStat[] {
  let n = nBins ?? 0;
  for (const b of binIdx) if (b + 1 > n) n = b + 1;
  const good = new Array<number>(n).fill(0);
  const bad = new Array<number>(n).fill(0);
  let total = 0;
  for (let i = 0; i < binIdx.length; i++) {
    const b = binIdx[i] as number;
    if (b < 0) continue;
    total++;
    if (defaultFlags[i]) bad[b]!++;
    else good[b]!++;
  }
  // Floor keeps ln() finite even when smoothing = 0.
  const FLOOR = 1e-9;
  const adj = (c: number, count: number) =>
    count === 0 ? 0 : c === 0 ? Math.max(smoothing, FLOOR) : c;
  let sumG = 0;
  let sumB = 0;
  const gAdj: number[] = [];
  const bAdj: number[] = [];
  for (let i = 0; i < n; i++) {
    const count = good[i]! + bad[i]!;
    gAdj.push(adj(good[i]!, count));
    bAdj.push(adj(bad[i]!, count));
    sumG += gAdj[i]!;
    sumB += bAdj[i]!;
  }
  return Array.from({ length: n }, (_, i) => {
    const count = good[i]! + bad[i]!;
    const pctGood = sumG > 0 ? gAdj[i]! / sumG : 0;
    const pctBad = sumB > 0 ? bAdj[i]! / sumB : 0;
    const woe = count === 0 ? 0 : Math.log(pctGood / pctBad);
    return {
      index: i,
      isMissing: i === missingIndex,
      count,
      good: good[i]!,
      bad: bad[i]!,
      defaultRate: count === 0 ? 0 : bad[i]! / count,
      pctOfPopulation: total === 0 ? 0 : count / total,
      pctGood,
      pctBad,
      woe,
      ivContribution: count === 0 ? 0 : (pctGood - pctBad) * woe,
    };
  });
}

export const totalIV = (bins: readonly BinStat[]): number =>
  bins.reduce((s, b) => s + b.ivContribution, 0);

/** Conventional IV cutoffs. They are a convention, not a law. */
export const IV_THRESHOLDS = {
  notUseful: 0.02,
  weak: 0.1,
  medium: 0.3,
  strong: 0.5,
} as const;

export type IvStrength = 'not useful' | 'weak' | 'medium' | 'strong' | 'suspicious';

export function ivStrength(iv: number): IvStrength {
  if (iv < IV_THRESHOLDS.notUseful) return 'not useful';
  if (iv < IV_THRESHOLDS.weak) return 'weak';
  if (iv < IV_THRESHOLDS.medium) return 'medium';
  if (iv <= IV_THRESHOLDS.strong) return 'strong';
  return 'suspicious';
}

/**
 * True when the sequence is non-decreasing or non-increasing. `null`/NaN entries stand for
 * the Missing bin: skipped when `ignoreMissing`, otherwise they make the answer false.
 */
export function isMonotonic(
  woeSequence: readonly (number | null | undefined)[],
  ignoreMissing = true,
): boolean {
  if (!ignoreMissing && woeSequence.some(isMissingValue)) return false;
  const seq = finite(woeSequence);
  let up = true;
  let down = true;
  for (let i = 1; i < seq.length; i++) {
    const d = (seq[i] as number) - (seq[i - 1] as number);
    if (d < -1e-12) up = false;
    if (d > 1e-12) down = false;
  }
  return up || down;
}

/** WoE per numeric bin, with `null` where the bin is the Missing bin (or empty). */
export const woeSequence = (bins: readonly BinStat[]): (number | null)[] =>
  bins.map((b) => (b.isMissing || b.count === 0 ? null : b.woe));

export const MIN_POPULATION_SHARE = 0.05;
export const MIN_BADS = 30;

export interface BinWarning {
  index: number;
  tooSmall: boolean;
  fewBads: boolean;
}

/** Bins under 5% of the population or with fewer than 30 defaulters. Empty bins are ignored. */
export function binWarnings(bins: readonly BinStat[]): BinWarning[] {
  const out: BinWarning[] = [];
  for (const b of bins) {
    if (b.count === 0) continue;
    const tooSmall = b.pctOfPopulation < MIN_POPULATION_SHARE;
    const fewBads = b.bad < MIN_BADS;
    if (tooSmall || fewBads) out.push({ index: b.index, tooSmall, fewBads });
  }
  return out;
}

/** IV with equal-count bins for k = 2..kMax (missing values get their own bin). */
export function ivVsBins(
  values: readonly (number | null | undefined)[],
  flags: readonly number[],
  kMax: number,
  smoothing = 0.5,
): { k: number; iv: number }[] {
  const out: { k: number; iv: number }[] = [];
  for (let k = 2; k <= kMax; k++) {
    const edges = equalCountEdges(values, k);
    const bins = computeBins(binFeature(values, edges), flags, {
      smoothing,
      nBins: edges.length,
      missingIndex: edges.length - 1,
    });
    out.push({ k, iv: totalIV(bins) });
  }
  return out;
}
