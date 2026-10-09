import { describe, expect, it } from 'vitest';
import {
  bootstrap,
  fmt,
  genCorrelated,
  mean,
  ols1,
  ols2,
  pearson,
  rank,
  rectangleParts,
  spearman,
  std,
} from './corr';
import { incomeLoan, pvsDataset, twinData } from './data';
import { mulberry32, normal } from '../../lib/random';

const xs = [1, 2, 3, 4, 5, 6, 7, 8];

describe('mean and std', () => {
  it('computes the sample statistics', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(std([2, 4, 6])).toBe(2);
  });

  it('handles empty and single inputs without NaN', () => {
    expect(mean([])).toBe(0);
    expect(std([5])).toBe(0);
  });
});

describe('pearson', () => {
  it('is 1 and −1 for perfectly linear data', () => {
    expect(
      pearson(
        xs,
        xs.map((x) => 3 * x + 2),
      ),
    ).toBeCloseTo(1, 12);
    expect(
      pearson(
        xs,
        xs.map((x) => -0.5 * x + 9),
      ),
    ).toBeCloseTo(-1, 12);
  });

  it('is invariant to affine transforms', () => {
    const pts = genCorrelated(7, 50, 0.4);
    const x = pts.map((p) => p.x);
    const y = pts.map((p) => p.y);
    const r = pearson(x, y);
    expect(
      pearson(
        x.map((v) => 5 * v - 3),
        y.map((v) => 0.2 * v + 100),
      ),
    ).toBeCloseTo(r, 10);
    expect(
      pearson(
        x.map((v) => -2 * v),
        y,
      ),
    ).toBeCloseTo(-r, 10);
  });

  it('is about 0 for a symmetric U-shape', () => {
    const x = Array.from({ length: 41 }, (_, i) => -1 + i / 20);
    expect(
      Math.abs(
        pearson(
          x,
          x.map((v) => v * v),
        ),
      ),
    ).toBeLessThan(1e-10);
  });

  it('returns 0 instead of NaN for constant input', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe('rank', () => {
  it('ranks from 1', () => {
    expect(rank([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it('averages ties', () => {
    expect(rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(rank([5, 5, 5])).toEqual([2, 2, 2]);
  });
});

describe('spearman', () => {
  it('is 1 for y = exp(x)', () => {
    expect(spearman(xs, xs.map(Math.exp))).toBeCloseTo(1, 12);
  });

  it('is invariant to monotonic transforms', () => {
    const pts = genCorrelated(3, 60, 0.5);
    const x = pts.map((p) => p.x);
    const y = pts.map((p) => p.y);
    const rho = spearman(x, y);
    expect(
      spearman(
        x.map(Math.exp),
        y.map((v) => v ** 3),
      ),
    ).toBeCloseTo(rho, 12);
  });

  it('matches 1 − 6Σd²/(n(n²−1)) without ties', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 1, 4, 3, 5];
    const d2 = x.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0);
    expect(spearman(x, y)).toBeCloseTo(1 - (6 * d2) / (5 * 24), 12);
  });
});

describe('genCorrelated', () => {
  it('is reproducible for a seed', () => {
    expect(genCorrelated(1, 10, 0.3)).toEqual(genCorrelated(1, 10, 0.3));
  });

  it('lands near the target correlation', () => {
    const pts = genCorrelated(11, 2000, 0.6);
    expect(
      pearson(
        pts.map((p) => p.x),
        pts.map((p) => p.y),
      ),
    ).toBeCloseTo(0.6, 1);
  });

  it('hits the target exactly in exact mode', () => {
    for (const rho of [-0.9, -0.3, 0, 0.5, 1]) {
      const pts = genCorrelated(5, 40, rho, { exact: true });
      expect(
        pearson(
          pts.map((p) => p.x),
          pts.map((p) => p.y),
        ),
      ).toBeCloseTo(rho, 10);
    }
  });
});

describe('ols', () => {
  const rng = mulberry32(42);
  const x1 = Array.from({ length: 200 }, () => normal(rng));
  const x2 = Array.from({ length: 200 }, () => normal(rng));

  it('recovers known coefficients on clean data', () => {
    const y = x1.map((v, i) => 2 * v - 3 * x2[i]! + 7);
    const fit = ols2(x1, x2, y);
    expect(fit.beta1).toBeCloseTo(2, 8);
    expect(fit.beta2).toBeCloseTo(-3, 8);
    expect(fit.singular).toBe(false);
    expect(
      ols1(
        x1,
        x1.map((v) => 4 * v + 1),
      ),
    ).toBeCloseTo(4, 10);
  });

  it('does not blow up when x2 = x1 exactly', () => {
    const y = x1.map((v) => 2 * v);
    const fit = ols2(x1, x1, y);
    expect(Number.isFinite(fit.beta1)).toBe(true);
    expect(Number.isFinite(fit.beta2)).toBe(true);
    expect(fit.singular).toBe(true);
    expect(fit.beta1 + fit.beta2).toBeCloseTo(2, 4);
  });

  it('returns zeros for constant features', () => {
    const fit = ols2([1, 1, 1], [2, 2, 2], [1, 2, 3]);
    expect(fit).toEqual({ beta1: 0, beta2: 0, singular: true });
  });
});

describe('bootstrap', () => {
  it('resamples with replacement, reproducibly', () => {
    const idx = Array.from({ length: 50 }, (_, i) => i);
    const a = bootstrap(idx, 9);
    expect(a).toHaveLength(50);
    expect(a.every((i) => i >= 0 && i < 50)).toBe(true);
    expect(new Set(a).size).toBeLessThan(50);
    expect(bootstrap(idx, 9)).toEqual(a);
  });
});

describe('rectangleParts', () => {
  it('agree − disagree equals Pearson r', () => {
    const pts = genCorrelated(2, 40, 0.35);
    const parts = rectangleParts(pts);
    expect(parts.agree).toBeGreaterThan(0);
    expect(parts.disagree).toBeGreaterThan(0);
    expect(parts.agree - parts.disagree).toBeCloseTo(
      pearson(
        pts.map((p) => p.x),
        pts.map((p) => p.y),
      ),
      12,
    );
  });
});

describe('fmt', () => {
  it('never shows NaN or Infinity, and avoids −0.00', () => {
    expect(fmt(NaN)).toBe('—');
    expect(fmt(Infinity)).toBe('—');
    expect(fmt(-0.001)).toBe('0.00');
    expect(fmt(-0.5)).toBe('−0.50');
  });
});

describe('page datasets', () => {
  const corr = (id: Parameters<typeof pvsDataset>[0]) => {
    const pts = pvsDataset(id, 1);
    const x = pts.map((p) => p.x);
    const y = pts.map((p) => p.y);
    return { p: pearson(x, y), s: spearman(x, y) };
  };

  it('exponential: Spearman 1, Pearson visibly lower', () => {
    const { p, s } = corr('curved');
    expect(s).toBeCloseTo(1, 12);
    expect(p).toBeLessThan(0.9);
  });

  it('outlier: Pearson high, Spearman near 0', () => {
    const { p, s } = corr('outlier');
    expect(p).toBeGreaterThan(0.6);
    expect(Math.abs(s)).toBeLessThan(0.25);
  });

  it('U-shape: both near 0', () => {
    const { p, s } = corr('ushape');
    expect(Math.abs(p)).toBeLessThan(0.15);
    expect(Math.abs(s)).toBeLessThan(0.2);
  });

  it('twin features: betas swing when x2 copies x1, sum stays stable', () => {
    const d = twinData(1, 0.98);
    const idx = d.y.map((_, i) => i);
    const fits = Array.from({ length: 20 }, (_, k) => {
      const b = bootstrap(idx, 100 + k);
      return ols2(
        b.map((i) => d.x1[i]!),
        b.map((i) => d.x2[i]!),
        b.map((i) => d.y[i]!),
      );
    });
    const b1 = fits.map((f) => f.beta1);
    const sum = fits.map((f) => f.beta1 + f.beta2);
    expect(std(b1)).toBeGreaterThan(3 * std(sum));
  });

  it('log scale changes Pearson but not Spearman for income vs loan', () => {
    const { income, loan } = incomeLoan(1);
    const raw = pearson(income, loan);
    const logged = pearson(income.map(Math.log), loan.map(Math.log));
    expect(logged - raw).toBeGreaterThan(0.05);
    expect(spearman(income.map(Math.log), loan.map(Math.log))).toBeCloseTo(
      spearman(income, loan),
      12,
    );
  });
});
