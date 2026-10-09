import { equalCountEdges, equalWidthEdges } from './woe';

/**
 * Pure helpers for editing bin edges by hand. They only deal with the *interior* edges
 * (the splits between bins); the outer edges are the data range. Automatic monotonic
 * binning is deliberately not here: it can be added next to these functions later.
 */

export const MIN_BINS = 2;
export const MAX_BINS = 8;

export interface EdgeSpace {
  /** Smallest value in the data. */
  lo: number;
  /** Largest value editable on screen (e.g. the 99th percentile for long tails). */
  hiDisp: number;
  /** Smallest gap between neighbouring edges; also the nudge size. */
  step: number;
  decimals: number;
}

const round = (v: number, decimals: number) => Number(v.toFixed(decimals));

export function snapEdge(v: number, space: EdgeSpace): number {
  return round(Math.round(v / space.step) * space.step, space.decimals + 1);
}

/** Snaps, sorts, drops edges outside (lo, hiDisp) and edges closer than one step. */
export function normalizeEdges(edges: readonly number[], space: EdgeSpace): number[] {
  const out: number[] = [];
  for (const e of [...edges].map((v) => snapEdge(v, space)).sort((a, b) => a - b)) {
    if (e <= space.lo + space.step / 2 || e >= space.hiDisp - space.step / 2) continue;
    if (out.length && e - (out[out.length - 1] as number) < space.step * 0.999) continue;
    out.push(e);
  }
  return out;
}

/** Moves edge `j` to `value`, keeping it one step away from both neighbours. */
export function moveEdge(
  inner: readonly number[],
  j: number,
  value: number,
  space: EdgeSpace,
): number[] {
  const prev = j > 0 ? (inner[j - 1] as number) : space.lo;
  const next = j < inner.length - 1 ? (inner[j + 1] as number) : space.hiDisp;
  const lo = prev + space.step;
  const hi = next - space.step;
  if (hi < lo) return [...inner];
  const v = Math.min(hi, Math.max(lo, snapEdge(value, space)));
  return inner.map((e, i) => (i === j ? v : e));
}

export function removeEdge(inner: readonly number[], j: number): number[] {
  if (inner.length + 1 <= MIN_BINS || j < 0 || j >= inner.length) return [...inner];
  return inner.filter((_, i) => i !== j);
}

/** Interior edges for an equal-count split into k bins. */
export function presetEqualCount(
  values: readonly number[],
  k: number,
  space: EdgeSpace,
): number[] {
  return normalizeEdges(equalCountEdges(values, k).slice(1, -1), space);
}

/** Interior edges for an equal-width split of [lo, hiDisp] into k bins. */
export function presetEqualWidth(k: number, space: EdgeSpace): number[] {
  const edges = equalWidthEdges([space.lo, space.hiDisp], k);
  return normalizeEdges(edges.slice(1, -1), space);
}

/**
 * Splits the widest bin at the median of the rows inside it. Returns the new interior
 * edges, or the same edges when no bin can be split any further.
 */
export function addSplit(
  inner: readonly number[],
  values: readonly number[],
  hi: number,
  space: EdgeSpace,
): number[] {
  if (inner.length + 1 >= MAX_BINS) return [...inner];
  const full = [space.lo, ...inner, hi];
  const order = full
    .slice(0, -1)
    .map((a, i) => ({ a, b: full[i + 1] as number, width: (full[i + 1] as number) - a }))
    .sort((x, y) => y.width - x.width);
  const sorted = [...values].sort((x, y) => x - y);
  for (const { a, b } of order) {
    const inBin = sorted.filter((v) => v >= a && v < b);
    if (inBin.length < 2) continue;
    const med = snapEdge(inBin[Math.floor(inBin.length / 2)] as number, space);
    const next = normalizeEdges([...inner, med], space);
    if (next.length > inner.length) return next;
  }
  return [...inner];
}

/** Index of the interior edge whose removal merges the two smallest neighbouring bins. */
export function edgeToMerge(counts: readonly number[]): number {
  let best = 0;
  let bestSum = Infinity;
  for (let j = 0; j < counts.length - 1; j++) {
    const s = (counts[j] as number) + (counts[j + 1] as number);
    if (s < bestSum) [best, bestSum] = [j, s];
  }
  return best;
}
