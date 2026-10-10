/**
 * The pool behind "Reality check": 20,000 fresh applicants, scored with the REAL scorecard
 * fitted on the seed-42 book (default scaling). Built in chunks so it can run in a Web
 * Worker, or on the main thread one chunk per idle callback when workers are unavailable.
 * Pure functions of fixed seeds, so every reader sees the same pool.
 */
import { generateLoans } from '../../lib/loanData';
import { SCORECARD_SEED, getFitted } from '../scorecard/pipeline';
import type { Fitted } from '../scorecard/pipeline';
import { DEFAULT_SCALE, binPoints, scaling, scoreAll } from '../scorecard/scorecard';
import type { PointsTable } from '../scorecard/scorecard';
import { auc, gini, ks, splitGroups } from './metrics';

/** Different from the seed the scorecard was fitted on. */
export const POOL_SEED = 2025;
export const POOL_CHUNKS = 10;
export const CHUNK_SIZE = 2000;
export const POOL_SIZE = POOL_CHUNKS * CHUNK_SIZE;

export interface Reference {
  auc: number;
  gini: number;
  ks: number;
}

export interface PoolPlan {
  fit: Fitted;
  table: PointsTable;
  /** Metrics on the data the scorecard was built on. */
  reference: Reference;
}

export interface PoolData {
  /** Integer scores, one per applicant. */
  scores: Int32Array;
  /** 1 = good (repaid), 0 = bad (defaulted). */
  flags: Uint8Array;
  reference: Reference;
}

export function makePlan(): PoolPlan {
  const fit = getFitted(SCORECARD_SEED);
  const table = binPoints(fit.model, fit.bins, scaling(DEFAULT_SCALE));
  const { goods, bads } = splitGroups(
    scoreAll(fit.loans.columns, table, fit.bins),
    fit.y,
  );
  const a = auc(goods, bads) ?? 0.5;
  return {
    fit,
    table,
    reference: { auc: a, gini: gini(a) ?? 0, ks: ks(goods, bads)?.ks ?? 0 },
  };
}

export function scoreChunk(
  plan: PoolPlan,
  k: number,
): { scores: number[]; flags: number[] } {
  const loans = generateLoans(POOL_SEED + k, CHUNK_SIZE);
  return {
    scores: scoreAll(loans.columns, plan.table, plan.fit.bins),
    flags: loans.defaulted.map((d) => 1 - d),
  };
}

/** Incremental builder: call `step()` until it returns true, then read `result()`. */
export function createPoolBuilder() {
  const scores = new Int32Array(POOL_SIZE);
  const flags = new Uint8Array(POOL_SIZE);
  let plan: PoolPlan | null = null;
  let done = 0;
  return {
    step(): boolean {
      if (!plan) {
        plan = makePlan();
        return false;
      }
      const c = scoreChunk(plan, done);
      scores.set(c.scores, done * CHUNK_SIZE);
      flags.set(c.flags, done * CHUNK_SIZE);
      done++;
      return done === POOL_CHUNKS;
    },
    result(): PoolData {
      return {
        scores,
        flags,
        reference: plan?.reference ?? { auc: 0.5, gini: 0, ks: 0 },
      };
    },
  };
}

export function buildPool(): PoolData {
  const b = createPoolBuilder();
  while (!b.step());
  return b.result();
}
