import type { BillPicks, CvPicks } from './validation';
import {
  cvByDegree,
  cvPicks,
  kFoldIndices,
  pickByMethod,
  temperaturePool,
} from './validation';

/** The heavy jobs, run off the main thread and cached by their arguments. */
export interface JobTable {
  /** Cross-validation error for degrees 1..12 on the 40-point pool. */
  cvCurve: { args: { seed: number; k: number }; result: number[] };
  /** 100 fresh pools: the degree picked by one split, 5-fold and 10-fold. */
  cvPicks: { args: { seed: number }; result: CvPicks };
  /** 100 fresh bill datasets: the degree picked by a random and a future split. */
  billPicks: { args: { seed: number }; result: BillPicks };
}
export type JobKind = keyof JobTable;

export const POOL = 40;
export const REPS = 100;

/** The computation itself, shared by the worker and the no-worker fallback. */
export function runJobNow<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'],
): JobTable[K]['result'] {
  const a = args as { seed: number; k: number };
  if (kind === 'cvCurve') {
    const pool = temperaturePool(a.seed, POOL);
    const folds = kFoldIndices(POOL, a.k, a.seed + 3);
    return (folds ? cvByDegree(pool.x, pool.y, folds, 12) : []) as JobTable[K]['result'];
  }
  if (kind === 'cvPicks') return cvPicks(a.seed, REPS, POOL) as JobTable[K]['result'];
  return pickByMethod(a.seed, REPS) as JobTable[K]['result'];
}
