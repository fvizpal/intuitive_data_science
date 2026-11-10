/** Simulations for the decision-tree page (accuracy by depth, instability). Pure TypeScript. */
import {
  FRUIT_BOUNDS,
  bayesAccuracyFruit,
  makeFruit,
  makeFruitGrid,
  type Labeled,
} from './data';
import { UNLIMITED, growTree, leafOf, predictionsByDepth, type Tree } from './tree';

export const NEW_DATA_N = 5000;
export const MAX_DEPTH = 12;

const freshCache = new Map<number, Labeled>();
/** A fixed fresh set of 5000 fruit per page seed, built once. */
export function freshFruit(seed: number): Labeled {
  let f = freshCache.get(seed);
  if (!f) {
    f = makeFruit(seed + 1000, NEW_DATA_N);
    freshCache.set(seed, f);
    while (freshCache.size > 8)
      freshCache.delete(freshCache.keys().next().value as number);
  }
  return f;
}

/** Seed of the r-th training sample for a page seed (never equals the fresh-set seed). */
export const trainSeed = (seed: number, r: number): number =>
  seed * 100003 + r * 7919 + 12345;

export function newDataAccuracy(
  tree: Tree,
  seed: number,
  depth: number = UNLIMITED,
): number {
  const { X, y } = freshFruit(seed);
  let ok = 0;
  for (let i = 0; i < X.length; i++)
    if (leafOf(tree, X[i]!, depth).prediction === y[i]) ok++;
  return ok / X.length;
}

export interface DepthCurves {
  /** Depths 1..maxDepth. */
  depths: number[];
  meanTrain: number[];
  meanNew: number[];
  /** Mean over repetitions for a tree with no depth limit. */
  unlimited: { train: number; newData: number };
  /** Depth with the highest mean new-data accuracy (ties to the lower depth). */
  bestDepth: number;
  trainByRep: number[][];
  newByRep: number[][];
}

/** Per repetition: grow one tree, read every depth by truncation, score on train and fresh fruit. */
export function accuracyByDepth(
  seed: number,
  n: number,
  minLeaf: number,
  reps = 60,
  maxDepth = MAX_DEPTH,
): DepthCurves {
  const fresh = freshFruit(seed);
  const trainByRep: number[][] = [];
  const newByRep: number[][] = [];
  const out = new Uint8Array(maxDepth);
  let uTrain = 0;
  let uNew = 0;
  for (let r = 0; r < reps; r++) {
    const { X, y } = makeFruit(trainSeed(seed, r), n);
    const tree = growTree(X, y, { maxDepth: UNLIMITED, minLeaf });
    const tr = new Array<number>(maxDepth).fill(0);
    const nw = new Array<number>(maxDepth).fill(0);
    for (let i = 0; i < X.length; i++) {
      predictionsByDepth(tree, X[i]!, maxDepth, out);
      for (let d = 0; d < maxDepth; d++) if (out[d] === y[i]) tr[d]!++;
    }
    for (let i = 0; i < fresh.X.length; i++) {
      predictionsByDepth(tree, fresh.X[i]!, maxDepth, out);
      for (let d = 0; d < maxDepth; d++) if (out[d] === fresh.y[i]) nw[d]!++;
    }
    for (let d = 0; d < maxDepth; d++) {
      tr[d] = X.length ? tr[d]! / X.length : 0;
      nw[d] = nw[d]! / fresh.X.length;
    }
    trainByRep.push(tr);
    newByRep.push(nw);
    let ut = 0;
    for (let i = 0; i < X.length; i++) if (leafOf(tree, X[i]!).prediction === y[i]) ut++;
    uTrain += X.length ? ut / X.length : 0;
    uNew += newDataAccuracy(tree, seed);
  }
  const mean = (rows: number[][], d: number) => {
    let s = 0;
    for (const row of rows) s += row[d]!;
    return rows.length ? s / rows.length : 0;
  };
  const meanTrain = Array.from({ length: maxDepth }, (_, d) => mean(trainByRep, d));
  const meanNew = Array.from({ length: maxDepth }, (_, d) => mean(newByRep, d));
  let bi = 0;
  for (let d = 1; d < maxDepth; d++) if (meanNew[d]! > meanNew[bi]! + 1e-12) bi = d;
  return {
    depths: Array.from({ length: maxDepth }, (_, d) => d + 1),
    meanTrain,
    meanNew,
    unlimited: { train: uTrain / Math.max(1, reps), newData: uNew / Math.max(1, reps) },
    bestDepth: bi + 1,
    trainByRep,
    newByRep,
  };
}

// ---------- disagreement ----------

let gridCache: number[][] | null = null;
export const fruitGrid = (): number[][] => (gridCache ??= makeFruitGrid(40));

/** Share of the fixed 40 x 40 grid where the two trees (cut off at depth) predict differently. */
export function disagreement(
  a: Tree,
  b: Tree,
  grid: number[][] = fruitGrid(),
  depth: number = UNLIMITED,
): number {
  if (grid.length === 0) return 0;
  let diff = 0;
  for (const g of grid)
    if (leafOf(a, g, depth).prediction !== leafOf(b, g, depth).prediction) diff++;
  return diff / grid.length;
}

/** Mean disagreement over independent pairs of training samples. */
export function meanPairDisagreement(
  seed: number,
  n: number,
  depth: number,
  minLeaf: number,
  pairs = 30,
): number {
  let s = 0;
  for (let p = 0; p < pairs; p++) {
    const a = makeFruit(trainSeed(seed, 2 * p + 500), n);
    const b = makeFruit(trainSeed(seed, 2 * p + 501), n);
    const ta = growTree(a.X, a.y, { maxDepth: UNLIMITED, minLeaf });
    const tb = growTree(b.X, b.y, { maxDepth: UNLIMITED, minLeaf });
    s += disagreement(ta, tb, fruitGrid(), depth);
  }
  return pairs ? s / pairs : 0;
}

/** Mean pair disagreement at depths 1..maxDepth, and with no limit as the last entry. */
export function disagreementByDepth(
  seed: number,
  n: number,
  minLeaf: number,
  pairs = 30,
  maxDepth = MAX_DEPTH,
): number[] {
  const sums = new Array<number>(maxDepth + 1).fill(0);
  const grid = fruitGrid();
  for (let p = 0; p < pairs; p++) {
    const a = makeFruit(trainSeed(seed, 2 * p + 500), n);
    const b = makeFruit(trainSeed(seed, 2 * p + 501), n);
    const ta = growTree(a.X, a.y, { maxDepth: UNLIMITED, minLeaf });
    const tb = growTree(b.X, b.y, { maxDepth: UNLIMITED, minLeaf });
    for (let d = 1; d <= maxDepth; d++) sums[d - 1]! += disagreement(ta, tb, grid, d);
    sums[maxDepth]! += disagreement(ta, tb, grid, UNLIMITED);
  }
  return sums.map((s) => (pairs ? s / pairs : 0));
}

// ---------- reading the fit ----------

/** Conventions, calibrated by simulation at n = 60, smallest box 1. */
export const MEMORIZE_GAP = 0.15;
export const TOO_SIMPLE_BELOW_BEST = 0.07;
export const TOO_SIMPLE_MAX_GAP = 0.1;

export type TreeFit = 'too simple' | 'a fair fit' | 'memorizing';

export function fitReadingTree({
  train,
  newData,
  best,
}: {
  train: number;
  newData: number;
  best: number;
}): TreeFit {
  if (!Number.isFinite(train) || !Number.isFinite(newData)) return 'a fair fit';
  const gap = train - newData;
  if (gap > MEMORIZE_GAP) return 'memorizing';
  if (newData < best - TOO_SIMPLE_BELOW_BEST && gap < TOO_SIMPLE_MAX_GAP)
    return 'too simple';
  return 'a fair fit';
}

export const bestPossible = (): number => bayesAccuracyFruit();
export { FRUIT_BOUNDS };
