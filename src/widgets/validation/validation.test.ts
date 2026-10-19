import { describe, expect, it } from 'vitest';
import { expectedError, fitPoly } from '../biasvar/fit';
import { mulberry32, normal } from '../../lib/random';
import {
  BILL_BIG,
  bestDegree,
  billErrorsByDegree,
  billFit,
  binomialCdfTable,
  binomialQuantile,
  cvByDegree,
  cvPicks,
  cvPoly,
  exactMaxAccuracy,
  kFoldIndices,
  makeBills,
  mean,
  median,
  observed,
  optimismOfSelection,
  pickByMethod,
  pressRmse,
  probBestAtLeast,
  realErrorByDegree,
  realNextYearError,
  sd,
  simulateWinners,
  singleRun,
  singleSplitByDegree,
  splitIndices,
  temperaturePool,
  validationSplitByMethod,
  winnerUniforms,
} from './validation';

const log = (...a: unknown[]) => console.log('[report]', ...a);
const finite = (v: number) => Number.isFinite(v);

describe('splitIndices', () => {
  it('gives 36/12/12 for n = 60, disjoint and covering', () => {
    const s = splitIndices(60, { train: 0.6, val: 0.2, test: 0.2 }, 3);
    expect([s.train.length, s.val.length, s.test.length]).toEqual([36, 12, 12]);
    const all = [...s.train, ...s.val, ...s.test].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });
  it('is deterministic per seed and changes with it', () => {
    const sh = { train: 0.7, val: 0.15, test: 0.15 };
    expect(splitIndices(60, sh, 5)).toEqual(splitIndices(60, sh, 5));
    expect(splitIndices(60, sh, 5)).not.toEqual(splitIndices(60, sh, 6));
  });
  it('gives tiny shares at least 2 points and still covers', () => {
    const s = splitIndices(30, { train: 0.96, val: 0.02, test: 0.02 }, 1);
    expect(s.val.length).toBeGreaterThanOrEqual(2);
    expect(s.test.length).toBeGreaterThanOrEqual(2);
    expect(s.train.length + s.val.length + s.test.length).toBe(30);
  });
  it('handles every preset at every pool size', () => {
    for (const n of [30, 60, 120])
      for (const sh of [
        { train: 60, val: 20, test: 20 },
        { train: 70, val: 15, test: 15 },
        { train: 80, val: 10, test: 10 },
      ]) {
        const s = splitIndices(n, sh, 2);
        expect(s.val.length).toBeGreaterThanOrEqual(2);
        expect(s.train.length + s.val.length + s.test.length).toBe(n);
      }
  });
});

describe('kFoldIndices', () => {
  it('puts each index in exactly one fold, sizes within 1', () => {
    for (const k of [2, 5, 10, 40]) {
      const folds = kFoldIndices(40, k, 9)!;
      expect(folds.length).toBe(k);
      expect(folds.flat().sort((a, b) => a - b)).toEqual(
        Array.from({ length: 40 }, (_, i) => i),
      );
      const sizes = folds.map((f) => f.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
    const odd = kFoldIndices(43, 5, 1)!;
    expect(
      Math.max(...odd.map((f) => f.length)) - Math.min(...odd.map((f) => f.length)),
    ).toBe(1);
  });
  it('k = n is leave-one-out; invalid k is null', () => {
    const f = kFoldIndices(30, 30, 1)!;
    expect(f.length).toBe(30);
    expect(f.every((x) => x.length === 1)).toBe(true);
    expect(kFoldIndices(30, 1, 1)).toBeNull();
    expect(kFoldIndices(30, 31, 1)).toBeNull();
    expect(kFoldIndices(30, 2.5, 1)).toBeNull();
  });
});

/** Independent reference: monomial design, normal equations by Gaussian elimination. */
function hatPress(xs: number[], ys: number[], degree: number): number {
  const n = xs.length;
  const p = degree + 1;
  const X = xs.map((x) => {
    const t = (2 * x) / 24 - 1;
    return Array.from({ length: p }, (_, j) => t ** j);
  });
  const A = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[i]! * r[j]!, 0)),
  );
  const inv = (M: number[][]): number[][] => {
    const m = M.length;
    const a = M.map((r, i) => [
      ...r,
      ...Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)),
    ]);
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++)
        if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
      [a[c], a[piv]] = [a[piv]!, a[c]!];
      const d = a[c]![c]!;
      for (let j = 0; j < 2 * m; j++) a[c]![j] = a[c]![j]! / d;
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const f = a[r]![c]!;
        for (let j = 0; j < 2 * m; j++) a[r]![j] = a[r]![j]! - f * a[c]![j]!;
      }
    }
    return a.map((r) => r.slice(m));
  };
  const Ai = inv(A);
  const Xty = Array.from({ length: p }, (_, j) =>
    X.reduce((s, r, i) => s + r[j]! * ys[i]!, 0),
  );
  const beta = Ai.map((r) => r.reduce((s, v, j) => s + v * Xty[j]!, 0));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const fit = X[i]!.reduce((a, v, j) => a + v * beta[j]!, 0);
    const h = X[i]!.reduce(
      (a, v, j) => a + v * Ai[j]!.reduce((b, w, k) => b + w * X[i]![k]!, 0),
      0,
    );
    const e = (ys[i]! - fit) / (1 - h);
    s += e * e;
  }
  return Math.sqrt(s / n);
}

describe('leave-one-out against the hat-matrix identity', () => {
  it('matches PRESS within 1e-7 for degrees 1..6 on 30 random points', () => {
    const pool = temperaturePool(77, 30);
    const folds = kFoldIndices(30, 30, 1)!;
    for (let d = 1; d <= 6; d++) {
      const brute = cvPoly(pool.x, pool.y, d, folds)!.pooledRmse;
      expect(Math.abs(brute - hatPress(pool.x, pool.y, d))).toBeLessThan(1e-7);
      expect(Math.abs(brute - pressRmse(pool.x, pool.y, d)!)).toBeLessThan(1e-12);
    }
  });
});

describe('cvPoly', () => {
  it('pooled RMSE is the root of the mean squared error over all points, each once', () => {
    const pool = temperaturePool(5, 40);
    const folds = kFoldIndices(40, 5, 2)!;
    const r = cvPoly(pool.x, pool.y, 3, folds)!;
    const seen = r.perFold.flatMap((f) => f.indices).sort((a, b) => a - b);
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => i));
    const sq = r.perFold.reduce((s, f) => s + f.rmse ** 2 * f.indices.length, 0) / 40;
    expect(Math.abs(Math.sqrt(sq) - r.pooledRmse)).toBeLessThan(1e-9);
  });
  it('reports a capped degree and returns null for empty input', () => {
    const pool = temperaturePool(5, 6);
    expect(cvPoly(pool.x, pool.y, 12, kFoldIndices(6, 3, 1)!)!.capped).toBe(true);
    expect(cvPoly([], [], 2, [])).toBeNull();
    expect(bestDegree([])).toBeNull();
    expect(bestDegree([3, 1, 1, 2])).toBe(2);
  });
});

describe('cross-validation versus reality', () => {
  it('5-fold CV MSE at degree 3 tracks the exact MSE of fits on 32 points (n = 40)', () => {
    let cv = 0;
    let real = 0;
    const pools = 200;
    for (let r = 0; r < pools; r++) {
      const pool = temperaturePool(1000 + r, 40);
      const folds = kFoldIndices(40, 5, r + 1)!;
      const res = cvPoly(pool.x, pool.y, 3, folds)!;
      cv += res.pooledRmse ** 2;
      for (const held of folds) {
        const hs = new Set(held);
        const idx = [...Array(40).keys()].filter((i) => !hs.has(i));
        const m = fitPoly(
          idx.map((i) => pool.x[i]!),
          idx.map((i) => pool.y[i]!),
          3,
        );
        real += expectedError(m, 2) ** 2 / folds.length;
      }
    }
    cv /= pools;
    real /= pools;
    log(
      'CV MSE',
      cv.toFixed(3),
      'exact MSE (32 pts)',
      real.toFixed(3),
      'ratio',
      (cv / real).toFixed(3),
    );
    expect(Math.abs(cv / real - 1)).toBeLessThan(0.15);
  });
});

describe('which method picks the degree better', () => {
  const res = cvPicks(11, 200, 40);
  it('reports and bounds the picks', () => {
    const m = (x: number[]) => mean(x);
    log(
      'mean best degree single/5/10:',
      m(res.single.picks).toFixed(2),
      m(res.k5.picks).toFixed(2),
      m(res.k10.picks).toFixed(2),
    );
    log(
      'sd of picks single/5/10:',
      sd(res.single.picks).toFixed(2),
      sd(res.k5.picks).toFixed(2),
      sd(res.k10.picks).toFixed(2),
    );
    log(
      'median real error single/5/10:',
      median(res.single.errors).toFixed(3),
      median(res.k5.errors).toFixed(3),
      median(res.k10.errors).toFixed(3),
    );
    expect(m(res.k10.picks)).toBeGreaterThanOrEqual(3);
    expect(m(res.k10.picks)).toBeLessThanOrEqual(7);
    expect(sd(res.k10.picks)).toBeLessThanOrEqual(sd(res.single.picks));
    expect(median(res.k10.errors)).toBeLessThanOrEqual(1.02 * median(res.single.errors));
  });
  it('is deterministic per seed', () => {
    expect(cvPicks(11, 5, 40).k5.picks).toEqual(cvPicks(11, 5, 40).k5.picks);
  });
  it('cvByDegree and singleSplitByDegree and realErrorByDegree are finite', () => {
    const pool = temperaturePool(3, 40);
    for (const v of [
      ...cvByDegree(pool.x, pool.y, kFoldIndices(40, 40, 1)!, 12),
      ...singleSplitByDegree(pool.x, pool.y, 0.25, 1, 12),
      ...realErrorByDegree(pool.x, pool.y, 2, 12),
    ])
      expect(finite(v)).toBe(true);
  });
});

describe('exact winner’s curse', () => {
  it('matches the known values', () => {
    expect(Math.abs(exactMaxAccuracy(100, 1) - 0.5)).toBeLessThan(1e-12);
    const a = exactMaxAccuracy(100, 50);
    const b = exactMaxAccuracy(500, 50);
    const c = exactMaxAccuracy(2000, 50);
    log(
      'exactMaxAccuracy (100,1)',
      exactMaxAccuracy(100, 1),
      '(100,50)',
      a,
      '(500,50)',
      b,
      '(2000,50)',
      c,
    );
    expect(a).toBeGreaterThan(0.605);
    expect(a).toBeLessThan(0.63);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0.5);
    let prev = 0;
    for (const K of [1, 2, 5, 10, 50, 200]) {
      const v = exactMaxAccuracy(100, K);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    const p = probBestAtLeast(100, 50, 0.6);
    log('P(best of 50 >= 60%) =', p);
    expect(p).toBeGreaterThan(0.5);
  });
  it('cdf table ends at 1 and quantile inverts it', () => {
    const t = binomialCdfTable(100);
    expect(t[100]).toBe(1);
    expect(binomialQuantile(0.5, t)).toBeGreaterThanOrEqual(49);
    expect(binomialQuantile(0.5, t)).toBeLessThanOrEqual(50);
    expect(binomialQuantile(1e-12, t)).toBeLessThan(50);
  });
});

describe('simulateWinners', () => {
  it('agrees with theory at m = 100, K = 50', () => {
    const w = simulateWinners(1, 100, 50, 4000);
    const th = exactMaxAccuracy(100, 50);
    log(
      'simulated mean best',
      mean(w.best).toFixed(4),
      'theory',
      th.toFixed(4),
      'mean fresh',
      mean(w.fresh).toFixed(4),
    );
    expect(Math.abs(mean(w.best) - th)).toBeLessThan(0.01);
    expect(Math.abs(mean(w.fresh) - 0.5)).toBeLessThan(0.01);
  });
  it('is deterministic; K = 1 gives 0.5 and 0.5', () => {
    expect(simulateWinners(2, 100, 50, 50).best).toEqual(
      simulateWinners(2, 100, 50, 50).best,
    );
    const w = simulateWinners(3, 100, 1, 4000);
    expect(Math.abs(mean(w.best) - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(mean(w.fresh) - 0.5)).toBeLessThan(0.01);
  });
  it('uses common random numbers: fewer models are a prefix of more', () => {
    const a = winnerUniforms(4, 10, 20);
    const b = winnerUniforms(4, 30, 20);
    for (let t = 0; t < 20; t++)
      for (let k = 0; k < 10; k++) expect(a.u[t * 10 + k]).toBe(b.u[t * 30 + k]);
    expect(Array.from(a.v)).toEqual(Array.from(b.v));
    const more = simulateWinners(4, 100, 30, 200).best;
    const fewer = simulateWinners(4, 100, 10, 200).best;
    for (let t = 0; t < 200; t++) expect(more[t]!).toBeGreaterThanOrEqual(fewer[t]!);
  });
  it('singleRun picks the top score', () => {
    const r = singleRun(5, 100, 50);
    expect(r.scores.length).toBe(50);
    expect(r.scores[r.winner]).toBe(Math.max(...r.scores));
  });
});

describe('optimism of selection', () => {
  it('validation MSE of the pick is below the test MSE of that same model', () => {
    const o = optimismOfSelection(21, 300);
    log(
      'mean validation MSE of pick',
      mean(o.valMse).toFixed(3),
      'mean test MSE of pick',
      mean(o.testMse).toFixed(3),
    );
    expect(mean(o.valMse)).toBeLessThan(mean(o.testMse));
  });
});

describe('random split versus the future', () => {
  const picks = pickByMethod(31, 100);
  it('random picks a higher degree and costs far more next year', () => {
    log(
      'mean pick random/future',
      mean(picks.random.picks).toFixed(2),
      mean(picks.future.picks).toFixed(2),
    );
    log(
      'median next-year error random/future',
      median(picks.random.errors).toFixed(0),
      median(picks.future.errors).toFixed(0),
    );
    expect(mean(picks.random.picks) - mean(picks.future.picks)).toBeGreaterThanOrEqual(2);
    expect(median(picks.random.errors)).toBeGreaterThanOrEqual(
      2 * median(picks.future.errors),
    );
  });
  it('degree 1 is sensible and degree 8 blows up next year', () => {
    const pool = observed(makeBills(31));
    const r1 = realNextYearError(pool, 1);
    const r8 = realNextYearError(pool, 8);
    log(
      'next-year error degree 1:',
      r1.error.toFixed(0),
      'degree 8:',
      r8.error.toFixed(0),
    );
    expect(finite(r1.error)).toBe(true);
    expect(r1.error).toBeLessThan(1000);
    expect(Math.abs(r1.error / Math.sqrt(80 ** 2 + 300 ** 2 / 2) - 1)).toBeLessThan(0.4);
    expect(r8.error).toBeGreaterThan(3 * r1.error);
  });
  it('at degree 8 the random split looks better than the future split', () => {
    let better = 0;
    const reps = 100;
    for (let r = 0; r < reps; r++) {
      const pool = observed(makeBills(500 + r));
      const a = validationSplitByMethod(pool, 'random', 8, r + 1);
      const b = validationSplitByMethod(pool, 'future', 8, r + 1);
      if (a < b) better++;
    }
    log('random < future validation error at degree 8 in', better, 'of', reps);
    expect(better / reps).toBeGreaterThanOrEqual(0.9);
  });
});

describe('bill data', () => {
  it('is deterministic and noise rescales the same z', () => {
    expect(Array.from(makeBills(3).z)).toEqual(Array.from(makeBills(3).z));
    const b = makeBills(3);
    const a80 = observed(b, 48, 80);
    const a40 = observed(b, 48, 40);
    for (let i = 0; i < 48; i++) {
      const truth = 1500 + 12 * i + 300 * Math.sin((2 * Math.PI * (i - 4)) / 12);
      expect((a80.y[i]! - truth) / 80).toBeCloseTo((a40.y[i]! - truth) / 40, 9);
    }
  });
  it('observed(…, 48) is a prefix of the 60-month series', () => {
    const b = makeBills(8);
    const all = observed(b, 60);
    const part = observed(b, 48);
    expect(all.y.slice(0, 48)).toEqual(part.y);
    expect(all.y.length).toBe(60);
  });
});

describe('no NaN or Infinity', () => {
  it('stays finite for extrapolation at every degree and method', () => {
    const pool = observed(makeBills(13));
    const curves = [
      billErrorsByDegree(pool, 'random', 1),
      billErrorsByDegree(pool, 'future', 1),
    ];
    for (const c of curves)
      for (const v of [...c.validation, ...c.real]) {
        expect(finite(v)).toBe(true);
        expect(v).toBeLessThan(BILL_BIG * 10);
      }
    expect(billFit({ t: [], y: [] }, 'random', 3, 1)).toBeNull();
    expect(realNextYearError({ t: [], y: [] }, 3).error).toBe(80);
  });
  it('handles empty and tiny inputs without throwing', () => {
    expect(singleSplitByDegree([], [], 0.25, 1, 5)).toEqual([]);
    expect(realErrorByDegree([], [], 2, 3).every(finite)).toBe(true);
    expect(pressRmse([1], [1], 1)).toBeNull();
    expect(exactMaxAccuracy(0, 0)).toBe(0.5);
    const rng = mulberry32(1);
    const noisy = Array.from({ length: 12 }, () => normal(rng));
    expect(
      finite(
        cvPoly(
          noisy.map((_, i) => i * 2),
          noisy,
          12,
          kFoldIndices(12, 12, 1)!,
        )!.pooledRmse,
      ),
    ).toBe(true);
  });
});
