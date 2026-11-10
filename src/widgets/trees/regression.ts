/** Regression trees on one feature. Pure TypeScript, no React. Score: sum of squared errors. */

export const MIN_REG_GAIN = 1e-9;
export const REG_UNLIMITED = 60;

export interface RegSplit {
  threshold: number;
  sseAfter: number;
  gain: number;
}

export interface RegOptions {
  minLeaf?: number;
}

/** Best cut by cumulative sums, O(n log n). Ties go to the lower threshold. Null if none. */
export function bestSplitRegression(
  x: readonly number[],
  y: readonly number[],
  rows: readonly number[],
  opts: RegOptions = {},
): RegSplit | null {
  const minLeaf = Math.max(1, opts.minLeaf ?? 1);
  const m = rows.length;
  if (m < 2) return null;
  const order = rows.slice().sort((a, b) => x[a]! - x[b]! || a - b);
  let shift = 0;
  for (const r of order) shift += y[r]!;
  shift /= m;
  let tot = 0;
  let totSq = 0;
  for (const r of order) {
    const v = y[r]! - shift;
    tot += v;
    totSq += v * v;
  }
  const parent = totSq - (tot * tot) / m;
  let s = 0;
  let sq = 0;
  let best: RegSplit | null = null;
  for (let i = 0; i < m - 1; i++) {
    const v = y[order[i]!]! - shift;
    s += v;
    sq += v * v;
    const a = x[order[i]!]!;
    const b = x[order[i + 1]!]!;
    if (!(a < b)) continue;
    const nL = i + 1;
    const nR = m - nL;
    if (nL < minLeaf || nR < minLeaf) continue;
    const sseL = sq - (s * s) / nL;
    const sseR = totSq - sq - ((tot - s) * (tot - s)) / nR;
    const after = Math.max(0, sseL) + Math.max(0, sseR);
    const gain = parent - after;
    if (best === null || gain > best.gain + 1e-9 * (1 + Math.abs(parent))) {
      let thr = (a + b) / 2;
      if (!(thr > a)) thr = b;
      best = { threshold: thr, sseAfter: after, gain };
    }
  }
  return best;
}

export interface RegNode {
  id: number;
  parent: number;
  depth: number;
  rows: number[];
  mean: number;
  split: number | null;
  left: number;
  right: number;
}

export interface RegTree {
  nodes: RegNode[];
  x: number[];
  y: number[];
}

function regNode(
  id: number,
  parent: number,
  depth: number,
  rows: number[],
  y: number[],
): RegNode {
  let s = 0;
  for (const r of rows) s += y[r]!;
  return {
    id,
    parent,
    depth,
    rows,
    mean: rows.length ? s / rows.length : 0,
    split: null,
    left: -1,
    right: -1,
  };
}

export function growRegTree(
  x: number[],
  y: number[],
  opts: { maxDepth?: number; minLeaf?: number } = {},
): RegTree {
  const maxDepth = opts.maxDepth ?? REG_UNLIMITED;
  const minLeaf = Math.max(1, opts.minLeaf ?? 1);
  const tree: RegTree = {
    nodes: [
      regNode(
        0,
        -1,
        0,
        Array.from({ length: x.length }, (_, i) => i),
        y,
      ),
    ],
    x,
    y,
  };
  for (let i = 0; i < tree.nodes.length; i++) {
    const node = tree.nodes[i]!;
    if (node.depth >= maxDepth || node.rows.length < 2) continue;
    const best = bestSplitRegression(x, y, node.rows, { minLeaf });
    if (!best || !(best.gain > MIN_REG_GAIN)) continue;
    const l: number[] = [];
    const r: number[] = [];
    for (const row of node.rows) (x[row]! < best.threshold ? l : r).push(row);
    if (!l.length || !r.length) continue;
    const li = tree.nodes.length;
    tree.nodes[i] = { ...node, split: best.threshold, left: li, right: li + 1 };
    tree.nodes.push(regNode(li, i, node.depth + 1, l, y));
    tree.nodes.push(regNode(li + 1, i, node.depth + 1, r, y));
  }
  return tree;
}

/** Prediction of the tree (cut off at depth d if given): the mean of the box x falls in. */
export function predictReg(tree: RegTree, x: number, d = Infinity): number {
  let node = tree.nodes[0]!;
  while (node.split !== null && node.depth < d)
    node = tree.nodes[x < node.split ? node.left : node.right]!;
  return node.mean;
}

export const regLeafCount = (tree: RegTree, d = Infinity): number => {
  let c = 0;
  const walk = (id: number) => {
    const n = tree.nodes[id]!;
    if (n.split === null || n.depth >= d) c++;
    else {
      walk(n.left);
      walk(n.right);
    }
  };
  walk(0);
  return c;
};

export interface Step {
  x0: number;
  x1: number;
  value: number;
}

/** The staircase over [lo, hi]: one flat step per leaf, left to right. */
export function staircase(tree: RegTree, lo: number, hi: number, d = Infinity): Step[] {
  const steps: Step[] = [];
  const walk = (id: number, a: number, b: number) => {
    const n = tree.nodes[id]!;
    if (n.split === null || n.depth >= d) {
      steps.push({ x0: a, x1: b, value: n.mean });
      return;
    }
    const t = Math.min(b, Math.max(a, n.split));
    walk(n.left, a, t);
    walk(n.right, t, b);
  };
  walk(0, lo, hi);
  return steps;
}

export function regTrainingMse(tree: RegTree, d = Infinity): number {
  if (!tree.x.length) return 0;
  let s = 0;
  for (let i = 0; i < tree.x.length; i++)
    s += (tree.y[i]! - predictReg(tree, tree.x[i]!, d)) ** 2;
  return s / tree.x.length;
}

/**
 * Exact error on new orders: sqrt(noise^2 + mean over a grid of (truth - fit)^2).
 * No test sample: only a simulation knows the truth. Always finite.
 */
export function expectedErrorRegression(
  predict: (x: number) => number,
  truthFn: (x: number) => number,
  noiseSd: number,
  range: { lo: number; hi: number; points?: number },
): number {
  const points = range.points ?? 400;
  let s = 0;
  for (let i = 0; i < points; i++) {
    const g = range.lo + ((i + 0.5) / points) * (range.hi - range.lo);
    const p = predict(g);
    const d = truthFn(g) - (Number.isFinite(p) ? p : 1e6);
    s += d * d;
  }
  const v = noiseSd * noiseSd + s / Math.max(1, points);
  return Number.isFinite(v) ? Math.sqrt(v) : 1e6;
}
