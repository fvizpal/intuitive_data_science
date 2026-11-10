import { describe, expect, it } from 'vitest';
import { entropy, gain, gini, weightedImpurity } from './impurity';
import { FRUIT_BOUNDS, makeCheckerboard, makeFruit, bayesAccuracyFruit } from './data';
import {
  bestSplitClassification,
  growTree,
  leafCount,
  leafImpurity,
  leafOf,
  nextBestLeaf,
  predictAtDepth,
  predictOne,
  predictProba,
  regionsOf,
  splitNode,
  trainingAccuracy,
  treeDepth,
  undoLast,
  type Tree,
} from './tree';
import { mulberry32 } from '../../lib/random';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
const col = (v: number[]) => v.map((x) => [x]);

describe('1. hand-checkable mix', () => {
  it('gini values', () => {
    expect(gini([5, 5])).toBeCloseTo(0.5, 12);
    expect(gini([10, 0])).toBe(0);
    expect(gini([3, 1])).toBeCloseTo(0.375, 12);
    expect(gini([1, 2])).toBeCloseTo(4 / 9, 12);
  });
  it('weighted impurity and gain of 10 fruit', () => {
    expect(weightedImpurity([3, 1], [2, 4])).toBeCloseTo(0.416667, 6);
    expect(gain([5, 5], [3, 1], [2, 4])).toBeCloseTo(0.083333, 6);
  });
});

describe('2. question A versus B', () => {
  const parent = [50, 50];
  const A: [number[], number[]] = [
    [35, 15],
    [15, 35],
  ];
  const B: [number[], number[]] = [
    [0, 20],
    [50, 30],
  ];
  it('gini', () => {
    expect(weightedImpurity(...A)).toBeCloseTo(0.42, 9);
    expect(gain(parent, ...A)).toBeCloseTo(0.08, 9);
    expect(weightedImpurity(...B)).toBeCloseTo(0.375, 9);
    expect(gain(parent, ...B)).toBeCloseTo(0.125, 9);
  });
  it('accuracy ties at 70 of 100', () => {
    expect(Math.max(...A[0]) + Math.max(...A[1])).toBe(70);
    expect(Math.max(...B[0]) + Math.max(...B[1])).toBe(70);
  });
  it('entropy agrees on the ranking', () => {
    const ga = gain(parent, ...A, 'entropy');
    const gb = gain(parent, ...B, 'entropy');
    expect(ga).toBeCloseTo(0.1187, 3);
    expect(gb).toBeCloseTo(0.2365, 3);
    expect(gb).toBeGreaterThan(ga);
    expect(entropy([5, 5])).toBeCloseTo(1, 12);
    console.log(
      'REPORT A vs B: gini gains',
      0.08,
      0.125,
      'entropy gains',
      ga.toFixed(4),
      gb.toFixed(4),
    );
  });
});

describe('3. best split, hand-checked', () => {
  const X = col([1, 2, 3, 4, 5, 6]);
  it('clean split', () => {
    const b = bestSplitClassification(X, [0, 0, 0, 1, 1, 1], rows(6))!;
    expect(b.threshold).toBe(3.5);
    expect(b.gain).toBeCloseTo(0.5, 12);
  });
  const y = [0, 0, 1, 0, 1, 1];
  it('gains and the tie goes to the lower threshold', () => {
    const b = bestSplitClassification(X, y, rows(6))!;
    const gains = b.curve[0]!.map((c) => c.gain);
    [0.1, 0.25, 0.0556, 0.25, 0.1].forEach((g, i) => expect(gains[i]).toBeCloseTo(g, 3));
    expect(b.threshold).toBe(2.5);
  });
  it('minLeaf', () => {
    expect(bestSplitClassification(X, y, rows(6), { minLeaf: 2 })!.threshold).toBe(2.5);
    const b3 = bestSplitClassification(X, y, rows(6), { minLeaf: 3 })!;
    expect(b3.threshold).toBe(3.5);
    expect(b3.gain).toBeCloseTo(0.0556, 3);
  });
});

describe('4. cumulative search equals brute force', () => {
  function brute(X: number[][], y: number[], minLeaf: number) {
    let best: { f: number; t: number; g: number } | null = null;
    for (let f = 0; f < 2; f++) {
      const vals = [...new Set(X.map((r) => r[f]!))].sort((a, b) => a - b);
      for (let i = 0; i < vals.length - 1; i++) {
        const t = (vals[i]! + vals[i + 1]!) / 2;
        const l = X.map((_, k) => k).filter((k) => X[k]![f]! < t);
        const r = X.map((_, k) => k).filter((k) => !(X[k]![f]! < t));
        if (l.length < minLeaf || r.length < minLeaf) continue;
        const c = (rs: number[]) => [
          rs.filter((k) => y[k] === 0).length,
          rs.filter((k) => y[k] === 1).length,
        ];
        const g = gain(c(X.map((_, k) => k)), c(l), c(r));
        if (best === null || g > best.g + 1e-12) best = { f, t, g };
      }
    }
    return best;
  }
  it('200 random datasets', () => {
    const rng = mulberry32(42);
    for (let k = 0; k < 200; k++) {
      const n = 5 + Math.floor(rng() * 36);
      const X = Array.from({ length: n }, () => [
        Math.floor(rng() * 8),
        Math.floor(rng() * 6) / 2,
      ]);
      const y = Array.from({ length: n }, () => (rng() < 0.5 ? 0 : 1));
      const minLeaf = 1 + Math.floor(rng() * 3);
      const a = bestSplitClassification(X, y, rows(n), { minLeaf });
      const b = brute(X, y, minLeaf);
      if (!b) {
        expect(a).toBeNull();
        continue;
      }
      expect(a).not.toBeNull();
      expect(a!.feature).toBe(b.f);
      expect(a!.threshold).toBeCloseTo(b.t, 12);
      expect(a!.gain).toBeCloseTo(b.g, 10);
      // equal values never end up on opposite sides, threshold is a midpoint of distinct values
      const side = new Map<number, boolean>();
      for (const r of X) {
        const left = r[a!.feature]! < a!.threshold;
        const v = r[a!.feature]!;
        if (side.has(v)) expect(side.get(v)).toBe(left);
        side.set(v, left);
      }
      expect(X.some((r) => r[a!.feature] === a!.threshold)).toBe(false);
    }
  });
});

describe('5. leaf rules', () => {
  it('majority class, ties to apple, probability, counts add up', () => {
    const t = growTree(col([1, 2, 3, 4]), [0, 1, 0, 1], { maxDepth: 0 });
    expect(t.nodes[0]!.prediction).toBe(0);
    expect(t.nodes[0]!.probOrange).toBe(0.5);
    const { X, y } = makeFruit(3, 60);
    const g = growTree(X, y, { maxDepth: 6 });
    for (const n of g.nodes) {
      if (n.split) {
        const l = g.nodes[n.left]!;
        const r = g.nodes[n.right]!;
        expect(l.counts[0] + r.counts[0]).toBe(n.counts[0]);
        expect(l.counts[1] + r.counts[1]).toBe(n.counts[1]);
      } else {
        expect(n.probOrange).toBeCloseTo(n.counts[1] / (n.counts[0] + n.counts[1]), 12);
      }
    }
    const seen = new Array(60).fill(0);
    for (const n of g.nodes) if (!n.split) for (const r of n.rows) seen[r]++;
    expect(seen.every((c) => c === 1)).toBe(true);
  });
  it('regions tile the bounds', () => {
    const { X, y } = makeFruit(4, 60);
    const g = growTree(X, y, { maxDepth: 5 });
    const R = regionsOf(g, FRUIT_BOUNDS);
    const area = (r: { x0: number; x1: number; y0: number; y1: number }) =>
      (r.x1 - r.x0) * (r.y1 - r.y0);
    const total = R.reduce((s, r) => s + area(r), 0);
    expect(Math.abs(total - area(FRUIT_BOUNDS))).toBeLessThan(1e-9);
    for (let i = 0; i < R.length; i++)
      for (let j = i + 1; j < R.length; j++) {
        const a = R[i]!;
        const b = R[j]!;
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        expect(Math.max(0, w) * Math.max(0, h)).toBeLessThan(1e-9);
      }
    expect(R.length).toBe(leafCount(g));
  });
});

describe('6. truncation equals growth', () => {
  it('depth d of a depth-12 tree equals a tree grown to d', () => {
    const rng = mulberry32(11);
    for (const seed of [1, 2, 3]) {
      const { X, y } = makeFruit(seed, 60);
      const probe = makeFruit(seed + 77, 500).X;
      void rng;
      for (const minLeaf of [1, 5]) {
        const big = growTree(X, y, { maxDepth: 12, minLeaf });
        for (let d = 1; d <= 8; d++) {
          const direct = growTree(X, y, { maxDepth: d, minLeaf });
          for (const x of [...X, ...probe])
            expect(predictAtDepth(big, x, d)).toBe(predictOne(direct, x));
        }
      }
    }
  });
});

describe('7. scale does not matter', () => {
  const affine = (x: number) => 1000 * x + 5;
  const expo = (x: number) => Math.exp(x / 100);
  for (const maxDepth of [60, 3]) {
    it(`depth ${maxDepth}`, () => {
      const { X, y } = makeFruit(9, 100);
      const base = growTree(X, y, { maxDepth });
      const probe = makeFruit(10, 200).X;
      for (const [name, f] of [
        ['affine', affine],
        ['exp', expo],
      ] as const) {
        const X2 = X.map((r) => r.map(f));
        const t2 = growTree(X2, y, { maxDepth });
        expect(t2.nodes.length).toBe(base.nodes.length);
        for (let i = 0; i < X.length; i++)
          expect(leafOf(t2, X2[i]!).id).toBe(leafOf(base, X[i]!).id);
        for (const x of probe) expect(predictOne(t2, x.map(f))).toBe(predictOne(base, x));
        if (name === 'affine')
          base.nodes.forEach((n, i) => {
            if (n.split)
              expect(t2.nodes[i]!.split!.threshold).toBeCloseTo(
                affine(n.split.threshold),
                6,
              );
          });
      }
    });
  }
});

describe('8. growth properties', () => {
  it('50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { X, y } = makeFruit(seed, 60);
      let prevAcc = 0;
      let prevImp = Infinity;
      for (let d = 0; d <= 12; d++) {
        const t = growTree(X, y, { maxDepth: d });
        const acc = trainingAccuracy(t);
        const imp = leafImpurity(t);
        expect(acc).toBeGreaterThanOrEqual(prevAcc - 1e-12);
        expect(imp).toBeLessThanOrEqual(prevImp + 1e-12);
        expect(leafCount(t)).toBeLessThanOrEqual(2 ** d);
        prevAcc = acc;
        prevImp = imp;
      }
      const full = growTree(X, y);
      expect(trainingAccuracy(full)).toBe(1);
      expect(
        full.nodes
          .filter((n) => !n.split)
          .every((n) => n.counts[0] === 0 || n.counts[1] === 0),
      ).toBe(true);
      for (const minLeaf of [1, 3, 10]) {
        const t = growTree(X, y, { minLeaf });
        expect(
          t.nodes.filter((n) => !n.split).every((n) => n.rows.length >= minLeaf),
        ).toBe(true);
      }
    }
  });
});

describe('9. checkerboard', () => {
  const { X, y } = makeCheckerboard(1, 400);
  it('quadrants are balanced', () => {
    expect(X.length).toBe(400);
    expect(y.filter((v) => v === 1).length).toBe(200);
  });
  it('no single cut helps, a forced pair does', () => {
    const best = bestSplitClassification(X, y, rows(400))!;
    const d1 = growTree(X, y, { maxDepth: 1 });
    const forced = growTree(X, y, {
      maxDepth: 2,
      forced: [{ nodeId: 0, feature: 0, threshold: 0.5 }],
    });
    const d2 = growTree(X, y, { maxDepth: 2 });
    const full = growTree(X, y);
    console.log(
      'REPORT checkerboard: best gain',
      best.gain.toFixed(4),
      'depth-1 acc',
      trainingAccuracy(d1).toFixed(3),
      'greedy depth-2 acc',
      trainingAccuracy(d2).toFixed(3),
      'greedy leaves to purity',
      leafCount(full),
      'forced leaves',
      leafCount(forced),
    );
    expect(best.gain).toBeLessThanOrEqual(0.02);
    expect(trainingAccuracy(d1)).toBeLessThanOrEqual(0.6);
    expect(trainingAccuracy(forced)).toBe(1);
    expect(leafCount(forced)).toBe(4);
    expect(treeDepth(forced)).toBe(2);
    expect(trainingAccuracy(full)).toBe(1);
  });
});

describe('15. determinism and common random numbers', () => {
  it('same seed same data, prefix property', () => {
    expect(makeFruit(5, 60)).toEqual(makeFruit(5, 60));
    expect(makeFruit(5, 60).X.slice(0, 30)).toEqual(makeFruit(5, 30).X);
    expect(makeFruit(5, 60).y.slice(0, 30)).toEqual(makeFruit(5, 30).y);
    expect(makeCheckerboard(2, 200)).toEqual(makeCheckerboard(2, 200));
    const a = growTree(makeFruit(5, 60).X, makeFruit(5, 60).y);
    const b = growTree(makeFruit(5, 60).X, makeFruit(5, 60).y);
    expect(a.nodes.map((n) => n.split)).toEqual(b.nodes.map((n) => n.split));
  });
});

describe('immutability and undo', () => {
  it('splitNode and undoLast', () => {
    const { X, y } = makeFruit(1, 60);
    const t0 = growTree(X, y, { maxDepth: 0 });
    const p = nextBestLeaf(t0)!;
    const t1 = splitNode(t0, 0, p.split);
    expect(t0.nodes.length).toBe(1);
    expect(t1.nodes.length).toBe(3);
    const back = undoLast(t1);
    expect(back.nodes.length).toBe(1);
    expect(back.nodes[0]!.split).toBeNull();
    expect(undoLast(back)).toBe(back);
    expect(splitNode(t1, 0, p.split)).toBe(t1);
  });
});

describe('16. edge cases', () => {
  const finite = (t: Tree) => {
    for (const n of t.nodes) expect(Number.isFinite(n.probOrange)).toBe(true);
  };
  it('degenerate inputs', () => {
    finite(growTree([], []));
    expect(growTree([], []).nodes.length).toBe(1);
    finite(growTree([[1]], [1]));
    expect(leafCount(growTree([[1], [2], [3]], [1, 1, 1]))).toBe(1);
    expect(leafCount(growTree([[2], [2], [2]], [0, 1, 0]))).toBe(1);
    expect(leafCount(growTree(col([1, 2, 3, 4]), [0, 0, 1, 1], { minLeaf: 3 }))).toBe(1);
    expect(bestSplitClassification([], [], [])).toBeNull();
    expect(predictProba(growTree([], []), [1])).toBe(0);
  });
});

describe('bayes', () => {
  it('between 0.83 and 0.84', () => {
    const b = bayesAccuracyFruit();
    expect(b).toBeGreaterThan(0.83);
    expect(b).toBeLessThan(0.84);
  });
  it('Monte Carlo of the linear rule agrees', () => {
    const { X, y } = makeFruit(123, 200000);
    let ok = 0;
    for (let i = 0; i < X.length; i++) {
      const s = (35 / 900) * (X[i]![0]! - 167.5) + (2.5 / 2.56) * (X[i]![1]! - 4.75);
      if ((s > 0 ? 1 : 0) === y[i]) ok++;
    }
    const mc = ok / X.length;
    console.log(
      'REPORT bayes',
      bayesAccuracyFruit().toFixed(4),
      'Monte Carlo',
      mc.toFixed(4),
    );
    expect(Math.abs(mc - bayesAccuracyFruit())).toBeLessThan(0.015);
  });
});
