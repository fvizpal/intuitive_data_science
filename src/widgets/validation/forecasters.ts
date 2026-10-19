/**
 * Two simple forecasters for the monthly bill, to show that the way you hold months back
 * decides which forecaster looks best. Pure TypeScript, no React.
 *
 * - "dots": connect the known months with straight segments (and carry the last value on).
 *   Superb at filling a gap between known months, blind to where the series is heading.
 * - "trend": one straight line through the known months.
 */
import {
  BILL_BIG,
  BILL_MONTHS,
  BILL_NOISE,
  OBSERVED,
  billSplit,
  billTruth,
  fitBill,
  makeBills,
  observed,
  type BillSeries,
  type BillSplit,
  type SplitMethod,
} from './validation';

export type ForecasterKind = 'dots' | 'trend';
export const FORECASTERS: ForecasterKind[] = ['dots', 'trend'];

export interface Forecaster {
  predict: (t: number) => number;
}

const clamp = (v: number): number =>
  Number.isFinite(v)
    ? Math.max(-BILL_BIG, Math.min(BILL_BIG, v))
    : v > 0
      ? BILL_BIG
      : -BILL_BIG;

/** Straight segments through the points (sorted by time); flat beyond either end. */
export function connectTheDots(ts: ArrayLike<number>, ys: ArrayLike<number>): Forecaster {
  const idx = Array.from({ length: ts.length }, (_, i) => i).sort(
    (a, b) => ts[a]! - ts[b]!,
  );
  const t = idx.map((i) => ts[i]!);
  const y = idx.map((i) => ys[i]!);
  return {
    predict: (x) => {
      if (t.length === 0) return 0;
      if (x <= t[0]!) return y[0]!;
      const last = t.length - 1;
      if (x >= t[last]!) return y[last]!;
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid]! <= x) lo = mid;
        else hi = mid;
      }
      const f = (x - t[lo]!) / (t[hi]! - t[lo]!);
      return y[lo]! + f * (y[hi]! - y[lo]!);
    },
  };
}

export function fitForecaster(
  kind: ForecasterKind,
  ts: ArrayLike<number>,
  ys: ArrayLike<number>,
): Forecaster {
  if (kind === 'dots') return connectTheDots(ts, ys);
  const m = fitBill(ts, ys, 1);
  return { predict: (x) => clamp(m.predict(x)) };
}

const pick = (v: ArrayLike<number>, idx: number[]): number[] => idx.map((i) => v[i]!);

export interface ForecasterHoldout {
  forecaster: Forecaster;
  split: BillSplit;
  /** RMSE on the held-back months. */
  validation: number;
}

export function holdoutScore(
  pool: BillSeries,
  method: SplitMethod,
  kind: ForecasterKind,
  seed: number,
): ForecasterHoldout | null {
  if (pool.t.length < 8) return null;
  const split = billSplit(pool.t.length, method, seed);
  const f = fitForecaster(kind, pick(pool.t, split.train), pick(pool.y, split.train));
  let s = 0;
  for (const i of split.val) s += (pool.y[i]! - f.predict(pool.t[i]!)) ** 2;
  return { forecaster: f, split, validation: Math.sqrt(s / split.val.length) };
}

/** Refit on all observed months; exact expected RMSE on months 48..59. Always finite. */
export function nextYearScore(
  pool: BillSeries,
  kind: ForecasterKind,
  noiseSd = BILL_NOISE,
): number {
  if (pool.t.length < 3) return noiseSd;
  const f = fitForecaster(kind, pool.t, pool.y);
  let s = 0;
  for (let t = OBSERVED; t < BILL_MONTHS; t++) s += (billTruth(t) - f.predict(t)) ** 2;
  return Math.sqrt(noiseSd * noiseSd + s / (BILL_MONTHS - OBSERVED));
}

export interface ScoreRow {
  kind: ForecasterKind;
  validation: number;
  real: number;
}

/** Both forecasters' validation score (under `method`) and real next-year score. */
export function scoreTable(
  pool: BillSeries,
  method: SplitMethod,
  seed: number,
): ScoreRow[] {
  return FORECASTERS.map((kind) => ({
    kind,
    validation: holdoutScore(pool, method, kind, seed)?.validation ?? NaN,
    real: nextYearScore(pool, kind),
  }));
}

/** The kind with the lower value; ties go to the first. */
export function winnerOf(rows: ScoreRow[], by: 'validation' | 'real'): ForecasterKind {
  let best = rows[0]!;
  for (const r of rows) if (r[by] < best[by] - 1e-9) best = r;
  return best.kind;
}

export interface ForecasterPicks {
  reps: number;
  /** How many histories each method picked the forecaster that really wins next year. */
  rightRandom: number;
  rightFuture: number;
  /** How often each method picked each forecaster. */
  pickedRandom: Record<ForecasterKind, number>;
  pickedFuture: Record<ForecasterKind, number>;
  /** How often each forecaster really wins next year. */
  winsNextYear: Record<ForecasterKind, number>;
}

/** Many fresh bill histories; which forecaster each way of holding months back would pick. */
export function forecasterPicks(seed: number, reps = 100): ForecasterPicks {
  const out: ForecasterPicks = {
    reps,
    rightRandom: 0,
    rightFuture: 0,
    pickedRandom: { dots: 0, trend: 0 },
    pickedFuture: { dots: 0, trend: 0 },
    winsNextYear: { dots: 0, trend: 0 },
  };
  for (let r = 0; r < reps; r++) {
    const s = seed * 7919 + r * 104729 + 29;
    const pool = observed(makeBills(s));
    const random = scoreTable(pool, 'random', s + 1);
    const future = scoreTable(pool, 'future', s + 1);
    const truth = winnerOf(random, 'real');
    const pr = winnerOf(random, 'validation');
    const pf = winnerOf(future, 'validation');
    out.winsNextYear[truth]++;
    out.pickedRandom[pr]++;
    out.pickedFuture[pf]++;
    if (pr === truth) out.rightRandom++;
    if (pf === truth) out.rightFuture++;
  }
  return out;
}
