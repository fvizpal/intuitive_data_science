import { leashCurves, type LeashCurves } from './leash';
import { makeWide, widePaths, type WidePaths } from './wide';

/** The heavy jobs, run off the main thread and cached by their arguments. */
export interface JobTable {
  /** Panel B of the leash widget: errors over 60 training sets at every penalty. */
  leash: { args: { seed: number; n: number }; result: LeashCurves };
  /** Ridge and lasso paths on the 20-feature dataset, with exact errors on new data. */
  paths: { args: { seed: number; n: number }; result: WidePaths };
}
export type JobKind = keyof JobTable;

/** The computation itself, shared by the worker and the no-worker fallback. */
export function runJobNow<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'],
): JobTable[K]['result'] {
  switch (kind) {
    case 'leash': {
      const a = args as JobTable['leash']['args'];
      return leashCurves(a.seed, a.n) as JobTable[K]['result'];
    }
    case 'paths': {
      const a = args as JobTable['paths']['args'];
      return widePaths(makeWide(a.seed, a.n)) as JobTable[K]['result'];
    }
    default:
      throw new Error(`Unknown job: ${String(kind)}`);
  }
}
