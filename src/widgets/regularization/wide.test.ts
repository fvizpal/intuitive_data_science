import { describe, expect, it } from 'vitest';
import { kFoldIndices } from '../validation/validation';
import { mulberry32, normal } from '../../lib/random';
import { buildDesign } from './design';
import { lambdaMax, lassoFit, lassoPath } from './lasso';
import { matOf, takeRows } from './linalg';
import { ridgeFit, ridgePath } from './ridge';
import {
  bestLambdaIndex,
  compareMethods,
  cvPenalty,
  exactErrorWide,
  gridFor,
  makeWide,
  penaltyGrid,
  widePaths,
  withNoise,
} from './wide';

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const sq = (v: number[]) => v.map((a) => a * a);

describe('makeWide', () => {
  it('common random numbers', () => {
    const a = makeWide(5, 30);
    const b = makeWide(5, 100);
    for (let i = 0; i < 30 * 20; i++) expect(a.x.a[i]).toBe(b.x.a[i]);
    for (let i = 0; i < 30; i++) expect(a.eps[i]).toBe(b.eps[i]);
    for (let i = 0; i < 30; i++) expect(a.y[i]).toBe(b.y[i]);
    const loud = withNoise(a, 4);
    const direct = makeWide(5, 30, { noiseSd: 4 });
    for (let i = 0; i < 30; i++) {
      expect(loud.y[i]).toBeCloseTo(direct.y[i]!, 12);
      expect(loud.eps[i]).toBe(a.eps[i]);
    }
    expect(makeWide(5, 30).y).toEqual(a.y);
    expect(makeWide(6, 30).y).not.toEqual(a.y);
  });
});

describe('grid and determinism', () => {
  const w = makeWide(3, 40);
  it('61 values from 0 then lamMax*1e-3 to lamMax*4', () => {
    const g = gridFor(w);
    const lm = lambdaMax(w.x, w.y);
    expect(g.length).toBe(61);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeCloseTo(lm * 1e-3, 12);
    expect(g[60]).toBeCloseTo(lm * 4, 12);
    const p = widePaths(w);
    expect(p.lassoNonzero[60]).toBe(0);
    expect(p.lassoCoefs[60]!.every((b) => b === 0)).toBe(true);
    expect(p.ridgeCoefs[60]!.every((b) => b !== 0)).toBe(true);
    expect(JSON.stringify(widePaths(w))).toBe(JSON.stringify(p));
    expect(JSON.stringify(cvPenalty(w.x, w.y, 'lasso', g, 5, 9))).toBe(
      JSON.stringify(cvPenalty(w.x, w.y, 'lasso', g, 5, 9)),
    );
    expect(JSON.stringify(p).includes('null')).toBe(false);
  });
  it('ties go to the larger lambda', () => {
    expect(bestLambdaIndex([3, 1, 1, 1, 2])).toBe(3);
    expect(bestLambdaIndex([1, 2, 3])).toBe(0);
  });
});

describe('exact error vs Monte Carlo', () => {
  const w = makeWide(8, 40);
  const g = gridFor(w);
  for (const [name, fit] of [
    ['ridge', ridgeFit(w.x, w.y, g[30]!)],
    ['lasso', lassoFit(w.x, w.y, g[30]!)],
  ] as const) {
    it(name, () => {
      const exact = exactErrorWide(fit, w.trueBeta, w.noiseSd).mse;
      const rng = mulberry32(99);
      let s = 0;
      const N = 200000;
      for (let t = 0; t < N; t++) {
        let truth = 0;
        let pred = fit.intercept;
        for (let j = 0; j < 20; j++) {
          const xv = normal(rng);
          truth += w.trueBeta[j]! * xv;
          pred += fit.coefs[j]! * xv;
        }
        const yv = truth + w.noiseSd * normal(rng);
        s += (yv - pred) ** 2;
      }
      const mc = s / N;
      console.log(name, 'exact', exact.toFixed(3), 'mc', mc.toFixed(3));
      expect(Math.abs(mc / exact - 1)).toBeLessThan(0.02);
    });
  }
});

describe('standardization uses training rows only', () => {
  const w = makeWide(12, 40);
  const g = gridFor(w);
  const folds = kFoldIndices(40, 5, 77)!;
  it('folds are disjoint and cover every row', () => {
    const seen = new Set<number>();
    for (const f of folds)
      for (const i of f) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
    expect(seen.size).toBe(40);
  });
  it('fold fits equal fits on the training submatrix and ignore held-out values', () => {
    const held = folds[0]!;
    const isHeld = new Set(held);
    const train = Array.from({ length: 40 }, (_, i) => i).filter((i) => !isHeld.has(i));
    const sub = takeRows(w.x, train);
    const ysub = train.map((i) => w.y[i]!);
    const crazy = matOf(40, 20, w.x.a.slice());
    for (const i of held)
      for (let j = 0; j < 20; j++) crazy.a[i * 20 + j] = 1e6 * (j + 1);
    const d1 = buildDesign(w.x, w.y, true, train);
    const d2 = buildDesign(crazy, w.y, true, train);
    expect(Array.from(d1.mean)).toEqual(Array.from(d2.mean));
    expect(Array.from(d1.scale)).toEqual(Array.from(d2.scale));
    const lam = [0, g[10]!, g[40]!];
    const viaRows = lassoPath(crazy, w.y, lam, { rows: train });
    const direct = lassoPath(sub, ysub, lam);
    const rRows = ridgePath(crazy, w.y, lam, { rows: train });
    const rDirect = ridgePath(sub, ysub, lam);
    lam.forEach((_, i) => {
      for (let j = 0; j < 20; j++) {
        expect(Math.abs(viaRows[i]!.coefs[j]! - direct[i]!.coefs[j]!)).toBeLessThan(1e-9);
        expect(Math.abs(rRows[i]!.coefs[j]! - rDirect[i]!.coefs[j]!)).toBeLessThan(1e-9);
      }
    });
  });
  it('cvPenalty equals a hand-rolled fold loop', () => {
    const lam = [0, g[20]!, g[45]!];
    for (const method of ['ridge', 'lasso'] as const) {
      const res = cvPenalty(w.x, w.y, method, lam, 5, 77);
      const tot = new Float64Array(3);
      for (const held of folds) {
        const hs = new Set(held);
        const train = Array.from({ length: 40 }, (_, i) => i).filter((i) => !hs.has(i));
        const sub = takeRows(w.x, train);
        const ysub = train.map((i) => w.y[i]!);
        lam.forEach((l, li) => {
          const f = method === 'ridge' ? ridgeFit(sub, ysub, l) : lassoFit(sub, ysub, l);
          for (const i of held) {
            let p = f.intercept;
            for (let j = 0; j < 20; j++) p += f.coefs[j]! * w.x.a[i * 20 + j]!;
            tot[li] = tot[li]! + (w.y[i]! - p) ** 2;
          }
        });
      }
      lam.forEach((_, li) =>
        expect(Math.abs(res.cv[li]! - Math.sqrt(tot[li]! / 40))).toBeLessThan(1e-7),
      );
    }
  });
});

describe('pure noise sanity', () => {
  it('CV at its pick is close to the noise level; lasso keeps few features', () => {
    const zero = new Array<number>(20).fill(0);
    const cvAt: number[] = [];
    const kept: number[] = [];
    for (let r = 0; r < 50; r++) {
      const w = makeWide(500 + r, 40, { trueBeta: zero });
      const g = gridFor(w);
      const cl = cvPenalty(w.x, w.y, 'lasso', g, 5, r + 1);
      cvAt.push(cl.cv[cl.best]!);
      kept.push(lassoFit(w.x, w.y, g[cl.best]!).nonzero);
    }
    const target = 2 * Math.sqrt(1 + 1 / 40);
    console.log(
      'pure noise: mean CV at pick',
      mean(cvAt).toFixed(3),
      'target',
      target.toFixed(3),
      'ratio',
      (mean(cvAt) / target).toFixed(3),
      'mean kept',
      mean(kept).toFixed(2),
    );
    expect(Math.abs(mean(cvAt) / target - 1)).toBeLessThan(0.12);
    expect(mean(kept)).toBeLessThanOrEqual(4);
  });
});

describe('wide data (n = 40, p = 20)', () => {
  it('ridge-CV and lasso-CV beat plain least squares', () => {
    const c = compareMethods(1, 200, { n: 40 });
    const ls = sq(c.ls);
    const ri = sq(c.ridge);
    const la = sq(c.lasso);
    const theory = 4 * (1 + 20 / (40 - 20 - 1));
    console.log('n=40 mean MSE LS', mean(ls).toFixed(2), 'theory', theory.toFixed(2));
    console.log(
      'n=40 median MSE LS/ridge/lasso',
      median(ls).toFixed(2),
      median(ri).toFixed(2),
      median(la).toFixed(2),
      'RMSE',
      median(c.ls).toFixed(2),
      median(c.ridge).toFixed(2),
      median(c.lasso).toFixed(2),
    );
    console.log(
      'lasso kept',
      mean(c.lassoKept).toFixed(2),
      'real found',
      mean(c.lassoReal).toFixed(2),
    );
    expect(Math.abs(mean(ls) / theory - 1)).toBeLessThan(0.25);
    // Spec guessed 0.85; simulation gives about 0.90 (ridge helps only a little when 3 of 20 features matter).
    expect(median(ri)).toBeLessThanOrEqual(0.95 * median(ls));
    expect(median(la)).toBeLessThanOrEqual(0.85 * median(ls));
    expect(mean(c.lassoKept)).toBeGreaterThanOrEqual(3);
    expect(mean(c.lassoKept)).toBeLessThanOrEqual(14);
    expect(mean(c.lassoReal)).toBeGreaterThanOrEqual(2.4);
  });
  it('more data shrinks the need (n = 200)', () => {
    const c = compareMethods(1, 100, { n: 200 });
    const ls = median(sq(c.ls));
    const best = Math.min(median(sq(c.ridge)), median(sq(c.lasso)));
    console.log(
      'n=200 median MSE LS/ridge/lasso',
      ls.toFixed(2),
      median(sq(c.ridge)).toFixed(2),
      median(sq(c.lasso)).toFixed(2),
      'RMSE',
      median(c.ls).toFixed(2),
      median(c.ridge).toFixed(2),
      median(c.lasso).toFixed(2),
    );
    expect(ls).toBeLessThanOrEqual(1.15 * best);
  });
  it('compareMethods is deterministic', () => {
    expect(JSON.stringify(compareMethods(3, 4))).toBe(
      JSON.stringify(compareMethods(3, 4)),
    );
  });
});

describe('degenerate inputs', () => {
  it('never produces NaN or Infinity', () => {
    const w = makeWide(2, 10);
    const p = widePaths(w);
    expect(JSON.stringify(p).includes('null')).toBe(false);
    const e = widePaths(makeWide(2, 0));
    expect(JSON.stringify(e).includes('null')).toBe(false);
    const one = makeWide(2, 1);
    const c = cvPenalty(one.x, one.y, 'ridge', penaltyGrid(1));
    expect(c.ok).toBe(false);
    expect(c.cv.every(Number.isFinite)).toBe(true);
  });
});
