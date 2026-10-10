import { describe, expect, it } from 'vitest';
import { lognormalSample, normalSample } from '../../lib/datasets';
import { Phi as PhiFromLib } from '../../lib/normal';
import { Phi as PhiFromMetrics } from '../separation/metrics';
import { mean, median, skewness, std } from '../averages/stats';
import {
  BINS_TOO_COARSE,
  BINS_TOO_FINE,
  Phi,
  beyondSD,
  binCountForWidth,
  binReading,
  boxCox,
  histogram,
  normalCdf,
  normalPdf,
  normalQuantile,
  shareBetween,
  shareReading,
  standardize,
  suggestedBinWidth,
  tailAbove,
  withinSD,
  zScore,
} from './dist';

const finite = (v: number) => Number.isFinite(v);

describe('Phi', () => {
  it('known values', () => {
    expect(Phi(0)).toBeCloseTo(0.5, 6);
    expect(Math.abs(Phi(1) - 0.841345)).toBeLessThan(1e-6);
    expect(Math.abs(Phi(1.96) - 0.975002)).toBeLessThan(1e-6);
  });
  it('is symmetric', () => {
    for (const x of [0.3, 1, 2.5, 4])
      expect(Math.abs(Phi(-x) - (1 - Phi(x)))).toBeLessThan(1e-6);
  });
  it('is shared with the separation page', () => {
    expect(PhiFromMetrics).toBe(PhiFromLib);
  });
});

describe('normalQuantile', () => {
  it('0.975 is 1.959964', () => {
    expect(Math.abs(normalQuantile(0.975) - 1.959964)).toBeLessThan(1e-5);
  });
  it('round trips', () => {
    for (const p of [0.001, 0.1, 0.5, 0.9, 0.999]) {
      expect(Math.abs(normalCdf(normalQuantile(p), 0, 1) - p)).toBeLessThan(1e-6);
    }
  });
  it('scales with mean and sd', () => {
    expect(normalQuantile(0.5, 700, 60)).toBeCloseTo(700, 6);
  });
  it('stays finite at the extremes', () => {
    for (const p of [0, 1, -3, 7, 1e-300]) expect(finite(normalQuantile(p))).toBe(true);
  });
});

describe('bands and tails', () => {
  it('68-95-99.7', () => {
    expect(Math.abs(withinSD(1) - 0.6827)).toBeLessThan(1e-4);
    expect(Math.abs(withinSD(2) - 0.9545)).toBeLessThan(1e-4);
    expect(Math.abs(withinSD(3) - 0.9973)).toBeLessThan(1e-4);
  });
  it('tail above 2 SD is 2.3%', () => {
    expect(Math.abs(tailAbove(2) - 0.02275)).toBeLessThan(1e-5);
  });
  it('shareBetween matches the CDF and never goes negative', () => {
    expect(Math.abs(shareBetween(640, 760, 700, 60) - 0.6827)).toBeLessThan(1e-4);
    expect(shareBetween(760, 640, 700, 60)).toBe(0);
    expect(shareBetween(700, 700, 700, 60)).toBe(0);
  });
  it('pdf peaks at the mean and is 0 without spread', () => {
    expect(normalPdf(0, 0, 1)).toBeCloseTo(0.398942, 6);
    expect(normalPdf(1, 0, 0)).toBe(0);
    expect(normalCdf(1, 0, 0)).toBe(1);
  });
  it('shareReading in plain words', () => {
    expect(shareReading(0.6827)).toBe('about 7 in 10');
    expect(shareReading(tailAbove(2))).toBe('about 1 in 44');
    expect(shareReading(0.5)).toBe('about half');
    expect(shareReading(0)).toBe('almost none');
    expect(shareReading(NaN)).toBe('almost none');
  });
});

describe('z-scores', () => {
  const v = normalSample(5, 500, 650, 80);
  it('standardize gives mean 0 and sample SD 1', () => {
    const z = standardize(v)!;
    expect(Math.abs(mean(z))).toBeLessThan(1e-9);
    expect(Math.abs(std(z) - 1)).toBeLessThan(1e-9);
  });
  it('shift and positive scale do not change z', () => {
    const z = standardize(v)!;
    const shifted = standardize(v.map((x) => x + 123))!;
    const scaled = standardize(v.map((x) => x * 4.5))!;
    z.forEach((a, i) => {
      expect(Math.abs(a - shifted[i]!)).toBeLessThan(1e-9);
      expect(Math.abs(a - scaled[i]!)).toBeLessThan(1e-9);
    });
  });
  it('no spread gives null, never NaN', () => {
    expect(zScore(5, 5, 0)).toBeNull();
    expect(zScore(5, 5, NaN)).toBeNull();
    expect(zScore(710, 650, 60)).toBe(1);
    expect(standardize([3, 3, 3])).toBeNull();
    expect(standardize([3])).toBeNull();
    expect(standardize([])).toBeNull();
  });
});

describe('histogram', () => {
  const v = normalSample(8, 1000, 50, 10);
  it('counts and shares add up, and every value is in exactly one bin', () => {
    for (const w of [0.5, 3, 7.7, 20, 100]) {
      const h = histogram(v, { binWidth: w })!;
      expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(1000);
      expect(h.bins.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 12);
      expect(h.n).toBe(1000);
    }
  });
  it('puts the maximum in the last bin', () => {
    const h = histogram([0, 5, 10], { binWidth: 5 })!;
    expect(h.bins.map((b) => b.count)).toEqual([1, 2]);
  });
  it('bin count never grows with the width', () => {
    let prev = Infinity;
    for (const w of [0.25, 0.5, 1, 2, 5, 10, 40, 500]) {
      const n = histogram(v, { binWidth: w })!.bins.length;
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
    expect(binCountForWidth(0, 10, 3)).toBe(4);
  });
  it('empty data or bad width is null', () => {
    expect(histogram([], { binWidth: 1 })).toBeNull();
    expect(histogram([1, 2], { binWidth: 0 })).toBeNull();
    expect(histogram([NaN], { binWidth: 1 })).toBeNull();
  });
  it('ignores values outside a fixed range', () => {
    const h = histogram([1, 2, 50], { binWidth: 1, min: 0, max: 10 })!;
    expect(h.n).toBe(2);
  });
});

describe('suggestedBinWidth', () => {
  it('1..100 is about 21.33', () => {
    const w = suggestedBinWidth(Array.from({ length: 100 }, (_, i) => i + 1))!;
    expect(Math.abs(w - 21.33)).toBeLessThan(0.01);
  });
  it('is null when it cannot be used', () => {
    expect(suggestedBinWidth([])).toBeNull();
    expect(suggestedBinWidth([4])).toBeNull();
    expect(suggestedBinWidth([4, 4, 4, 4])).toBeNull();
  });
});

describe('binReading', () => {
  it('uses the thresholds', () => {
    expect(BINS_TOO_FINE).toBe(40);
    expect(BINS_TOO_COARSE).toBe(6);
    expect(binReading(41)).toBe('41 bins: too fine: noisy spikes');
    expect(binReading(40)).toMatch(/readable/);
    expect(binReading(6)).toMatch(/readable/);
    expect(binReading(5)).toMatch(/too coarse/);
  });
});

describe('a seeded normal sample follows the 68-95 rule', () => {
  const v = normalSample(11, 20000);
  const within = (k: number) => v.filter((x) => Math.abs(x) <= k).length / v.length;
  it('1 and 2 SD', () => {
    expect(Math.abs(within(1) - 0.6827)).toBeLessThan(0.01);
    expect(Math.abs(within(2) - 0.9545)).toBeLessThan(0.01);
  });
  it('is deterministic per seed', () => {
    expect(normalSample(11, 50)).toEqual(normalSample(11, 50));
    expect(normalSample(11, 50)).not.toEqual(normalSample(12, 50));
  });
});

describe('boxCox', () => {
  const raw = lognormalSample(3, 5000, 2.2, 0.9);
  it('lambda 1 is a shift, lambda 0 is ln', () => {
    const one = boxCox([2, 5, 9], 1).values;
    expect(one).toEqual([1, 4, 8]);
    const zero = boxCox([2, 5, 9], 0).values;
    zero.forEach((v, i) => expect(v).toBeCloseTo(Math.log([2, 5, 9][i]!), 12));
  });
  it('is smooth and finite from 1 down to 0', () => {
    let prev = boxCox([7], 1).values[0]!;
    for (let l = 1; l >= -1e-9; l -= 0.01) {
      const v = boxCox([7], Math.max(l, 0)).values[0]!;
      expect(finite(v)).toBe(true);
      expect(prev - v).toBeLessThan(0.5);
      prev = v;
    }
    expect(Math.abs(boxCox([7], 1e-8).values[0]! - Math.log(7))).toBeLessThan(1e-9);
    expect(Math.abs(boxCox([7], 1e-5).values[0]! - Math.log(7))).toBeLessThan(1e-3);
  });
  it('the log removes the skew of a lognormal sample', () => {
    expect(skewness(raw)).toBeGreaterThan(1);
    const logged = boxCox(raw, 0).values;
    expect(Math.abs(skewness(logged))).toBeLessThan(0.15);
    const rawGap = Math.abs(mean(raw) - median(raw)) / std(raw);
    const logGap = Math.abs(mean(logged) - median(logged)) / std(logged);
    expect(logGap).toBeLessThan(rawGap);
    expect(logGap).toBeLessThan(0.05);
  });
  it('drops and counts non-positive values instead of making NaN', () => {
    const t = boxCox([-3, 0, 4, NaN, 9], 0);
    expect(t.excluded).toBe(3);
    expect(t.values).toHaveLength(2);
    expect(t.values.every(finite)).toBe(true);
    expect(boxCox([], 0)).toEqual({ values: [], excluded: 0 });
  });
});

describe('beyondSD', () => {
  it('a normal sample has a few values beyond 3 SD', () => {
    const c = beyondSD(normalSample(21, 5000), 3);
    expect(c).toBeGreaterThan(3);
    expect(c).toBeLessThan(31);
  });
  it('the raw lognormal has more than its log', () => {
    const raw = lognormalSample(3, 5000, 2.2, 0.9);
    expect(beyondSD(raw, 3)).toBeGreaterThan(beyondSD(boxCox(raw, 0).values, 3));
  });
  it('no spread or tiny input is 0', () => {
    expect(beyondSD([5, 5, 5], 3)).toBe(0);
    expect(beyondSD([5], 3)).toBe(0);
    expect(beyondSD([], 3)).toBe(0);
  });
});

describe('nothing returns NaN or Infinity', () => {
  it('on degenerate input', () => {
    const nums = [
      normalPdf(0, 0, 0),
      normalCdf(0, 0, -1),
      normalQuantile(NaN),
      shareBetween(1, 1, 0, 1),
      withinSD(0),
      tailAbove(50),
    ];
    nums.forEach((n) => expect(finite(n)).toBe(true));
  });
});
