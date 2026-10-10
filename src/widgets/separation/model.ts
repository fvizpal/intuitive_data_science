/** Memoised crowds and their metrics for the page's seed and separation. */
import {
  auc,
  histogram,
  gini,
  ks,
  normalGroups,
  rocPoints,
  theory,
  type RocPoint,
} from './metrics';

export const N_GOOD = 4000;
export const N_BAD = 400;
/** Real share of bads used by the "4%" toggle: 4 in 100 is 1 bad per 24 goods. */
export const REAL_BAD_RATE = 0.04;
export const SCORE_LO = 300;
export const SCORE_HI = 840;
export const HIST_BINS = 30;
export const DEFAULT_SEPARATION = 1;
export const DEFAULT_CUTOFF = 600;
export const DEFAULT_SEED = 7;

export interface SepModel {
  goods: number[];
  bads: number[];
  auc: number;
  gini: number;
  ks: number;
  /** First score at which the gap between the curves is largest. */
  ksAtScore: number;
  /** The cutoff that rejects exactly the scores up to and including ksAtScore. */
  ksCutoff: number;
  roc: RocPoint[];
  theoryAuc: number;
  theoryKs: number;
}

const cache = new Map<string, SepModel>();

export function getModel(seed: number, separation: number): SepModel {
  const key = `${seed}:${separation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { goods, bads } = normalGroups(seed, N_GOOD, N_BAD, separation);
  const a = auc(goods, bads) ?? 0.5;
  const k = ks(goods, bads) ?? { ks: 0, atScore: goods[0] ?? 0 };
  const model: SepModel = {
    goods,
    bads,
    auc: a,
    gini: gini(a) ?? 0,
    ks: k.ks,
    ksAtScore: k.atScore,
    ksCutoff: k.atScore + 1,
    roc: rocPoints(goods, bads) ?? [
      { x: 0, y: 0, cutoff: 0 },
      { x: 1, y: 1, cutoff: 1 },
    ],
    theoryAuc: theory.aucNormal(separation),
    theoryKs: theory.ksNormal(separation),
  };
  if (cache.size >= 12) cache.clear();
  cache.set(key, model);
  return model;
}

/** Plain reading of the separation knob. */
export function separationReading(sep: number): string {
  if (sep <= 0.3) return 'Identical crowds: the score tells you nothing';
  if (sep <= 0.8) return 'Heavy overlap';
  if (sep <= 1.5) return 'Some separation';
  if (sep <= 2.2) return 'Clear separation';
  return 'Almost perfectly apart';
}

/** Each group's histogram as shares of that group (so both crowds are equally visible). */
export const shares = (values: readonly number[]): number[] =>
  histogram(values, SCORE_LO, SCORE_HI, HIST_BINS).map(
    (c) => c / Math.max(1, values.length),
  );
