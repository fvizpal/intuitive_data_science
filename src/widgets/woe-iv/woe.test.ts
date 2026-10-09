import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, FEATURE_KEYS, generateLoans } from '../../lib/loanData';
import type { FeatureKey } from '../../lib/loanData';
import {
  IV_THRESHOLDS,
  binFeature,
  binWarnings,
  computeBins,
  equalCountEdges,
  equalWidthEdges,
  isMonotonic,
  ivStrength,
  ivVsBins,
  totalIV,
  woeSequence,
} from './woe';

/** Rows with the given goods and bads per bin (bin i holds goods[i] + bads[i] rows). */
function rows(goods: number[], bads: number[]) {
  const idx: number[] = [];
  const flags: number[] = [];
  goods.forEach((g, i) => {
    for (let j = 0; j < g; j++) {
      idx.push(i);
      flags.push(0);
    }
    for (let j = 0; j < (bads[i] as number); j++) {
      idx.push(i);
      flags.push(1);
    }
  });
  return { idx, flags };
}

describe('hand-checkable example', () => {
  const { idx, flags } = rows([700, 200, 100], [10, 20, 70]);
  const bins = computeBins(idx, flags, { smoothing: 0 });

  it('matches the shares, WoE and IV worked out by hand', () => {
    expect(bins.map((b) => b.pctGood)).toEqual([0.7, 0.2, 0.1]);
    expect(bins.map((b) => b.pctBad)).toEqual([0.1, 0.2, 0.7]);
    expect(bins[0]!.woe).toBeCloseTo(Math.log(7), 10);
    expect(bins[1]!.woe).toBeCloseTo(0, 10);
    expect(bins[2]!.woe).toBeCloseTo(-Math.log(7), 10);
    expect(totalIV(bins)).toBeCloseTo(2.3351, 3);
  });

  it('reports raw counts and default rates', () => {
    expect(bins[0]!.count).toBe(710);
    expect(bins[0]!.defaultRate).toBeCloseTo(10 / 710, 12);
    expect(bins[2]!.bad).toBe(70);
  });
});

describe('WoE direction', () => {
  it('lower-than-portfolio default rate gives positive WoE, higher gives negative', () => {
    const { idx, flags } = rows([900, 800, 700], [10, 40, 90]);
    const bins = computeBins(idx, flags);
    expect(bins[0]!.woe).toBeGreaterThan(0);
    expect(bins[2]!.woe).toBeLessThan(0);
  });
});

describe('shares and IV', () => {
  it('pctGood and pctBad each sum to 1', () => {
    const { idx, flags } = rows([500, 300, 200], [5, 15, 30]);
    const bins = computeBins(idx, flags);
    expect(bins.reduce((s, b) => s + b.pctGood, 0)).toBeCloseTo(1, 12);
    expect(bins.reduce((s, b) => s + b.pctBad, 0)).toBeCloseTo(1, 12);
    expect(bins.reduce((s, b) => s + b.pctOfPopulation, 0)).toBeCloseTo(1, 12);
  });

  it('IV is never negative', () => {
    for (let s = 1; s <= 5; s++) {
      const loans = generateLoans(s, 2000);
      const edges = equalCountEdges(loans.columns.bureau_score, 5);
      const bins = computeBins(
        binFeature(loans.columns.bureau_score, edges),
        loans.defaulted,
      );
      expect(totalIV(bins)).toBeGreaterThanOrEqual(0);
      bins.forEach((b) => expect(b.ivContribution).toBeGreaterThanOrEqual(0));
    }
  });

  it('IV is about 0 when every bin has the same default rate', () => {
    const { idx, flags } = rows([950, 950, 950], [50, 50, 50]);
    expect(totalIV(computeBins(idx, flags))).toBeCloseTo(0, 6);
  });
});

describe('smoothing', () => {
  it('keeps WoE finite for a bin with zero bads and a bin with zero goods', () => {
    const { idx, flags } = rows([400, 300, 0], [0, 20, 30]);
    const bins = computeBins(idx, flags);
    for (const b of bins) {
      expect(Number.isFinite(b.woe)).toBe(true);
      expect(Number.isFinite(b.ivContribution)).toBe(true);
    }
    expect(bins[0]!.woe).toBeGreaterThan(0);
    expect(bins[2]!.woe).toBeLessThan(0);
    expect(Number.isFinite(totalIV(bins))).toBe(true);
  });

  it('stays finite even with smoothing = 0', () => {
    const { idx, flags } = rows([400, 0], [0, 30]);
    const bins = computeBins(idx, flags, { smoothing: 0 });
    bins.forEach((b) => expect(Number.isFinite(b.woe)).toBe(true));
  });

  it('gives empty bins zeros', () => {
    const bins = computeBins([0, 0, 2], [0, 1, 0], { nBins: 4 });
    expect(bins[1]).toMatchObject({ count: 0, woe: 0, ivContribution: 0 });
  });
});

describe('binning', () => {
  it('uses [e0,e1) bins with the last bin closed on the right', () => {
    const idx = binFeature([0, 4.99, 5, 9, 10, 99], [0, 5, 10]);
    expect(idx).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('sends missing values to their own bin and out of the monotonic check', () => {
    const values = [1, 2, 6, 7, NaN, null, 9];
    const idx = binFeature(values, [0, 5, 10]);
    expect(idx).toEqual([0, 0, 1, 1, 2, 2, 1]);
    expect(binFeature(values, [0, 5, 10], { missingAsOwnBin: false })[4]).toBe(-1);
    const flags = [0, 0, 1, 0, 1, 1, 0];
    const bins = computeBins(idx, flags, { missingIndex: 2 });
    expect(bins[2]!.isMissing).toBe(true);
    expect(woeSequence(bins)[2]).toBeNull();
    expect(isMonotonic([0.5, -0.2, null])).toBe(true);
    expect(isMonotonic([0.5, -0.2, null], false)).toBe(false);
  });

  it('equalWidthEdges spans min to max in equal steps', () => {
    expect(equalWidthEdges([0, 10, NaN, 5], 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('equalCountEdges gives near-equal bin sizes', () => {
    const v = Array.from({ length: 1000 }, (_, i) => Math.sin(i) * 100);
    const edges = equalCountEdges(v, 5);
    expect(edges).toHaveLength(6);
    const sizes = new Array<number>(5).fill(0);
    binFeature(v, edges).forEach((b) => sizes[b]!++);
    sizes.forEach((s) => expect(Math.abs(s - 200)).toBeLessThanOrEqual(2));
  });

  it('equalCountEdges merges tied edges', () => {
    const v = [
      ...new Array<number>(80).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const edges = equalCountEdges(v, 5);
    expect(new Set(edges).size).toBe(edges.length);
    expect(edges.length).toBeLessThan(6);
  });

  it('equal-count WoE and IV are unchanged by a monotonic transform', () => {
    const loans = generateLoans(3);
    const raw = loans.columns.monthly_turnover_lakh;
    const logged = raw.map(Math.log);
    const stats = (v: number[]) => {
      const e = equalCountEdges(v, 5);
      return computeBins(binFeature(v, e), loans.defaulted, {
        nBins: e.length,
        missingIndex: e.length - 1,
      });
    };
    const a = stats(raw);
    const b = stats(logged);
    expect(totalIV(a)).toBeCloseTo(totalIV(b), 10);
    a.forEach((bin, i) => expect(bin.woe).toBeCloseTo(b[i]!.woe, 10));
  });
});

describe('isMonotonic', () => {
  it('accepts steadily rising or falling sequences', () => {
    expect(isMonotonic([-1, -0.2, 0.3, 0.9])).toBe(true);
    expect(isMonotonic([0.9, 0.3, -0.2, -1])).toBe(true);
    expect(isMonotonic([0.1, 0.1, 0.4])).toBe(true);
  });

  it('rejects zig-zags', () => {
    expect(isMonotonic([-1, 0.5, 0.1, 0.9])).toBe(false);
    expect(isMonotonic([0.2, -0.5, 0.4])).toBe(false);
  });
});

describe('ivStrength', () => {
  it('uses the conventional cutoffs', () => {
    expect(IV_THRESHOLDS).toEqual({
      notUseful: 0.02,
      weak: 0.1,
      medium: 0.3,
      strong: 0.5,
    });
    expect(ivStrength(0)).toBe('not useful');
    expect(ivStrength(0.0199)).toBe('not useful');
    expect(ivStrength(0.02)).toBe('weak');
    expect(ivStrength(0.0999)).toBe('weak');
    expect(ivStrength(0.1)).toBe('medium');
    expect(ivStrength(0.2999)).toBe('medium');
    expect(ivStrength(0.3)).toBe('strong');
    expect(ivStrength(0.5)).toBe('strong');
    expect(ivStrength(0.5001)).toBe('suspicious');
  });
});

describe('binWarnings', () => {
  it('flags bins under 5% of people or with fewer than 30 bads', () => {
    const { idx, flags } = rows([1000, 1000, 30], [60, 60, 1]);
    const w = binWarnings(computeBins(idx, flags));
    expect(w).toHaveLength(1);
    expect(w[0]).toEqual({ index: 2, tooSmall: true, fewBads: true });
  });

  it('flags a big bin that has few defaulters', () => {
    const { idx, flags } = rows([1000, 1000], [100, 10]);
    expect(binWarnings(computeBins(idx, flags))).toEqual([
      { index: 1, tooSmall: false, fewBads: true },
    ]);
  });
});

describe('generateLoans', () => {
  const ivOf = (loans: ReturnType<typeof generateLoans>, key: FeatureKey) => {
    const v = loans.columns[key];
    // The leakage column is almost all zeros, so it is split as "0" vs "any calls".
    const e =
      key === 'post_default_collection_calls' ? [0, 1, 1000] : equalCountEdges(v, 5);
    return totalIV(
      computeBins(binFeature(v, e), loans.defaulted, {
        nBins: e.length,
        missingIndex: e.length - 1,
      }),
    );
  };

  it('has every column the page needs', () => {
    const loans = generateLoans(1);
    for (const k of FEATURE_KEYS) expect(loans.columns[k]).toHaveLength(loans.n);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = generateLoans(7);
    const b = generateLoans(7);
    expect(a.defaulted).toEqual(b.defaulted);
    expect(a.columns.bureau_score).toEqual(b.columns.bureau_score);
    expect(generateLoans(8).defaulted).not.toEqual(a.defaulted);
  });

  it('is fast', () => {
    generateLoans(1);
    const t = performance.now();
    generateLoans(2);
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('has about a 4% default rate and the specified missingness', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const loans = generateLoans(seed);
      const rate = loans.defaulted.reduce((s, d) => s + d, 0) / loans.n;
      expect(rate).toBeGreaterThan(0.035);
      expect(rate).toBeLessThan(0.045);
      const miss = loans.columns.bureau_score.filter(Number.isNaN).length / loans.n;
      expect(miss).toBeGreaterThan(0.04);
      expect(miss).toBeLessThan(0.08);
      const tm =
        loans.columns.monthly_turnover_lakh.filter(Number.isNaN).length / loans.n;
      expect(tm).toBeGreaterThan(0.015);
      expect(tm).toBeLessThan(0.045);
    }
  });

  it('gives thin-file (missing score) applicants roughly twice the default rate', () => {
    let missBad = 0;
    let missN = 0;
    let bad = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const loans = generateLoans(seed);
      loans.columns.bureau_score.forEach((s, i) => {
        if (Number.isNaN(s)) {
          missN++;
          missBad += loans.defaulted[i] as number;
        }
      });
      bad += loans.defaulted.reduce((s, d) => s + d, 0);
    }
    const ratio = missBad / missN / (bad / (5 * 5000));
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(3);
  });

  it('lower bureau score means higher default rate; more DPD means higher risk', () => {
    const loans = generateLoans(1);
    const pairs = loans.columns.bureau_score.map(
      (s, i) => [s, loans.defaulted[i]!] as const,
    );
    const rateBelow = (t: number) => {
      const sel = pairs.filter(([s]) => s < t);
      return sel.reduce((a, [, d]) => a + d, 0) / sel.length;
    };
    expect(rateBelow(580)).toBeGreaterThan(rateBelow(1000));
    const dpd = loans.columns.max_dpd_6m;
    const rate = (f: (d: number) => boolean) => {
      const idx = dpd.map((d, i) => (f(d) ? i : -1)).filter((i) => i >= 0);
      return idx.reduce((a, i) => a + loans.defaulted[i]!, 0) / idx.length;
    };
    expect(rate((d) => d >= 30)).toBeGreaterThan(rate((d) => d === 0));
  });

  it('orders IV on the default seed: bureau > dpd > years > turnover > noise', () => {
    const loans = generateLoans(DEFAULT_SEED);
    const iv = (k: FeatureKey) => ivOf(loans, k);
    expect(iv('bureau_score')).toBeGreaterThan(0.3);
    expect(iv('bureau_score')).toBeLessThan(0.5);
    expect(iv('bureau_score')).toBeGreaterThan(iv('max_dpd_6m'));
    expect(iv('max_dpd_6m')).toBeGreaterThan(0.15);
    expect(iv('max_dpd_6m')).toBeGreaterThan(iv('years_in_business'));
    expect(iv('years_in_business')).toBeGreaterThan(0.05);
    expect(iv('years_in_business')).toBeGreaterThan(iv('monthly_turnover_lakh'));
    expect(iv('monthly_turnover_lakh')).toBeGreaterThan(iv('noise_feature'));
    expect(iv('noise_feature')).toBeLessThan(0.03);
  });

  it('orders mean IV over many seeds (single seeds wobble, noise is noise)', () => {
    const keys: FeatureKey[] = [
      'bureau_score',
      'max_dpd_6m',
      'years_in_business',
      'monthly_turnover_lakh',
      'noise_feature',
    ];
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const mean = Object.fromEntries(
      keys.map((k) => [
        k,
        seeds.reduce((s, seed) => s + ivOf(generateLoans(seed), k), 0) / seeds.length,
      ]),
    ) as Record<FeatureKey, number>;
    expect(mean.bureau_score).toBeGreaterThan(0.3);
    expect(mean.bureau_score).toBeLessThan(0.5);
    expect(mean.bureau_score).toBeGreaterThan(mean.max_dpd_6m);
    expect(mean.max_dpd_6m).toBeGreaterThan(mean.years_in_business);
    expect(mean.years_in_business).toBeGreaterThan(0.05);
    expect(mean.years_in_business).toBeLessThan(0.2);
    expect(mean.years_in_business).toBeGreaterThan(mean.monthly_turnover_lakh);
    expect(mean.monthly_turnover_lakh).toBeGreaterThan(0.02);
    expect(mean.monthly_turnover_lakh).toBeLessThan(0.1);
    expect(mean.monthly_turnover_lakh).toBeGreaterThan(mean.noise_feature);
    expect(mean.noise_feature).toBeLessThan(0.03);
  });

  it('leakage feature has IV above 0.5', () => {
    for (const seed of [1, 2, 3, DEFAULT_SEED]) {
      expect(ivOf(generateLoans(seed), 'post_default_collection_calls')).toBeGreaterThan(
        0.5,
      );
    }
  });
});

describe('ivVsBins', () => {
  it('rises with the number of bins for noise, and stays higher for a real feature', () => {
    const loans = generateLoans(2);
    const noise = ivVsBins(loans.columns.noise_feature, loans.defaulted, 30);
    const bureau = ivVsBins(loans.columns.bureau_score, loans.defaulted, 30);
    expect(noise).toHaveLength(29);
    expect(noise[28]!.iv).toBeGreaterThan(noise[0]!.iv);
    noise.forEach((p, i) => expect(bureau[i]!.iv).toBeGreaterThan(p.iv));
    [...noise, ...bureau].forEach((p) => expect(Number.isFinite(p.iv)).toBe(true));
  });
});
