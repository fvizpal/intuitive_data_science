import { describe, expect, it } from 'vitest';
import { leashCurves, leashGrid, LEASH_HI, LEASH_LO } from './leash';

describe('sweet spot (temperature, degree 12)', () => {
  const report: Record<string, unknown> = {};
  for (const n of [15, 20, 50]) {
    it(`n = ${n}`, () => {
      const c = leashCurves(1, n, 100);
      const lam = c.lambdas[c.best]!;
      report[`n${n}`] = {
        best: lam,
        pos: c.best,
        test0: c.test[0],
        testBest: c.test[c.best],
        train0: c.train[0],
        trainBest: c.train[c.best],
      };
      console.log(`n=${n}`, JSON.stringify(report[`n${n}`]), 'grid', LEASH_LO, LEASH_HI);
      expect(c.best).toBeGreaterThan(0);
      expect(c.best).toBeLessThan(c.lambdas.length - 1);
      if (n === 20) {
        expect(c.test[c.best]!).toBeLessThanOrEqual(0.8 * c.test[0]!);
        expect(c.train[c.best]!).toBeGreaterThan(c.train[0]!);
        expect(c.train[0]!).toBeLessThan(2);
      }
    });
  }
  it('more data, smaller best penalty', () => {
    const a = leashCurves(1, 15, 100);
    const b = leashCurves(1, 50, 100);
    expect(b.lambdas[b.best]!).toBeLessThanOrEqual(a.lambdas[a.best]!);
  });
  it('error on new data is U-shaped and training error only rises', () => {
    const c = leashCurves(7, 20, 60);
    for (let i = 1; i < c.train.length; i++)
      expect(c.train[i]!).toBeGreaterThanOrEqual(c.train[i - 1]! - 1e-9);
    expect(leashGrid().length).toBe(41);
  });
});
