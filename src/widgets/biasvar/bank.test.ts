import { describe, expect, it } from 'vitest';
import {
  buildBank,
  curveSummary,
  errorsAt,
  meanCurve,
  partsAt,
  shownCurve,
} from './bank';
import {
  decompose,
  errorsByDegree,
  fitPoly,
  gridPredictions,
  makeStream,
  trainingSet,
} from './fit';

const near = (a: number, b: number, rel = 1e-6) =>
  Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

describe('bank (moments) agrees with the direct computation', () => {
  const SEED = 100;
  const n = 20;
  const t0 = performance.now();
  const bank = buildBank(SEED, n);
  const ms20 = performance.now() - t0;
  const sets = (count: number, sd: number) =>
    Array.from({ length: count }, (_, r) => trainingSet(makeStream(SEED + r, n), n, sd));

  it('bias, variance and total match decompose() at several noise levels', () => {
    for (const sd of [0.5, 2, 4]) {
      const data = sets(200, sd);
      for (const d of [1, 3, 6, 11]) {
        const dec = decompose(
          data.map((s) => gridPredictions(fitPoly(s.x, s.y, d))),
          sd,
        );
        const p = partsAt(bank, d, sd);
        expect(near(p.bias2, dec.bias2)).toBe(true);
        expect(near(p.variance, dec.variance)).toBe(true);
        expect(near(p.total, dec.total)).toBe(true);
        const mc = meanCurve(bank, d, sd);
        for (let g = 0; g < mc.length; g += 37)
          expect(near(mc[g]!, dec.meanFitCurve[g]!)).toBe(true);
      }
    }
  });

  it('train and test curves match errorsByDegree() over 60 sets', () => {
    for (const sd of [0.5, 2, 4]) {
      const direct = errorsByDegree(sets(60, sd), sd, 12);
      const cs = curveSummary(bank, sd);
      expect(cs.bestDegree).toBe(direct.bestDegree);
      direct.degrees.forEach((d, i) => {
        expect(near(cs.train[i]!, direct.train[i]!)).toBe(true);
        expect(near(cs.test[i]!, direct.test[i]!)).toBe(true);
        expect(near(errorsAt(bank, d, sd).test, direct.test[i]!)).toBe(true);
      });
    }
  });

  it('a displayed fit matches fitPoly', () => {
    const s = sets(30, 2)[7]!;
    const direct = gridPredictions(fitPoly(s.x, s.y, 5));
    const shown = shownCurve(bank, 5, 2, 7);
    for (let g = 0; g < shown.length; g += 41)
      expect(near(shown[g]!, direct[g]!)).toBe(true);
  });

  it('caps the degree and stays finite at n = 10, and is fast enough at n = 200', () => {
    const small = buildBank(5, 10);
    expect(small.cap).toBe(9);
    for (let d = 1; d <= 9; d++) {
      const p = partsAt(small, d, 4);
      for (const v of [p.bias2, p.variance, p.total])
        expect(Number.isFinite(v)).toBe(true);
    }
    const t = performance.now();
    const big = buildBank(5, 200);
    const ms200 = performance.now() - t;
    expect(big.cap).toBe(12);
    expect(ms200).toBeLessThan(5000);
    console.info(`bank timing: n=20 ${ms20.toFixed(0)} ms, n=200 ${ms200.toFixed(0)} ms`);
  });
});
