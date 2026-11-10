import { describe, expect, it } from 'vitest';
import {
  bestSplitRegression,
  expectedErrorRegression,
  growRegTree,
  predictReg,
  regLeafCount,
  regTrainingMse,
  staircase,
} from './regression';
import { DELIVERY_NOISE, deliveryTruth, makeDelivery } from './data';
import { fitPoly } from '../biasvar/fit';
import { mulberry32 } from '../../lib/random';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('12. regression hand checks', () => {
  it('step data', () => {
    const b = bestSplitRegression([1, 2, 3, 4], [1, 1, 5, 5], rows(4))!;
    expect(b.threshold).toBe(2.5);
    expect(b.sseAfter).toBeCloseTo(0, 12);
    expect(b.gain).toBeCloseTo(16, 9);
  });
  it('straight data', () => {
    const b = bestSplitRegression([1, 2, 3, 4], [1, 2, 3, 4], rows(4))!;
    expect(b.threshold).toBe(2.5);
    expect(b.sseAfter).toBeCloseTo(1, 9);
    expect(b.gain).toBeCloseTo(4, 9);
  });
  it('a leaf predicts the mean', () => {
    const t = growRegTree([1, 2, 3, 4], [1, 2, 3, 4], { maxDepth: 1 });
    expect(predictReg(t, 1)).toBeCloseTo(1.5, 12);
    expect(predictReg(t, 4)).toBeCloseTo(3.5, 12);
  });
  it('cumulative sums equal brute force', () => {
    const rng = mulberry32(7);
    for (let k = 0; k < 200; k++) {
      const n = 4 + Math.floor(rng() * 30);
      const x = Array.from({ length: n }, () => Math.floor(rng() * 10));
      const y = Array.from({ length: n }, () => rng() * 10);
      const minLeaf = 1 + Math.floor(rng() * 2);
      const sse = (idx: number[]) => {
        if (!idx.length) return 0;
        const m = idx.reduce((s, i) => s + y[i]!, 0) / idx.length;
        return idx.reduce((s, i) => s + (y[i]! - m) ** 2, 0);
      };
      const all = rows(n);
      const vals = [...new Set(x)].sort((a, b) => a - b);
      let best: { t: number; g: number; a: number } | null = null;
      for (let i = 0; i < vals.length - 1; i++) {
        const t = (vals[i]! + vals[i + 1]!) / 2;
        const l = all.filter((i2) => x[i2]! < t);
        const r = all.filter((i2) => !(x[i2]! < t));
        if (l.length < minLeaf || r.length < minLeaf) continue;
        const a = sse(l) + sse(r);
        const g = sse(all) - a;
        if (best === null || g > best.g + 1e-9 * (1 + sse(all))) best = { t, g, a };
      }
      const got = bestSplitRegression(x, y, all, { minLeaf });
      if (!best) expect(got).toBeNull();
      else {
        expect(got!.threshold).toBeCloseTo(best.t, 12);
        expect(got!.gain).toBeCloseTo(best.g, 8);
        expect(got!.sseAfter).toBeCloseTo(best.a, 8);
      }
    }
  });
});

describe('13. regression properties', () => {
  it('50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { x, y } = makeDelivery(seed, 60);
      let prev = Infinity;
      for (let d = 0; d <= 12; d++) {
        const t = growRegTree(x, y, { maxDepth: d });
        const mse = regTrainingMse(t);
        expect(mse).toBeLessThanOrEqual(prev + 1e-9);
        prev = mse;
        expect(regLeafCount(t)).toBeLessThanOrEqual(2 ** d);
        const st = staircase(t, 0, 16);
        expect(st.length).toBe(regLeafCount(t));
        for (const s of st) {
          if (s.x1 - s.x0 < 1e-9) continue;
          for (const f of [0.1, 0.5, 0.9])
            expect(predictReg(t, s.x0 + f * (s.x1 - s.x0))).toBeCloseTo(s.value, 12);
        }
      }
      expect(regTrainingMse(growRegTree(x, y))).toBeLessThan(1e-9);
    }
  });
});

describe('14. extrapolation', () => {
  const inside = { lo: 1, hi: 10 };
  const beyond = { lo: 10, hi: 16 };
  it('the tree repeats its last box; the line extends', () => {
    let lineErr16 = 0;
    let treeBeyond = 0;
    let lineBeyond = 0;
    let treeInside = 0;
    let lineInside = 0;
    const N = 100;
    for (let seed = 1; seed <= N; seed++) {
      const { x, y } = makeDelivery(seed, 60);
      const t = growRegTree(x, y, { maxDepth: 4 });
      expect(Math.abs(predictReg(t, 16) - predictReg(t, Math.max(...x)))).toBeLessThan(
        1e-12,
      );
      const line = fitPoly(x, y, 1);
      lineErr16 += Math.abs(line.predict(16) - 48);
      const tp = (v: number) => predictReg(t, v);
      treeBeyond +=
        expectedErrorRegression(tp, deliveryTruth, DELIVERY_NOISE, beyond) ** 2;
      lineBeyond +=
        expectedErrorRegression(line.predict, deliveryTruth, DELIVERY_NOISE, beyond) ** 2;
      treeInside +=
        expectedErrorRegression(tp, deliveryTruth, DELIVERY_NOISE, inside) ** 2;
      lineInside +=
        expectedErrorRegression(line.predict, deliveryTruth, DELIVERY_NOISE, inside) ** 2;
    }
    const tB = Math.sqrt(treeBeyond / N);
    const lB = Math.sqrt(lineBeyond / N);
    const tI = Math.sqrt(treeInside / N);
    const lI = Math.sqrt(lineInside / N);
    console.log(
      'REPORT extrapolation: line error at 16 km',
      (lineErr16 / N).toFixed(2),
      '| beyond 10 km tree',
      tB.toFixed(2),
      'line',
      lB.toFixed(2),
      'ratio',
      (tB / lB).toFixed(2),
      '| inside tree',
      tI.toFixed(2),
      'line',
      lI.toFixed(2),
      'ratio',
      (tI / lI).toFixed(2),
    );
    expect(lineErr16 / N).toBeLessThan(4);
    expect(tB / lB).toBeGreaterThanOrEqual(3);
    expect(tI / lI).toBeLessThan(1.4);
  });
  it('the true curve has error equal to the noise', () => {
    expect(expectedErrorRegression(deliveryTruth, deliveryTruth, 3, inside)).toBe(3);
  });
  it('is always finite', () => {
    expect(
      Number.isFinite(expectedErrorRegression(() => NaN, deliveryTruth, 3, beyond)),
    ).toBe(true);
  });
});

describe('15. delivery data', () => {
  it('deterministic and prefix-stable', () => {
    expect(makeDelivery(3, 60)).toEqual(makeDelivery(3, 60));
    expect(makeDelivery(3, 60).x.slice(0, 30)).toEqual(makeDelivery(3, 30).x);
    expect(makeDelivery(3, 60).y.slice(0, 30)).toEqual(makeDelivery(3, 30).y);
  });
  it('edge cases', () => {
    const t = growRegTree([], []);
    expect(predictReg(t, 3)).toBe(0);
    expect(regTrainingMse(t)).toBe(0);
    expect(regLeafCount(growRegTree([1], [4]))).toBe(1);
  });
});
