import { describe, expect, it } from 'vitest';
import {
  bimodalSample,
  lognormalSample,
  normalSample,
  standardize,
} from '../../lib/datasets';
import {
  SKEW_THRESHOLD,
  boxStats,
  histogramCounts,
  histogramPeaks,
  iqr,
  mean,
  median,
  modes,
  percentileRank,
  quantile,
  quartiles,
  range,
  skewLabel,
  skewness,
  std,
  trimmedMean,
  variance,
  weightedMean,
} from './stats';

describe('mean and median', () => {
  it('handles odd and even length lists', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3])).toBe(2);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('does not depend on input order and does not mutate the input', () => {
    const v = [9, 1, 5, 3];
    expect(median(v)).toBe(4);
    expect(v).toEqual([9, 1, 5, 3]);
  });

  it('returns NaN (never a number that looks real) for an empty list', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('modes', () => {
  it('finds a single mode', () => {
    expect(modes([1, 2, 2, 3, 4])).toEqual([2]);
  });

  it('returns every value tied for the highest count', () => {
    expect(modes([1, 1, 2, 5, 5, 9])).toEqual([1, 5]);
    expect(modes([3, 3, 3, 8, 8, 8, 4])).toEqual([3, 8]);
  });

  it('returns an empty list when every value is unique', () => {
    expect(modes([4, 5, 6, 7])).toEqual([]);
    expect(modes([])).toEqual([]);
  });
});

describe('spread', () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];

  it('population std is 2 and sample std is about 2.138', () => {
    expect(std(data, false)).toBeCloseTo(2, 12);
    expect(std(data)).toBeCloseTo(2.138089935, 8);
    expect(variance(data, false)).toBeCloseTo(4, 12);
    expect(variance(data)).toBeCloseTo(32 / 7, 12);
  });

  it('sample std needs at least two values', () => {
    expect(Number.isNaN(std([5]))).toBe(true);
    expect(std([5], false)).toBe(0);
  });

  it('range is max minus min', () => {
    expect(range(data)).toBe(7);
  });
});

describe('quantile (linear interpolation, like numpy.percentile)', () => {
  const a = [15, 20, 35, 40, 50];
  const b = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
  const c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];

  it('matches numpy for a five-value list', () => {
    const expected: [number, number][] = [
      [0, 15],
      [10, 17],
      [25, 20],
      [40, 29],
      [50, 35],
      [75, 40],
      [90, 46],
      [100, 50],
    ];
    for (const [p, v] of expected) expect(quantile(a, p / 100)).toBeCloseTo(v, 10);
  });

  it('matches numpy for an unsorted list with ties', () => {
    const expected: [number, number][] = [
      [10, 1],
      [25, 2.5],
      [40, 3],
      [50, 4],
      [75, 5],
      [90, 6],
      [100, 9],
    ];
    for (const [p, v] of expected) expect(quantile(b, p / 100)).toBeCloseTo(v, 10);
  });

  it('matches numpy for an even-length list with an extreme value', () => {
    expect(quantile(c, 0.1)).toBeCloseTo(1.9, 10);
    expect(quantile(c, 0.25)).toBeCloseTo(3.25, 10);
    expect(quantile(c, 0.4)).toBeCloseTo(4.6, 10);
    expect(quantile(c, 0.5)).toBeCloseTo(5.5, 10);
    expect(quantile(c, 0.75)).toBeCloseTo(7.75, 10);
    expect(quantile(c, 0.9)).toBeCloseTo(13.1, 10);
  });

  it('quartiles and iqr follow from it', () => {
    expect(quartiles(c)).toEqual({ q1: 3.25, q2: 5.5, q3: 7.75 });
    expect(iqr(c)).toBeCloseTo(4.5, 12);
  });

  it('percentileRank is the share of values strictly below', () => {
    expect(percentileRank(c, 5.5)).toBe(0.5);
    expect(percentileRank(c, 1)).toBe(0);
    expect(percentileRank(c, 51)).toBe(1);
  });
});

describe('boxStats', () => {
  it('flags exactly the expected outliers with the 1.5 x IQR rule', () => {
    const s = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 50]);
    expect(s.q1).toBeCloseTo(3.25, 12);
    expect(s.q3).toBeCloseTo(7.75, 12);
    expect(s.fenceHigh).toBeCloseTo(14.5, 12);
    expect(s.fenceLow).toBeCloseTo(-3.5, 12);
    expect(s.outliers).toEqual([50]);
    expect(s.whiskerHigh).toBe(9);
    expect(s.whiskerLow).toBe(1);
  });

  it('flags low outliers and keeps whiskers on real data points', () => {
    const s = boxStats([-40, 10, 11, 12, 13, 14, 15, 16, 17, 60]);
    expect(s.outliers).toEqual([-40, 60]);
    expect(s.whiskerLow).toBe(10);
    expect(s.whiskerHigh).toBe(17);
  });

  it('has no outliers for tidy data', () => {
    expect(boxStats([1, 2, 3, 4, 5]).outliers).toEqual([]);
  });
});

describe('robustness', () => {
  const base = [4, 5, 5, 6, 6, 7, 7, 8, 9];

  it('one huge value moves the mean a lot and the median by at most one position', () => {
    const withOutlier = [...base, 120];
    expect(mean(withOutlier) - mean(base)).toBeGreaterThan(10);
    expect(median(withOutlier)).toBeCloseTo(6.5, 12);
    const sorted = [...withOutlier].sort((a, b) => a - b);
    expect(Math.abs(median(withOutlier) - median(base))).toBeLessThanOrEqual(
      (sorted[5] as number) - (sorted[4] as number),
    );
  });

  it('gives the numbers quoted on the page', () => {
    expect(mean([...base, 120])).toBeCloseTo(17.7, 10);
    expect(median(base)).toBe(6);
    expect(mean(base)).toBeCloseTo(57 / 9, 12);
  });

  it('median of an odd list commutes with an order-preserving transform', () => {
    expect(median(base.map(Math.exp))).toBeCloseTo(Math.exp(median(base)), 8);
  });

  it('trimmed mean shrugs off the outlier', () => {
    const v = [...base, 120];
    expect(trimmedMean(v, 0.1)).toBeCloseTo(mean([5, 5, 6, 6, 7, 7, 8, 9]), 12);
    expect(trimmedMean(v, 0)).toBe(mean(v));
  });
});

describe('shift and scale', () => {
  const v = normalSample(5, 40, 10, 3);

  it('shifting every value by c shifts the mean and median by c, std unchanged', () => {
    const shifted = v.map((x) => x + 7);
    expect(mean(shifted)).toBeCloseTo(mean(v) + 7, 10);
    expect(median(shifted)).toBeCloseTo(median(v) + 7, 10);
    expect(quantile(shifted, 0.25)).toBeCloseTo(quantile(v, 0.25) + 7, 10);
    expect(std(shifted)).toBeCloseTo(std(v), 10);
    expect(iqr(shifted)).toBeCloseTo(iqr(v), 10);
  });

  it('scaling every value by k scales the std and iqr by k', () => {
    const scaled = v.map((x) => x * 4);
    expect(std(scaled)).toBeCloseTo(std(v) * 4, 10);
    expect(iqr(scaled)).toBeCloseTo(iqr(v) * 4, 10);
    expect(mean(scaled)).toBeCloseTo(mean(v) * 4, 10);
  });
});

describe('skewness', () => {
  it('is about 0 for a symmetric sample and has the symmetric label', () => {
    expect(skewness([-3, -2, -1, 0, 1, 2, 3])).toBeCloseTo(0, 12);
    expect(skewLabel(0)).toBe('roughly symmetric');
  });

  it('is positive for a lognormal sample, with the right-tail label', () => {
    const s = skewness(lognormalSample(2, 400, 0, 0.8));
    expect(s).toBeGreaterThan(SKEW_THRESHOLD);
    expect(skewLabel(s)).toBe('tail to the right');
  });

  it('is negative for the mirror image', () => {
    const s = skewness(lognormalSample(2, 400, 0, 0.8).map((x) => -x));
    expect(s).toBeLessThan(-SKEW_THRESHOLD);
    expect(skewLabel(s)).toBe('tail to the left');
  });

  it('is 0, not NaN, for tiny or constant samples', () => {
    expect(skewness([1, 2])).toBe(0);
    expect(skewness([5, 5, 5, 5])).toBe(0);
  });

  it('uses the documented threshold at the edges', () => {
    expect(SKEW_THRESHOLD).toBe(0.5);
    expect(skewLabel(0.5)).toBe('roughly symmetric');
    expect(skewLabel(0.51)).toBe('tail to the right');
    expect(skewLabel(-0.51)).toBe('tail to the left');
  });
});

describe('weightedMean', () => {
  it('equals the plain mean when weights are equal', () => {
    const v = [3, 8, 11, 20];
    expect(weightedMean(v, [2, 2, 2, 2])).toBeCloseTo(mean(v), 12);
  });

  it('follows the heavy weight', () => {
    expect(weightedMean([10, 20], [1, 3])).toBe(17.5);
  });

  it('matches the fruit-shop example on the page', () => {
    const kg = [1, 1, 2, 4, 5, 10];
    const price = [180, 150, 120, 80, 50, 40];
    expect(mean(price)).toBeCloseTo(103.3333, 3);
    expect(weightedMean(price, kg)).toBeCloseTo(1540 / 23, 10);
  });

  it('refuses weights that do not add up to something positive', () => {
    expect(() => weightedMean([1, 2], [0, 0])).toThrow(RangeError);
    expect(() => weightedMean([1, 2], [1, -1])).toThrow(RangeError);
    expect(() => weightedMean([1, 2], [1])).toThrow(RangeError);
  });
});

describe('histograms', () => {
  it('counts into equal-width bins, with the top edge in the last bin', () => {
    expect(histogramCounts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0, 10, 5)).toEqual([
      2, 2, 2, 2, 3,
    ]);
  });

  it('finds both peaks of a bimodal sample but only one for a normal sample', () => {
    const two = bimodalSample(3, 400, { mu1: 30, sd1: 5, mu2: 70, sd2: 5 });
    const peaks = histogramPeaks(histogramCounts(two, 0, 100, 25));
    expect(peaks).toHaveLength(2);
    const one = histogramPeaks(histogramCounts(normalSample(3, 400, 50, 8), 0, 100, 25));
    expect(one).toHaveLength(1);
  });
});

describe('seeded generators', () => {
  it('are deterministic per seed and differ across seeds', () => {
    expect(normalSample(1, 20)).toEqual(normalSample(1, 20));
    expect(lognormalSample(1, 20)).toEqual(lognormalSample(1, 20));
    expect(bimodalSample(1, 20, { mu1: 0, sd1: 1, mu2: 5, sd2: 1 })).toEqual(
      bimodalSample(1, 20, { mu1: 0, sd1: 1, mu2: 5, sd2: 1 }),
    );
    expect(normalSample(1, 20)).not.toEqual(normalSample(2, 20));
  });

  it('lognormal values are positive', () => {
    expect(lognormalSample(4, 200).every((x) => x > 0)).toBe(true);
  });

  it('standardize hits the requested mean and sample std exactly', () => {
    const z = standardize(normalSample(9, 30), 10, 2.5);
    expect(mean(z)).toBeCloseTo(10, 10);
    expect(std(z)).toBeCloseTo(2.5, 10);
    expect(standardize([4, 4, 4], 10, 2)).toEqual([10, 10, 10]);
  });
});
