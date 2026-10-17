import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../lib/random';
import {
  bestByAccuracy,
  bestByCost,
  bestByF1,
  calibratedRisk,
  closedFormBest,
  confusion,
  costOf,
  costPer1000,
  costRuleThreshold,
  curveByThreshold,
  makeMail,
  makeStream,
  metrics,
  naturalFrequencies,
  precisionAt,
  theoryBest,
  theoryMetrics,
} from './threshold';

const S = [10, 20, 30, 40, 50, 60, 70, 80];
const L = [0, 0, 0, 1, 0, 1, 1, 1];

describe('hand-checked 8-point example', () => {
  it('t = 45', () => {
    const c = confusion(S, L, 45);
    expect(c).toEqual({ tp: 3, fp: 1, fn: 1, tn: 3 });
    const m = metrics(c);
    expect(m.precision).toBe(0.75);
    expect(m.recall).toBe(0.75);
    expect(m.accuracy).toBe(0.75);
    expect(m.f1).toBeCloseTo(0.75, 10);
    expect(m.falseAlarmRate).toBe(0.25);
  });
  it('t = 55', () => {
    const c = confusion(S, L, 55);
    expect(c).toEqual({ tp: 3, fp: 0, fn: 1, tn: 4 });
    const m = metrics(c);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0.75);
    expect(m.accuracy).toBe(0.875);
    expect(m.f1).toBeCloseTo(0.857143, 6);
  });
});

describe('boundaries', () => {
  it('flags a score exactly equal to the cutoff', () => {
    expect(confusion(S, L, 40).tp).toBe(4);
    expect(confusion(S, L, 40.0001).tp).toBe(3);
  });
  it('flags nothing above the maximum', () => {
    const m = metrics(confusion(S, L, 81));
    expect(m.precision).toBeNull();
    expect(m.recall).toBe(0);
    expect(m.accuracy).toBe(0.5);
    expect(m.flagged).toBe(0);
  });
  it('flags everything at 0', () => {
    expect(metrics(confusion(S, L, 0)).recall).toBe(1);
  });
  it('handles empty groups and f1 = 0', () => {
    expect(metrics({ tp: 0, fn: 0, fp: 3, tn: 2 }).recall).toBeNull();
    expect(metrics({ tp: 0, fn: 0, fp: 3, tn: 2 }).f1).toBeNull();
    expect(metrics({ tp: 0, fn: 2, fp: 3, tn: 0 }).f1).toBe(0);
    expect(metrics({ tp: 1, fn: 0, fp: 0, tn: 0 }).falseAlarmRate).toBeNull();
    expect(metrics({ tp: 0, fn: 0, fp: 0, tn: 0 }).accuracy).toBeNull();
  });
});

describe('monotone counts', () => {
  const { scores, labels } = makeMail(3, 2000, 0.1);
  const curve = curveByThreshold(scores, labels);
  it('counts sum to n and accuracy = (tp + tn) / n', () => {
    for (const r of curve) {
      expect(r.tp + r.fn + r.fp + r.tn).toBe(2000);
      expect(metrics(r).accuracy).toBe((r.tp + r.tn) / 2000);
    }
  });
  it('flagged, recall and false alarm rate never increase with the cutoff', () => {
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1]!;
      const b = curve[i]!;
      expect(b.tp + b.fp).toBeLessThanOrEqual(a.tp + a.fp);
      expect(metrics(b).recall!).toBeLessThanOrEqual(metrics(a).recall!);
      expect(metrics(b).falseAlarmRate!).toBeLessThanOrEqual(metrics(a).falseAlarmRate!);
    }
  });
  it('curveByThreshold equals confusion() everywhere', () => {
    for (const r of curve) {
      expect({ tp: r.tp, fn: r.fn, fp: r.fp, tn: r.tn }).toEqual(
        confusion(scores, labels, r.t),
      );
    }
  });
  it('cutoff 101 flags nothing and 0 flags everything', () => {
    expect(curve[101]!.tp + curve[101]!.fp).toBe(0);
    expect(curve[0]!.tn + curve[0]!.fn).toBe(0);
  });
});

describe('theory at 10% spam', () => {
  it('cutoff 50', () => {
    const m = theoryMetrics(50, 0.1);
    console.log('THEORY t=50', m);
    expect(m.recall).toBeCloseTo(0.8413, 3);
    expect(m.falseAlarmRate).toBeCloseTo(0.1587, 3);
    expect(m.precision!).toBeCloseTo(0.3708, 3);
    expect(m.accuracy).toBeCloseTo(0.8413, 3);
    expect(Math.abs(m.f1! - 0.5147)).toBeLessThan(2e-3);
  });
  it('flag nothing scores 0.90', () => {
    expect(theoryMetrics(1000, 0.1).accuracy).toBeCloseTo(0.9, 6);
  });
  it('best F1 and best accuracy', () => {
    const f = theoryBest(0.1, {}, 'f1');
    const a = theoryBest(0.1, {}, 'accuracy');
    console.log(
      'BEST F1',
      f,
      'BEST ACC',
      a,
      'recall at best acc',
      theoryMetrics(a.threshold, 0.1).recall,
    );
    expect(f.threshold).toBeGreaterThan(58);
    expect(f.threshold).toBeLessThan(63);
    expect(f.value).toBeGreaterThan(0.6);
    expect(f.value).toBeLessThan(0.625);
    expect(a.threshold).toBeGreaterThan(65);
    expect(a.threshold).toBeLessThan(68);
    expect(a.value).toBeGreaterThan(0.925);
    expect(a.value).toBeLessThan(0.935);
    expect(theoryMetrics(a.threshold, 0.1).recall).toBeLessThan(0.5);
  });
});

describe('sample vs theory', () => {
  it('n = 20000, t = 50', () => {
    const { scores, labels } = makeMail(11, 20000, 0.1);
    const m = metrics(confusion(scores, labels, 50));
    expect(Math.abs(m.recall! - 0.8413)).toBeLessThan(0.02);
    expect(Math.abs(m.precision! - 0.3708)).toBeLessThan(0.03);
  });
});

describe('rare events', () => {
  it('precisionAt', () => {
    expect(precisionAt(0.04, 0.9, 0.05)!).toBeCloseTo(0.4286, 4);
    expect(precisionAt(0.5, 0.9, 0.05)!).toBeCloseTo(0.9474, 4);
    expect(precisionAt(0.01, 0.9, 0.05)!).toBeCloseTo(0.1538, 4);
    let prev = 0;
    for (let p = 0.01; p <= 0.5; p += 0.01) {
      const v = precisionAt(p, 0.9, 0.05)!;
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
  it('naturalFrequencies', () => {
    const f = naturalFrequencies({
      n: 1000,
      prevalence: 0.04,
      recall: 0.9,
      falseAlarmRate: 0.05,
    });
    expect(f.spam).toBeCloseTo(40, 9);
    expect(f.caught).toBeCloseTo(36, 9);
    expect(f.missed).toBeCloseTo(4, 9);
    expect(f.falseAlarms).toBeCloseTo(48, 9);
    expect(f.passed).toBeCloseTo(912, 9);
    expect(f.flagged).toBeCloseTo(84, 9);
    expect(f.precision!).toBeCloseTo(0.4286, 4);
    expect(f.accuracy).toBeCloseTo(0.948, 9);
    expect(f.dots).toEqual({ caught: 36, missed: 4, falseAlarms: 48, passed: 912 });
  });
  it('dots sum to exactly n for random inputs', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const f = naturalFrequencies({
        n: 1000,
        prevalence: 0.01 + 0.49 * rng(),
        recall: 0.5 + 0.49 * rng(),
        falseAlarmRate: 0.005 + 0.195 * rng(),
      });
      const d = f.dots;
      expect(d.caught + d.missed + d.falseAlarms + d.passed).toBe(1000);
      expect(Math.abs(d.caught - f.caught)).toBeLessThan(1);
    }
  });
  it('recall and false alarm rate ignore prevalence; precision does not', () => {
    const a = theoryMetrics(55, 0.02);
    const b = theoryMetrics(55, 0.4);
    expect(a.recall).toBe(b.recall);
    expect(a.falseAlarmRate).toBe(b.falseAlarmRate);
    expect(a.precision).not.toBe(b.precision);
  });
});

describe('cost theory', () => {
  const cases: [number, number][] = [
    [0.1, 1],
    [0.1, 5],
    [0.1, 0.01],
    [0.04, 1],
    [0.5, 1],
  ];
  it('closed form matches the grid optimum', () => {
    for (const [p, r] of cases) {
      const cf = closedFormBest(p, r);
      const grid = theoryBest(p, {}, { costFP: r });
      console.log('COST CASE', {
        prevalence: p,
        ratio: r,
        closedForm: cf,
        grid: grid.threshold,
        minCost: grid.value,
      });
      expect(Math.abs(cf - grid.threshold)).toBeLessThan(0.2);
    }
  });
  it('equal costs: best cost threshold = best accuracy threshold', () => {
    const c = theoryBest(0.1, {}, { costFP: 1 });
    const a = theoryBest(0.1, {}, 'accuracy');
    expect(Math.abs(c.threshold - a.threshold)).toBeLessThan(0.2);
  });
  it('best threshold rises with the ratio and falls with prevalence', () => {
    const ts = [0.01, 0.1, 1, 5, 100].map(
      (r) => theoryBest(0.1, {}, { costFP: r }).threshold,
    );
    for (let i = 1; i < ts.length; i++) expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
    const ps = [0.02, 0.1, 0.3, 0.5].map(
      (p) => theoryBest(p, {}, { costFP: 1 }).threshold,
    );
    for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeLessThan(ps[i - 1]!);
  });
  it('the minimum beats both trivial rules', () => {
    const hi = theoryBest(0.1, {}, { costFP: 5 });
    const lo = theoryBest(0.1, {}, { costFP: 0.01 });
    console.log('MIN COST ratio 5', hi.value, 'ratio 0.01', lo.value);
    expect(hi.value).toBeLessThan(0.1);
    expect(hi.value).toBeCloseTo(0.09, 2);
    expect(lo.value).toBeLessThan(0.009);
    expect(lo.value).toBeCloseTo(0.0066, 3);
  });
});

describe('sample cost', () => {
  it('closed form lands within 5% of the sample minimum', () => {
    const { scores, labels } = makeMail(2, 20000, 0.1);
    const curve = curveByThreshold(scores, labels);
    const costs = { costFP: 5 };
    const best = bestByCost(curve, costs)!;
    const at = curve[Math.round(closedFormBest(0.1, 5))]!;
    expect(costOf(at, costs)).toBeLessThanOrEqual(
      costOf(curve[best.threshold]!, costs) * 1.05,
    );
    expect(costPer1000(at, costs, 20000)).toBeGreaterThan(0);
  });
  it('ties go to the higher threshold', () => {
    const curve = curveByThreshold([10, 20], [0, 0], [0, 5, 30, 50, 101]);
    // accuracy is 0.5 at t = 0 and 1 for every t above 20
    expect(bestByAccuracy(curve)!.threshold).toBe(101);
    expect(bestByF1(curve)).toBeNull();
  });
});

describe('calibrated rule', () => {
  const { p, labels } = calibratedRisk(4, 200000);
  const costs = { costFN: 10, costFP: 1 };
  it('1/11 is near the cheapest cutoff and costs 1:1 give 0.5', () => {
    expect(costRuleThreshold(10, 1)).toBeCloseTo(1 / 11, 12);
    expect(costRuleThreshold(1, 1)).toBe(0.5);
    const cutoffs = Array.from({ length: 60 }, (_, i) => 0.02 + i * 0.005);
    const costAt = (c: number) => costOf(confusion(p, labels, c), costs);
    const min = Math.min(...cutoffs.map(costAt));
    expect(costAt(1 / 11)).toBeLessThanOrEqual(min * 1.01);
  });
  it('probabilities are honest', () => {
    let sumP = 0;
    let sumY = 0;
    let k = 0;
    for (let i = 0; i < p.length; i++) {
      if (p[i]! >= 0.1 && p[i]! <= 0.12) {
        sumP += p[i]!;
        sumY += labels[i]!;
        k++;
      }
    }
    expect(k).toBeGreaterThan(1000);
    expect(Math.abs(sumY / k - sumP / k)).toBeLessThan(0.01);
  });
});

describe('determinism and common random numbers', () => {
  it('same seed, same mail', () => {
    expect(makeMail(9, 500, 0.2)).toEqual(makeMail(9, 500, 0.2));
    expect(makeMail(9, 500, 0.2).scores).not.toEqual(makeMail(10, 500, 0.2).scores);
  });
  it('z_i is shared across prevalences; only labels and class means change', () => {
    const { z } = makeStream(9, 1000);
    const a = makeMail(9, 1000, 0.05);
    const b = makeMail(9, 1000, 0.4);
    let flips = 0;
    for (let i = 0; i < 1000; i++) {
      const same = a.labels[i] === b.labels[i];
      if (same) expect(a.scores[i]).toBe(b.scores[i]);
      else flips++;
      const mean = (l: number) => (l ? 65 : 35);
      const unclipped = mean(a.labels[i]!) + 15 * z[i]!;
      expect(a.scores[i]).toBe(Math.min(100, Math.max(0, unclipped)));
    }
    expect(flips).toBeGreaterThan(0);
    expect(b.labels.reduce((s, l) => s + l, 0)).toBeGreaterThan(
      a.labels.reduce((s, l) => s + l, 0),
    );
  });
  it('changing n keeps the prefix; scores stay inside [0, 100]', () => {
    const small = makeMail(9, 100, 0.1);
    const big = makeMail(9, 2000, 0.1);
    expect(Array.from(big.scores.slice(0, 100))).toEqual(Array.from(small.scores));
    for (const s of big.scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('no NaN or Infinity', () => {
  it('survives empty and degenerate input', () => {
    expect(curveByThreshold([], [], [0, 50])).toEqual([
      { t: 0, tp: 0, fn: 0, fp: 0, tn: 0 },
      { t: 50, tp: 0, fn: 0, fp: 0, tn: 0 },
    ]);
    const m = metrics({ tp: 0, fn: 0, fp: 0, tn: 0 });
    for (const v of Object.values(m)) expect(v === null || Number.isFinite(v)).toBe(true);
    expect(costPer1000({ tp: 0, fn: 0, fp: 0, tn: 0 }, { costFP: 5 }, 0)).toBe(0);
    expect(bestByF1([])).toBeNull();
    const f = naturalFrequencies({ prevalence: 0.01, recall: 0.5, falseAlarmRate: 0 });
    expect(f.precision).toBe(1);
    expect(
      naturalFrequencies({ prevalence: 0.01, recall: 0, falseAlarmRate: 0 }).precision,
    ).toBeNull();
    const t = theoryMetrics(500, 0.1);
    expect(t.precision).toBeNull();
    expect(Number.isFinite(t.cost)).toBe(true);
  });
});
