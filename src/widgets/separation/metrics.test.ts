import { describe, expect, it } from 'vitest';
import fixture from './fixtures/metrics.json';
import {
  auc,
  bandLabel,
  cumulativeCurves,
  cutoffRates,
  ecdf,
  gini,
  histogram,
  ks,
  normalGroups,
  pickPairs,
  rankedSample,
  walkLine,
  rocArea,
  rocPoints,
  runningMean,
  splitGroups,
  theory,
} from './metrics';

const HAND = { goods: [2, 4, 6], bads: [1, 3, 5] };

const need = <T>(v: T | null): T => {
  expect(v).not.toBeNull();
  return v as T;
};

describe('hand-checkable example', () => {
  it('AUC 6/9, Gini 1/3, KS 1/3 first at score 1', () => {
    const a = need(auc(HAND.goods, HAND.bads));
    expect(a).toBeCloseTo(6 / 9, 12);
    expect(need(gini(a))).toBeCloseTo(1 / 3, 12);
    const k = need(ks(HAND.goods, HAND.bads));
    expect(k.ks).toBeCloseTo(1 / 3, 12);
    expect(k.atScore).toBe(1);
  });
  it('splitGroups follows 1 = good', () => {
    expect(splitGroups([5, 6, 7], [1, 0, 1])).toEqual({ goods: [5, 7], bads: [6] });
  });
});

describe('ties and extremes', () => {
  it('ties count half', () => {
    expect(auc([1, 2], [1, 2])).toBeCloseTo(0.5, 12);
  });
  it('perfect separation', () => {
    const g = [10, 11, 12];
    const b = [1, 2, 3];
    expect(auc(g, b)).toBe(1);
    expect(ks(g, b)!.ks).toBe(1);
    expect(gini(auc(g, b))).toBe(1);
  });
  it('reversed score', () => {
    expect(auc([1, 2, 3], [10, 11, 12])).toBe(0);
    expect(gini(auc([1, 2, 3], [10, 11, 12]))).toBe(-1);
  });
  it('identical samples give 0.5', () => {
    const s = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(auc(s, s)).toBeCloseTo(0.5, 12);
    expect(ks(s, s)!.ks).toBeCloseTo(0, 12);
  });
});

describe('ROC', () => {
  const { goods, bads } = normalGroups(5, 1500, 300, 1);
  const pts = need(rocPoints(goods, bads));
  it('area equals AUC', () => {
    expect(Math.abs(rocArea(pts) - need(auc(goods, bads)))).toBeLessThan(1e-9);
    expect(rocArea(need(rocPoints(HAND.goods, HAND.bads)))).toBeCloseTo(6 / 9, 12);
  });
  it('starts at (0,0), ends at (1,1), is monotone', () => {
    expect(pts[0]).toMatchObject({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toMatchObject({ x: 1, y: 1 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.x).toBeGreaterThanOrEqual(pts[i - 1]!.x);
      expect(pts[i]!.y).toBeGreaterThanOrEqual(pts[i - 1]!.y);
    }
  });
  it('one point per distinct score (plus the origin)', () => {
    const distinct = new Set([...goods, ...bads]).size;
    expect(pts.length).toBe(distinct + 1);
  });
  it('KS equals the farthest point above the diagonal', () => {
    const far = Math.max(...pts.map((p) => p.y - p.x));
    expect(Math.abs(far - need(ks(goods, bads)).ks)).toBeLessThan(1e-9);
  });
});

describe('invariance', () => {
  const { goods, bads } = normalGroups(11, 800, 200, 1.2);
  const base = { auc: need(auc(goods, bads)), ks: need(ks(goods, bads)).ks };
  it('monotonic transforms change nothing', () => {
    for (const f of [(s: number) => Math.exp(s / 100), (s: number) => 3 * s + 7]) {
      const g = goods.map(f);
      const b = bads.map(f);
      expect(Math.abs(need(auc(g, b)) - base.auc)).toBeLessThan(1e-9);
      expect(Math.abs(need(ks(g, b)).ks - base.ks)).toBeLessThan(1e-9);
    }
  });
  it('duplicating every bad 10 times changes nothing', () => {
    const b10 = Array.from({ length: 10 }, () => bads).flat();
    expect(Math.abs(need(auc(goods, b10)) - base.auc)).toBeLessThan(1e-9);
    expect(Math.abs(need(ks(goods, b10)).ks - base.ks)).toBeLessThan(1e-9);
  });
});

describe('synthetic normals match theory', () => {
  const run = (d: number) => {
    const { goods, bads } = normalGroups(3, 20000, 20000, d);
    return { auc: need(auc(goods, bads)), ks: need(ks(goods, bads)).ks };
  };
  it('separation 1', () => {
    const r = run(1);
    expect(Math.abs(r.auc - 0.76)).toBeLessThan(0.015);
    expect(Math.abs(r.ks - 0.383)).toBeLessThan(0.015);
  });
  it('separation 2', () => {
    const r = run(2);
    expect(Math.abs(r.auc - 0.921)).toBeLessThan(0.015);
    expect(Math.abs(r.ks - 0.683)).toBeLessThan(0.015);
  });
  it('separation 0', () => {
    const r = run(0);
    expect(Math.abs(r.auc - 0.5)).toBeLessThan(0.015);
    expect(r.ks).toBeLessThan(0.03);
  });
  it('theory formulas', () => {
    expect(theory.aucNormal(1)).toBeCloseTo(0.76025, 5);
    expect(theory.ksNormal(1)).toBeCloseTo(0.382925, 5);
    expect(theory.aucNormal(0)).toBeCloseTo(0.5, 6);
  });
});

describe('pickPairs', () => {
  const { goods, bads } = normalGroups(2, 4000, 400, 1);
  it('is deterministic per seed and differs across seeds', () => {
    expect(pickPairs(goods, bads, 50, 7)).toEqual(pickPairs(goods, bads, 50, 7));
    expect(pickPairs(goods, bads, 50, 7)).not.toEqual(pickPairs(goods, bads, 50, 8));
  });
  it('running mean converges to the exact AUC', () => {
    const pairs = pickPairs(goods, bads, 5000, 99);
    const m = runningMean(pairs);
    expect(m).toHaveLength(5000);
    expect(Math.abs(m[4999]! - need(auc(goods, bads)))).toBeLessThan(0.03);
  });
});

describe('cutoffRates and curves', () => {
  const { goods, bads } = HAND;
  it('cutoff below everything rejects nothing; above everything rejects all', () => {
    expect(cutoffRates(goods, bads, 0)).toEqual({
      goodsRejected: 0,
      badsRejected: 0,
      gap: 0,
    });
    expect(cutoffRates(goods, bads, 100)).toEqual({
      goodsRejected: 1,
      badsRejected: 1,
      gap: 0,
    });
  });
  it('rejects strictly below the cutoff', () => {
    const r = need(cutoffRates(goods, bads, 2));
    expect(r.badsRejected).toBeCloseTo(1 / 3, 12);
    expect(r.goodsRejected).toBe(0);
    expect(r.gap).toBeCloseTo(1 / 3, 12);
  });
  it('curves agree with cutoffRates', () => {
    const c = need(cumulativeCurves(goods, bads, 7, 0, 6));
    c.xs.forEach((x, i) => {
      const r = need(cutoffRates(goods, bads, x));
      expect(c.goods[i]).toBeCloseTo(r.goodsRejected, 12);
      expect(c.bads[i]).toBeCloseTo(r.badsRejected, 12);
    });
  });
  it('ecdf', () => {
    const f = ecdf([1, 2, 2, 3]);
    expect(f.le(2)).toBe(0.75);
    expect(f.lt(2)).toBe(0.25);
  });
  it('histogram clips into edge bins', () => {
    expect(histogram([-5, 0, 5, 99], 0, 10, 2)).toEqual([2, 2]);
  });
});

describe('empty groups never produce NaN', () => {
  it('returns null', () => {
    expect(auc([], [1])).toBeNull();
    expect(auc([1], [])).toBeNull();
    expect(gini(null)).toBeNull();
    expect(ks([], [])).toBeNull();
    expect(rocPoints([], [1])).toBeNull();
    expect(cutoffRates([1], [], 3)).toBeNull();
    expect(cumulativeCurves([], [], 10)).toBeNull();
    expect(pickPairs([], [1], 5, 1)).toEqual([]);
  });
  it('bandLabel survives NaN', () => {
    expect(bandLabel(NaN)).toBe('not available');
  });
});

describe('bandLabel', () => {
  it('uses the conventional bands', () => {
    expect(bandLabel(0.5)).toBe('coin flip');
    expect(bandLabel(0.6)).toBe('weak');
    expect(bandLabel(0.75)).toBe('acceptable');
    expect(bandLabel(0.85)).toBe('strong');
    expect(bandLabel(0.95)).toMatch(/leakage/);
  });
});

describe('matches scikit-learn and SciPy on the seed-42 scorecard', () => {
  const fx = fixture;
  it('AUC and KS within 1e-6', async () => {
    const { getFitted, SCORECARD_SEED } = await import('../scorecard/pipeline');
    const { binPoints, scaling, DEFAULT_SCALE, scoreAll } =
      await import('../scorecard/scorecard');
    const f = getFitted(SCORECARD_SEED);
    const scores = scoreAll(
      f.loans.columns,
      binPoints(f.model, f.bins, scaling(DEFAULT_SCALE)),
      f.bins,
    );
    const { goods, bads } = splitGroups(scores, f.y);
    expect(scores).toHaveLength(fx.n);
    expect(Math.abs(need(auc(goods, bads)) - fx.auc)).toBeLessThan(1e-6);
    expect(Math.abs(need(ks(goods, bads)).ks - fx.ks)).toBeLessThan(1e-6);
  });
});

describe('ranked line-up', () => {
  const { goods, bads } = normalGroups(4, 4000, 400, 1);
  const line = rankedSample(goods, bads, 75, 25);
  const steps = walkLine(line);
  it('has the right mix, riskiest first', () => {
    expect(line).toHaveLength(100);
    expect(line.filter((c) => !c.good)).toHaveLength(25);
    for (let i = 1; i < line.length; i++)
      expect(line[i]!.score).toBeGreaterThanOrEqual(line[i - 1]!.score);
  });
  it('walks from (0,0) to everyone, and its biggest gap is close to KS', () => {
    expect(steps[0]).toMatchObject({ k: 0, bads: 0, goods: 0, gap: 0 });
    expect(steps[100]).toMatchObject({ bads: 25, goods: 75 });
    expect(steps[100]!.gap).toBeCloseTo(0, 12);
    const peak = Math.max(...steps.map((s) => s.gap));
    expect(Math.abs(peak - need(ks(goods, bads)).ks)).toBeLessThan(0.05);
  });
  it('is empty without both groups', () => {
    expect(rankedSample([], [1], 5, 5)).toEqual([]);
  });
});
