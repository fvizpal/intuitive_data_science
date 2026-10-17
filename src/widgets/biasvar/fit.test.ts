import { describe, expect, it } from 'vitest';
import {
  BIG,
  OVERFIT_GAP_RATIO,
  UNDERFIT_GAP_RATIO,
  UNDERFIT_TRAIN_RATIO,
  belowNoiseFloor,
  decompose,
  defaultGrid,
  errorsByDegree,
  expectedError,
  fitPoly,
  fitReading,
  gridPredictions,
  makeStream,
  makeTrainingSets,
  pickDegrees,
  repetition,
  rmse,
  trainingSet,
  trueCurve,
  type Model,
} from './fit';

const report: Record<string, unknown> = {};
const near = (a: number, b: number, rel = 1e-9) =>
  Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

const sets = (seed: number, count: number, n: number, sd: number) =>
  makeTrainingSets(seed, count, 200).map((s) => trainingSet(s, n, sd));

describe('fitPoly', () => {
  it('recovers a known cubic from noiseless data exactly', () => {
    const cubic = (h: number) => 3 - 0.5 * h + 0.07 * h * h - 0.002 * h ** 3;
    const xs = Array.from({ length: 25 }, (_, i) => (i * 24) / 24);
    const m = fitPoly(xs, xs.map(cubic), 3);
    for (const h of [0, 1.3, 7, 12.5, 23.9, 24])
      expect(Math.abs(m.predict(h) - cubic(h))).toBeLessThan(1e-8);
  });
  it('stays stable at degree 12 on 40 noiseless points of a smooth function', () => {
    const xs = Array.from({ length: 40 }, (_, i) => (i * 24) / 39);
    const m = fitPoly(xs, xs.map(trueCurve), 12);
    let worst = 0;
    for (let h = 0; h <= 24; h += 0.25)
      worst = Math.max(worst, Math.abs(m.predict(h) - trueCurve(h)));
    expect(worst).toBeLessThan(1e-6);
  });
  it('training RMSE never rises with degree; degree n - 1 interpolates', () => {
    const s = sets(11, 1, 30, 2)[0]!;
    let prev = Infinity;
    for (let d = 1; d <= 12; d++) {
      const e = rmse(fitPoly(s.x, s.y, d), s.x, s.y);
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
    const t = sets(5, 1, 10, 2)[0]!;
    const m = fitPoly(t.x, t.y, 9);
    expect(rmse(m, t.x, t.y)).toBeLessThan(1e-6);
  });
  it('caps the degree and survives degenerate input', () => {
    const t = sets(5, 1, 10, 2)[0]!;
    const m = fitPoly(t.x, t.y, 12);
    expect(m.degree).toBe(9);
    expect(m.capped).toBe(true);
    expect(fitPoly(t.x, t.y, 9).capped).toBe(false);
    const dup = fitPoly([3, 3, 3, 7, 7], [1, 2, 3, 4, 5], 3);
    const flat = fitPoly([5, 5, 5, 5], [1, 2, 3, 4], 3);
    for (const mod of [dup, flat]) {
      for (const h of [0, 5, 24, 100, -50])
        expect(Number.isFinite(mod.predict(h))).toBe(true);
    }
    expect(flat.degree).toBe(0);
    expect(flat.predict(5)).toBeCloseTo(2.5, 12);
    expect(Number.isFinite(fitPoly([], [], 3).predict(1))).toBe(true);
  });
});

describe('noise floor', () => {
  it('expected error is never below the noise sd', () => {
    for (const sd of [0.5, 2, 4]) {
      for (const s of sets(3, 20, 15, sd)) {
        for (let d = 1; d <= 12; d++) {
          expect(expectedError(fitPoly(s.x, s.y, d), sd)).toBeGreaterThanOrEqual(
            sd - 1e-12,
          );
        }
      }
    }
  });
  it('the true curve as a fit gives exactly the noise sd', () => {
    const truth: Model = {
      degree: 0,
      requested: 0,
      capped: false,
      coef: new Float64Array(1),
      predict: trueCurve,
    };
    expect(expectedError(truth, 2)).toBe(2);
    expect(expectedError(truth, 0.5)).toBe(0.5);
  });
});

describe('decomposition identity', () => {
  it('bias2 + variance = mean squared gap; total = mean squared expected error', () => {
    const R = 200;
    const data = sets(100, R, 20, 2);
    const { f } = defaultGrid();
    for (const d of [1, 3, 6, 11]) {
      const models = data.map((s) => fitPoly(s.x, s.y, d));
      const fits = models.map(gridPredictions);
      const dec = decompose(fits, 2);
      let mean = 0;
      for (const fit of fits)
        for (let g = 0; g < f.length; g++) mean += (f[g]! - fit[g]!) ** 2;
      mean /= R * f.length;
      expect(near(dec.bias2 + dec.variance, mean)).toBe(true);
      let tot = 0;
      for (const m of models) tot += expectedError(m, 2) ** 2;
      tot /= R;
      expect(near(dec.total, tot)).toBe(true);
      report[`decomp d${d}`] = {
        bias2: +dec.bias2.toFixed(3),
        variance: +dec.variance.toFixed(3),
        total: +dec.total.toFixed(3),
      };
    }
  });
  it('has the expected shapes (n = 20, noise 2, 200 sets)', () => {
    const data = sets(100, 200, 20, 2);
    const dec = (d: number) =>
      decompose(
        data.map((s) => gridPredictions(fitPoly(s.x, s.y, d))),
        2,
      );
    const d1 = dec(1);
    const d3 = dec(3);
    const d5 = dec(5);
    const d10 = dec(10);
    report.shapes = {
      bias2_d1: d1.bias2,
      bias2_d5: d5.bias2,
      var_d3: d3.variance,
      var_d10: d10.variance,
    };
    expect(d1.bias2).toBeGreaterThanOrEqual(3 * d5.bias2);
    expect(d10.variance).toBeGreaterThanOrEqual(5 * d3.variance);
  });
});

describe('training error theory', () => {
  it('matches sigma^2 (n - p) / n at degree 10, memorizes at 12, stays above 1.4 at 5', () => {
    const data = sets(500, 400, 20, 2);
    const mse = (d: number) => {
      let s = 0;
      for (const t of data) {
        const e = rmse(fitPoly(t.x, t.y, d), t.x, t.y);
        s += e * e;
      }
      return s / data.length;
    };
    const m10 = mse(10);
    const m12 = mse(12);
    const m5 = mse(5);
    report.trainMse = {
      d10: m10,
      theory: 1.8,
      d12rmse: Math.sqrt(m12),
      d5rmse: Math.sqrt(m5),
    };
    expect(Math.abs(m10 - 1.8) / 1.8).toBeLessThan(0.1);
    expect(Math.sqrt(m12)).toBeLessThan(2);
    expect(Math.sqrt(m5)).toBeGreaterThan(1.4);
  });
});

describe('the U shape', () => {
  it('has a sweet spot in the middle, and moves with data and noise', () => {
    const e20 = errorsByDegree(sets(1000, 100, 20, 2), 2, 12);
    expect(e20.bestDegree).toBeGreaterThanOrEqual(3);
    expect(e20.bestDegree).toBeLessThanOrEqual(7);
    const best = Math.min(...e20.test);
    expect(e20.test[11]!).toBeGreaterThanOrEqual(1.25 * best);
    expect(e20.train[11]!).toBeLessThan(e20.train[0]!);
    const e200 = errorsByDegree(sets(1000, 100, 200, 2), 2, 12);
    expect(e200.bestDegree).toBeGreaterThanOrEqual(e20.bestDegree);
    const lo = errorsByDegree(sets(2000, 100, 50, 0.5), 0.5, 12);
    const hi = errorsByDegree(sets(2000, 100, 50, 4), 4, 12);
    expect(hi.bestDegree).toBeLessThanOrEqual(lo.bestDegree);
    const e50 = errorsByDegree(sets(1000, 100, 50, 2), 2, 12);
    expect(Math.abs(e200.test[0]! - e50.test[0]!) / e50.test[0]!).toBeLessThan(0.15);
    report.bestDegrees = {
      n20: e20.bestDegree,
      n50: e50.bestDegree,
      n200: e200.bestDegree,
      noise0_5_n50: lo.bestDegree,
      noise2_n50: e50.bestDegree,
      noise4_n50: hi.bestDegree,
      n20_noise0_5: errorsByDegree(sets(1000, 100, 20, 0.5), 0.5, 12).bestDegree,
      n20_noise4: errorsByDegree(sets(1000, 100, 20, 4), 4, 12).bestDegree,
      test20: e20.test.map((v) => +v.toFixed(2)),
      train20: e20.train.map((v) => +v.toFixed(2)),
    };
  });
});

describe('pickDegrees', () => {
  it('training error picks the wiggliest curve; held-back error does better', () => {
    const r = pickDegrees(7, 50);
    const top = r.maxDegree;
    const share = r.trainPicks.filter((d) => d === top).length / 50;
    expect(share).toBeGreaterThanOrEqual(0.98);
    expect(r.validMedian).toBeLessThanOrEqual(r.trainMedian / 1.5);
    expect(pickDegrees(7, 50).validPicks).toEqual(r.validPicks);
    expect(pickDegrees(8, 50).validPicks).not.toEqual(r.validPicks);
    report.picker = {
      trainMedian: r.trainMedian,
      validMedian: r.validMedian,
      validRange: [Math.min(...r.validPicks), Math.max(...r.validPicks)],
      validHist: r.validHistogram,
    };
    for (const share2 of [0.1, 0.5]) {
      const q = pickDegrees(7, 50, { validationShare: share2 });
      report[`picker share ${share2}`] = {
        trainMedian: q.trainMedian,
        validMedian: q.validMedian,
        range: [Math.min(...q.validPicks), Math.max(...q.validPicks)],
      };
      expect(q.validMedian).toBeLessThan(q.trainMedian);
    }
  });
  it('splits sensibly', () => {
    const r = repetition(1, 0);
    expect(r.train.x.length + r.held.x.length).toBe(40);
    expect(r.held.x.length).toBe(10);
  });
});

describe('common random numbers', () => {
  it('first 10 points are a prefix of the first 20, and noise rescales the same draws', () => {
    const s = makeStream(9);
    const a = trainingSet(s, 10, 2);
    const b = trainingSet(s, 20, 2);
    const byIndex = new Map(b.index.map((idx, i) => [idx, { x: b.x[i]!, y: b.y[i]! }]));
    a.index.forEach((idx, i) => {
      expect(byIndex.get(idx)!.x).toBe(a.x[i]);
      expect(byIndex.get(idx)!.y).toBe(a.y[i]);
    });
    const c = trainingSet(s, 20, 4);
    b.index.forEach((idx, i) => {
      const f = trueCurve(b.x[i]!);
      expect(near((c.y[i]! - f) / 4, (b.y[i]! - f) / 2, 1e-12)).toBe(true);
      expect(idx).toBe(c.index[i]);
    });
  });
  it('is deterministic per seed', () => {
    expect(makeStream(3)).toEqual(makeStream(3));
    expect(makeStream(3).x).not.toEqual(makeStream(4).x);
    expect(makeTrainingSets(3, 4)).toEqual(makeTrainingSets(3, 4));
    expect(repetition(2, 3).trainPick).toBe(repetition(2, 3).trainPick);
  });
});

describe('plain readings', () => {
  it('returns each label and flags memorizing', () => {
    expect(fitReading({ train: 4.3, test: 4.6, noise: 2 })).toBe('underfit');
    expect(fitReading({ train: 1.9, test: 2.4, noise: 2 })).toBe('good fit');
    expect(fitReading({ train: 1.0, test: 5, noise: 2 })).toBe('overfit');
    expect(belowNoiseFloor(1.2, 2)).toBe(true);
    expect(belowNoiseFloor(2, 2)).toBe(false);
    expect(belowNoiseFloor(2.01, 2)).toBe(false);
  });
  it('is calibrated for n = 20, noise 2', () => {
    const ds = sets(3000, 200, 20, 2);
    const share: Record<number, Record<string, number>> = {};
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const c: Record<string, number> = { underfit: 0, 'good fit': 0, overfit: 0 };
      for (const t of ds) {
        const m = fitPoly(t.x, t.y, d);
        const lab = fitReading({
          train: rmse(m, t.x, t.y),
          test: expectedError(m, 2),
          noise: 2,
        });
        c[lab] = c[lab]! + 1;
      }
      share[d] = c;
    }
    report.readingShares = share;
    report.readingConstants = {
      UNDERFIT_TRAIN_RATIO,
      UNDERFIT_GAP_RATIO,
      OVERFIT_GAP_RATIO,
    };
    const majority = (d: number, lab: string) => share[d]![lab]! / ds.length;
    for (const d of [1, 2]) expect(majority(d, 'underfit')).toBeGreaterThan(0.6);
    for (const d of [4, 5, 6]) expect(majority(d, 'good fit')).toBeGreaterThan(0.5);
    for (const d of [9, 10, 11, 12]) expect(majority(d, 'overfit')).toBeGreaterThan(0.75);
  });
});

describe('never NaN or Infinity', () => {
  it('holds for degree 12 on 10 points and large extrapolations', () => {
    for (let seed = 1; seed < 30; seed++) {
      const t = trainingSet(makeStream(seed), 10, 4);
      const m = fitPoly(t.x, t.y, 12);
      expect(Number.isFinite(rmse(m, t.x, t.y))).toBe(true);
      expect(Number.isFinite(expectedError(m, 4))).toBe(true);
      for (const h of [-1e6, -100, 0, 24, 1e3, 1e9]) {
        const v = m.predict(h);
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(BIG);
      }
    }
    const dec = decompose([gridPredictions(fitPoly([0, 1], [1, 2], 1))], 2);
    expect(Number.isFinite(dec.total)).toBe(true);
  });
});

describe('report', () => {
  it('prints the numbers', () => {
    console.log(JSON.stringify(report));
  });
});
