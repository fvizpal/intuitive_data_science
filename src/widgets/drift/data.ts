/**
 * Memoized data for the made-up-score widgets (1 to 4): the build-time sample, today's
 * sample, and the slice edges. Nothing here is recomputed unless its inputs changed.
 */
import { normalQuantile } from '../../lib/normal';
import { histogram } from '../separation/metrics';
import {
  BASE_MEAN,
  BASE_SD,
  driftedScores,
  equalWidthEdges,
  psi,
  binShares,
  psiNormalExact,
  quantileEdges,
} from './psi';
import type { PsiResult } from './psi';
import type { Scenario } from './store';

export const N = 5000;
/** Today's applicants come from a different random stream than the build-time ones. */
const TODAY_SEED_OFFSET = 7919;

export const HIST_LO = 300;
export const HIST_HI = 900;
export const HIST_BINS = 24;
export const HIST_TICKS = [300, 400, 500, 600, 700, 800, 900];

function lru<K, V>(limit: number) {
  const map = new Map<K, V>();
  return (key: K, make: () => V): V => {
    let v = map.get(key);
    if (v === undefined) {
      if (map.size >= limit) map.delete(map.keys().next().value as K);
      v = make();
      map.set(key, v);
    }
    return v;
  };
}

const baselineCache = lru<number, number[]>(4);
export const getBaseline = (seed: number): number[] =>
  baselineCache(seed, () => driftedScores(seed, N));

const todayCache = lru<string, number[]>(12);
export const getToday = (seed: number, s: Scenario): number[] =>
  todayCache(`${seed}|${s.shift}|${s.spreadMult}|${s.newSegmentShare}`, () =>
    driftedScores(seed + TODAY_SEED_OFFSET, N, s),
  );

export type EdgeMethod = 'count' | 'width';
const edgeCache = lru<string, number[]>(24);
export const getEdges = (seed: number, method: EdgeMethod, k: number): number[] =>
  edgeCache(`${seed}|${method}|${k}`, () =>
    method === 'count'
      ? quantileEdges(getBaseline(seed), k)
      : equalWidthEdges(getBaseline(seed), k),
  );

const histCache = lru<string, number[]>(24);
/** Counts in 25-point bars, for drawing. Outside scores pile into the end bars. */
export const baselineBars = (seed: number): number[] =>
  histCache(`b${seed}`, () => histogram(getBaseline(seed), HIST_LO, HIST_HI, HIST_BINS));
export const todayBars = (seed: number, s: Scenario): number[] =>
  histCache(`t${seed}|${s.shift}|${s.spreadMult}|${s.newSegmentShare}`, () =>
    histogram(getToday(seed, s), HIST_LO, HIST_HI, HIST_BINS),
  );

export const mean = (v: ArrayLike<number>): number => {
  if (!v.length) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  return s / v.length;
};

export interface Sliced {
  edges: number[];
  expected: number[];
  actual: number[];
  result: PsiResult | null;
}

/** PSI for the page scenario under one slicing. */
export function slicedPsi(
  seed: number,
  s: Scenario,
  method: EdgeMethod,
  k: number,
): Sliced {
  const edges = getEdges(seed, method, k);
  const e = binShares(getBaseline(seed), edges);
  const a = binShares(getToday(seed, s), edges);
  return {
    edges,
    expected: e.shares,
    actual: a.shares,
    result: e.n && a.n ? psi(e.shares, a.shares) : null,
  };
}

// ---------- the idealized curve: only the average moves ----------

export const IDEAL_BASE = { mean: BASE_MEAN, sd: BASE_SD };
/** Decile edges of the idealized build-time bell curve (computed once). */
let idealEdges: number[] | null = null;
export function getIdealEdges(): number[] {
  if (!idealEdges) {
    // The cut points quantileEdges would find on an infinitely large sample.
    idealEdges = Array.from(
      { length: 9 },
      (_, i) => BASE_MEAN + BASE_SD * normalQuantile((i + 1) / 10),
    );
  }
  return idealEdges;
}

export const SHIFT_MIN = -80;
export const SHIFT_MAX = 80;
let curve: { shift: number; psi: number }[] | null = null;
export function getIdealCurve(): { shift: number; psi: number }[] {
  if (!curve) {
    const edges = getIdealEdges();
    curve = [];
    for (let s = SHIFT_MIN; s <= SHIFT_MAX; s++) {
      curve.push({
        shift: s,
        psi: psiNormalExact(edges, IDEAL_BASE, { mean: BASE_MEAN + s, sd: BASE_SD }) ?? 0,
      });
    }
  }
  return curve;
}
