import { describe, expect, it } from 'vitest';
import {
  AXIS_MAX,
  BINS,
  blendSample,
  dpdSample,
  skewName,
  skewSample,
  twoGroupsSample,
} from './skewdata';
import {
  histogramCounts,
  histogramPeaks,
  mean,
  median,
  modes,
  skewLabel,
  skewness,
} from './stats';

const gap = (v: number[]) => mean(v) - median(v);

describe('blendSample', () => {
  it('is deterministic per seed and stays on the axis', () => {
    expect(blendSample(1, 0.5)).toEqual(blendSample(1, 0.5));
    expect(blendSample(1, 0.5)).not.toEqual(blendSample(2, 0.5));
    for (const s of [-1, -0.5, 0, 0.5, 1]) {
      const v = blendSample(3, s);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...v)).toBeLessThanOrEqual(AXIS_MAX);
    }
  });

  it('right tail: mean above median and a right-tail label', () => {
    const v = blendSample(1, 0.6);
    expect(gap(v)).toBeGreaterThan(0.5);
    expect(skewLabel(skewness(v))).toBe('tail to the right');
  });

  it('left tail: mean below median and a left-tail label', () => {
    const v = blendSample(1, -0.6);
    expect(gap(v)).toBeLessThan(-0.5);
    expect(skewLabel(skewness(v))).toBe('tail to the left');
  });

  it('symmetric at 0: mean and median nearly equal', () => {
    const v = blendSample(1, 0);
    expect(Math.abs(gap(v))).toBeLessThan(0.6);
    expect(skewLabel(skewness(v))).toBe('roughly symmetric');
  });

  it('moves smoothly: the gap grows with the skew', () => {
    const gaps = [-1, -0.5, 0, 0.5, 1].map((s) => gap(blendSample(2, s)));
    for (let i = 1; i < gaps.length; i++)
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1] as number);
  });
});

describe('presets', () => {
  it('days past due: heavily right-skewed, with a mode of exactly 0', () => {
    const v = dpdSample(1);
    expect(modes(v)).toEqual([0]);
    expect(gap(v)).toBeGreaterThan(3);
    expect(skewness(v)).toBeGreaterThan(1.5);
    expect(v.every((x) => Number.isInteger(x))).toBe(true);
  });

  it('two kinds of customers: two peaks, and the mean and median sit between them', () => {
    const v = twoGroupsSample(1);
    const peaks = histogramPeaks(histogramCounts(v, 0, AXIS_MAX, BINS));
    expect(peaks).toHaveLength(2);
    const lowPeak = (peaks[0] as number) * (AXIS_MAX / BINS);
    const highPeak = ((peaks[1] as number) + 1) * (AXIS_MAX / BINS);
    expect(mean(v)).toBeGreaterThan(lowPeak);
    expect(mean(v)).toBeLessThan(highPeak);
    expect(median(v)).toBeGreaterThan(lowPeak);
    expect(median(v)).toBeLessThan(highPeak);
    const near = v.filter((x) => Math.abs(x - mean(v)) <= 4).length / v.length;
    expect(near).toBeLessThan(0.1);
  });

  it('skewSample picks the generator', () => {
    expect(skewSample('dpd', 0.9, 1)).toEqual(dpdSample(1));
    expect(skewSample('bimodal', 0.9, 1)).toEqual(twoGroupsSample(1));
    expect(skewSample('blend', 0.9, 1)).toEqual(blendSample(1, 0.9));
  });
});

describe('skewName', () => {
  it('names the three zones', () => {
    expect(skewName(-0.8)).toBe('left tail');
    expect(skewName(0)).toBe('symmetric');
    expect(skewName(0.8)).toBe('right tail');
  });
});
