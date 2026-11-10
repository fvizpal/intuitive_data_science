/**
 * Classification trees for two kinds (0 = apple, 1 = orange). Pure TypeScript, no React.
 * Every question has the form "feature < threshold" (yes goes left). Candidate thresholds
 * are midpoints between consecutive DISTINCT sorted values.
 */
import { gain as gainOf, impurityOf, type Measure } from './impurity';

export const MIN_GAIN = 1e-12;
/** Depth used for "no limit". */
export const UNLIMITED = 60;

export interface Split {
  feature: number;
  threshold: number;
}

export interface TreeNode {
  id: number;
  parent: number;
  depth: number;
  rows: number[];
  counts: [number, number];
  /** Majority class; ties go to apple (0). */
  prediction: 0 | 1;
  /** Share of oranges in the box. */
  probOrange: number;
  split: Split | null;
  left: number;
  right: number;
}

export interface Tree {
  nodes: TreeNode[];
  X: number[][];
  y: number[];
  /** Node ids in the order they were split (for undo). */
  history: number[];
}

export interface Candidate {
  threshold: number;
  gain: number;
  nLeft: number;
  nRight: number;
  /** False when a box would be smaller than the smallest box size. */
  valid: boolean;
}

export interface SplitOptions {
  minLeaf?: number;
  measure?: Measure;
  features?: number[];
}

export interface BestSplit {
  feature: number;
  threshold: number;
  gain: number;
  leftCount: number;
  rightCount: number;
  /** Candidates per feature id (empty for features not searched). */
  curve: Candidate[][];
}

export const countsOf = (
  y: readonly number[],
  rows: readonly number[],
): [number, number] => {
  let c1 = 0;
  for (const r of rows) if (y[r] === 1) c1++;
  return [rows.length - c1, c1];
};

const nFeatures = (X: number[][]): number => (X[0] ? X[0].length : 0);

/** Gain at every distinct-value midpoint of each feature, via cumulative class counts. */
export function splitCurve(
  X: number[][],
  y: readonly number[],
  rows: readonly number[],
  opts: SplitOptions = {},
): Candidate[][] {
  const minLeaf = Math.max(1, opts.minLeaf ?? 1);
  const measure = opts.measure ?? 'gini';
  const p = nFeatures(X);
  const features = opts.features ?? Array.from({ length: p }, (_, f) => f);
  const curves: Candidate[][] = Array.from({ length: p }, () => []);
  const m = rows.length;
  if (m < 2) return curves;
  const total = countsOf(y, rows);
  for (const f of features) {
    const order = rows.slice().sort((a, b) => X[a]![f]! - X[b]![f]! || a - b);
    let c0 = 0;
    let c1 = 0;
    const out = curves[f]!;
    for (let i = 0; i < m - 1; i++) {
      if (y[order[i]!] === 1) c1++;
      else c0++;
      const v = X[order[i]!]![f]!;
      const w = X[order[i + 1]!]![f]!;
      if (!(v < w)) continue;
      let thr = (v + w) / 2;
      if (!(thr > v)) thr = w;
      const nL = i + 1;
      const nR = m - nL;
      out.push({
        threshold: thr,
        gain: gainOf(total, [c0, c1], [total[0] - c0, total[1] - c1], measure),
        nLeft: nL,
        nRight: nR,
        valid: nL >= minLeaf && nR >= minLeaf,
      });
    }
  }
  return curves;
}

/**
 * The cut with the largest gain. Ties (within 1e-12) go to the lower feature index, then the
 * lower threshold. Null when no valid cut exists.
 */
export function bestSplitClassification(
  X: number[][],
  y: readonly number[],
  rows: readonly number[],
  opts: SplitOptions = {},
): BestSplit | null {
  const curve = splitCurve(X, y, rows, opts);
  let best: { f: number; c: Candidate } | null = null;
  for (let f = 0; f < curve.length; f++)
    for (const c of curve[f]!) {
      if (!c.valid) continue;
      if (best === null || c.gain > best.c.gain + MIN_GAIN) best = { f, c };
    }
  if (!best) return null;
  return {
    feature: best.f,
    threshold: best.c.threshold,
    gain: best.c.gain,
    leftCount: best.c.nLeft,
    rightCount: best.c.nRight,
    curve,
  };
}

// ---------- building ----------

function makeNode(
  id: number,
  parent: number,
  depth: number,
  rows: number[],
  y: readonly number[],
): TreeNode {
  const counts = countsOf(y, rows);
  const total = counts[0] + counts[1];
  return {
    id,
    parent,
    depth,
    rows,
    counts,
    prediction: counts[1] > counts[0] ? 1 : 0,
    probOrange: total > 0 ? counts[1] / total : 0,
    split: null,
    left: -1,
    right: -1,
  };
}

/** Rows of a node that answer yes (feature < threshold) and no. */
function partition(
  X: number[][],
  rows: readonly number[],
  s: Split,
): [number[], number[]] {
  const l: number[] = [];
  const r: number[] = [];
  for (const i of rows) (X[i]![s.feature]! < s.threshold ? l : r).push(i);
  return [l, r];
}

/** Splits a leaf on a tree whose arrays this caller owns. False when a child would be empty. */
function applySplit(tree: Tree, nodeId: number, s: Split): boolean {
  const node = tree.nodes[nodeId];
  if (!node || node.split) return false;
  const [l, r] = partition(tree.X, node.rows, s);
  if (l.length === 0 || r.length === 0) return false;
  const li = tree.nodes.length;
  tree.nodes[nodeId] = { ...node, split: { ...s }, left: li, right: li + 1 };
  tree.nodes.push(makeNode(li, nodeId, node.depth + 1, l, tree.y));
  tree.nodes.push(makeNode(li + 1, nodeId, node.depth + 1, r, tree.y));
  tree.history.push(nodeId);
  return true;
}

export interface ForcedCut {
  nodeId: number;
  feature: number;
  threshold: number;
}

export interface GrowOptions {
  maxDepth?: number;
  minLeaf?: number;
  minSplit?: number;
  measure?: Measure;
  forced?: ForcedCut[];
}

/** Level-order growth. Forced cuts ignore gain; automatic cuts need gain above 1e-12. */
export function growTree(
  X: number[][],
  y: number[],
  opts: GrowOptions = {},
  rowsIn?: number[],
): Tree {
  const maxDepth = opts.maxDepth ?? UNLIMITED;
  const minLeaf = Math.max(1, opts.minLeaf ?? 1);
  const minSplit = Math.max(2, opts.minSplit ?? 2);
  const measure = opts.measure ?? 'gini';
  const forced = new Map((opts.forced ?? []).map((f) => [f.nodeId, f]));
  const rows = rowsIn ?? Array.from({ length: X.length }, (_, i) => i);
  const tree: Tree = { nodes: [makeNode(0, -1, 0, rows, y)], X, y, history: [] };
  for (let i = 0; i < tree.nodes.length; i++) {
    const node = tree.nodes[i]!;
    const f = forced.get(i);
    if (f) {
      applySplit(tree, i, { feature: f.feature, threshold: f.threshold });
      continue;
    }
    if (node.depth >= maxDepth || node.rows.length < minSplit) continue;
    if (node.counts[0] === 0 || node.counts[1] === 0) continue;
    const best = bestSplitClassification(X, y, node.rows, { minLeaf, measure });
    if (best && best.gain > MIN_GAIN)
      applySplit(tree, i, { feature: best.feature, threshold: best.threshold });
  }
  return tree;
}

/** A new tree with one more cut (the old tree is untouched). Unchanged if a box would be empty. */
export function splitNode(tree: Tree, nodeId: number, split: Split): Tree {
  const next: Tree = {
    nodes: tree.nodes.slice(),
    X: tree.X,
    y: tree.y,
    history: tree.history.slice(),
  };
  return applySplit(next, nodeId, split) ? next : tree;
}

/** A new tree without the most recent cut. */
export function undoLast(tree: Tree): Tree {
  const last = tree.history[tree.history.length - 1];
  if (last === undefined) return tree;
  const nodes = tree.nodes.slice(0, -2);
  const p = nodes[last]!;
  nodes[last] = { ...p, split: null, left: -1, right: -1 };
  return { nodes, X: tree.X, y: tree.y, history: tree.history.slice(0, -1) };
}

// ---------- prediction ----------

/** The fields drawing and prediction need (what a worker sends back). */
export interface LightNode {
  id: number;
  depth: number;
  split: Split | null;
  left: number;
  right: number;
  prediction: 0 | 1;
  probOrange: number;
}
export interface LightTree {
  nodes: LightNode[];
}

export const lighten = (tree: Tree): LightTree => ({
  nodes: tree.nodes.map((n) => ({
    id: n.id,
    depth: n.depth,
    split: n.split,
    left: n.left,
    right: n.right,
    prediction: n.prediction,
    probOrange: n.probOrange,
  })),
});

export function leafOf<T extends LightNode>(
  tree: { nodes: T[] },
  x: readonly number[],
  maxDepth = Infinity,
): T {
  let node = tree.nodes[0]!;
  while (node.split && node.depth < maxDepth)
    node =
      tree.nodes[x[node.split.feature]! < node.split.threshold ? node.left : node.right]!;
  return node;
}

export const predictOne = (tree: Tree, x: readonly number[]): 0 | 1 =>
  leafOf(tree, x).prediction;
export const predictProba = (tree: Tree, x: readonly number[]): number =>
  leafOf(tree, x).probOrange;
/** Prediction of the tree cut off at depth d (same as a tree grown to depth d). */
export const predictAtDepth = (tree: Tree, x: readonly number[], d: number): 0 | 1 =>
  leafOf(tree, x, d).prediction;

/** Predictions at depths 1..maxD in one walk; entry d - 1 is the depth-d prediction. */
export function predictionsByDepth(
  tree: Tree,
  x: readonly number[],
  maxD: number,
  out: Uint8Array,
): void {
  let node = tree.nodes[0]!;
  for (let d = 1; d <= maxD; d++) {
    if (node.split && node.depth < d)
      node =
        tree.nodes[
          x[node.split.feature]! < node.split.threshold ? node.left : node.right
        ]!;
    out[d - 1] = node.prediction;
  }
}

export const leaves = (tree: Tree, maxDepth = Infinity): TreeNode[] =>
  tree.nodes
    .filter((n) => !n.split || n.depth >= maxDepth)
    .filter((n) => n.depth <= maxDepth);
export const leafCount = (tree: Tree): number =>
  tree.nodes.filter((n) => !n.split).length;
export const treeDepth = (tree: Tree): number =>
  tree.nodes.reduce((m, n) => Math.max(m, n.depth), 0);

export function trainingAccuracy(
  tree: Tree,
  X: number[][] = tree.X,
  y: readonly number[] = tree.y,
  maxDepth = Infinity,
): number {
  if (X.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < X.length; i++)
    if (leafOf(tree, X[i]!, maxDepth).prediction === y[i]) ok++;
  return ok / X.length;
}

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Region extends Bounds {
  prediction: 0 | 1;
  probOrange: number;
  nodeId: number;
}

/** Rectangles for the leaves (or the boxes at maxDepth). They tile the bounds exactly. */
export function regionsOf(
  tree: LightTree,
  bounds: Bounds,
  maxDepth = Infinity,
): Region[] {
  const out: Region[] = [];
  const stack: { id: number; b: Bounds }[] = [{ id: 0, b: bounds }];
  while (stack.length) {
    const { id, b } = stack.pop()!;
    const node = tree.nodes[id]!;
    if (!node.split || node.depth >= maxDepth) {
      out.push({
        ...b,
        prediction: node.prediction,
        probOrange: node.probOrange,
        nodeId: id,
      });
      continue;
    }
    const { feature, threshold } = node.split;
    if (feature === 0) {
      const t = Math.min(b.x1, Math.max(b.x0, threshold));
      stack.push({ id: node.right, b: { ...b, x0: t } });
      stack.push({ id: node.left, b: { ...b, x1: t } });
    } else {
      const t = Math.min(b.y1, Math.max(b.y0, threshold));
      stack.push({ id: node.right, b: { ...b, y0: t } });
      stack.push({ id: node.left, b: { ...b, y1: t } });
    }
  }
  return out.sort((a, b) => a.nodeId - b.nodeId);
}

export interface CutSegment extends Bounds {
  nodeId: number;
  feature: number;
  threshold: number;
  depth: number;
}

/** Each cut as a line segment spanning the box it splits (x0 = x1 for a vertical cut). */
export function cutsOf(
  tree: LightTree,
  bounds: Bounds,
  maxDepth = Infinity,
): CutSegment[] {
  const out: CutSegment[] = [];
  const stack: { id: number; b: Bounds }[] = [{ id: 0, b: bounds }];
  while (stack.length) {
    const { id, b } = stack.pop()!;
    const node = tree.nodes[id]!;
    if (!node.split || node.depth >= maxDepth) continue;
    const { feature, threshold } = node.split;
    if (feature === 0) {
      const t = Math.min(b.x1, Math.max(b.x0, threshold));
      out.push({ ...b, x0: t, x1: t, nodeId: id, feature, threshold, depth: node.depth });
      stack.push({ id: node.right, b: { ...b, x0: t } });
      stack.push({ id: node.left, b: { ...b, x1: t } });
    } else {
      const t = Math.min(b.y1, Math.max(b.y0, threshold));
      out.push({ ...b, y0: t, y1: t, nodeId: id, feature, threshold, depth: node.depth });
      stack.push({ id: node.right, b: { ...b, y0: t } });
      stack.push({ id: node.left, b: { ...b, y1: t } });
    }
  }
  return out.sort((a, b) => a.nodeId - b.nodeId);
}

// ---------- choosing the next cut ----------

export interface Proposal {
  nodeId: number;
  split: Split;
  gain: number;
  /** gain x (rows in the box / all rows): how much the whole tree improves. */
  weightedGain: number;
}

export function proposalFor(
  tree: Tree,
  nodeId: number,
  opts: SplitOptions = {},
): Proposal | null {
  const node = tree.nodes[nodeId];
  if (!node || node.split || node.rows.length < 2) return null;
  if (node.counts[0] === 0 || node.counts[1] === 0) return null;
  const best = bestSplitClassification(tree.X, tree.y, node.rows, opts);
  if (!best || !(best.gain > MIN_GAIN)) return null;
  return {
    nodeId,
    split: { feature: best.feature, threshold: best.threshold },
    gain: best.gain,
    weightedGain: (best.gain * node.rows.length) / Math.max(1, tree.X.length),
  };
}

/** The leaf whose best cut helps the whole tree most (ties to the lowest id). */
export function nextBestLeaf(tree: Tree, opts: SplitOptions = {}): Proposal | null {
  let best: Proposal | null = null;
  for (const n of tree.nodes) {
    if (n.split) continue;
    const p = proposalFor(tree, n.id, opts);
    if (p && (best === null || p.weightedGain > best.weightedGain + MIN_GAIN)) best = p;
  }
  return best;
}

/** The leaf with the highest impurity (ties: more rows, then lower id). */
export function mostMixedLeaf(tree: Tree, measure: Measure = 'gini'): TreeNode | null {
  const f = impurityOf(measure);
  let best: TreeNode | null = null;
  let bi = -1;
  for (const n of tree.nodes) {
    if (n.split || n.rows.length === 0) continue;
    const g = f(n.counts);
    if (
      best === null ||
      g > bi + MIN_GAIN ||
      (Math.abs(g - bi) <= MIN_GAIN && n.rows.length > best.rows.length)
    ) {
      best = n;
      bi = g;
    }
  }
  return best;
}

/** Weighted impurity of all leaves (training rows). */
export function leafImpurity(tree: Tree, measure: Measure = 'gini'): number {
  const f = impurityOf(measure);
  const n = tree.X.length;
  if (n === 0) return 0;
  let s = 0;
  for (const l of tree.nodes) if (!l.split) s += (l.rows.length / n) * f(l.counts);
  return s;
}
