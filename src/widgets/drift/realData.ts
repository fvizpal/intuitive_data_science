/**
 * Data behind "Drift is not damage": the REAL scorecard (seed-42 fit, default scaling)
 * scoring a pool of 20,000 fresh applicants, plus the 5,000 build-time scores it was fitted
 * on. Built in chunks so it can run in a Web Worker, or on the main thread one chunk per
 * idle callback when workers are unavailable. Reuses the pool helpers of the KS/AUC page.
 */
import { scoreAll } from '../scorecard/scorecard';
import { auc, gini, splitGroups } from '../separation/metrics';
import {
  CHUNK_SIZE,
  POOL_CHUNKS,
  POOL_SIZE,
  makePlan,
  scoreChunk,
} from '../separation/pool';
import type { PoolPlan } from '../separation/pool';

export interface RealData {
  /** Integer scores of the fresh applicants. */
  poolScores: Int32Array;
  /** 1 = good (repaid), 0 = bad (defaulted). */
  poolFlags: Uint8Array;
  /** The 5,000 scores the scorecard was built on (build time). */
  baseScores: Int32Array;
  baseFlags: Uint8Array;
  /** Gini on the data the scorecard was fitted on, and on the fresh pool. */
  giniFit: number;
  giniPool: number;
}

export function giniOf(
  scores: ArrayLike<number>,
  flags: ArrayLike<number>,
): number | null {
  const { goods, bads } = splitGroups(Array.from(scores), Array.from(flags));
  return gini(auc(goods, bads));
}

export function createRealBuilder() {
  const poolScores = new Int32Array(POOL_SIZE);
  const poolFlags = new Uint8Array(POOL_SIZE);
  let plan: PoolPlan | null = null;
  let done = 0;
  return {
    step(): boolean {
      if (!plan) {
        plan = makePlan();
        return false;
      }
      const c = scoreChunk(plan, done);
      poolScores.set(c.scores, done * CHUNK_SIZE);
      poolFlags.set(c.flags, done * CHUNK_SIZE);
      done++;
      return done === POOL_CHUNKS;
    },
    result(): RealData {
      if (!plan) throw new Error('not built yet');
      const baseScores = Int32Array.from(
        scoreAll(plan.fit.loans.columns, plan.table, plan.fit.bins),
      );
      const baseFlags = Uint8Array.from(plan.fit.y);
      return {
        poolScores,
        poolFlags,
        baseScores,
        baseFlags,
        giniFit: giniOf(baseScores, baseFlags) ?? 0,
        giniPool: giniOf(poolScores, poolFlags) ?? 0,
      };
    },
  };
}

export function buildRealData(): RealData {
  const b = createRealBuilder();
  while (!b.step());
  return b.result();
}

// One build per page load, shared by every mount.
let promise: Promise<RealData> | null = null;

export function loadRealData(): Promise<RealData> {
  if (promise) return promise;
  promise = new Promise<RealData>((resolve, reject) => {
    const fallback = () => {
      const builder = createRealBuilder();
      const idle: (cb: () => void) => void =
        typeof requestIdleCallback === 'function'
          ? (cb) => requestIdleCallback(cb)
          : (cb) => setTimeout(cb, 0);
      const tick = () => {
        try {
          if (builder.step()) resolve(builder.result());
          else idle(tick);
        } catch (e) {
          reject(e);
        }
      };
      idle(tick);
    };
    if (typeof Worker === 'undefined') return fallback();
    try {
      const worker = new Worker(new URL('./drift.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<RealData>) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        fallback();
      };
      worker.postMessage('build');
    } catch {
      fallback();
    }
  });
  promise.catch(() => {
    promise = null;
  });
  return promise;
}
