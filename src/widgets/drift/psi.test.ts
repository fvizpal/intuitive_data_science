import { describe, expect, it } from 'vitest';
import { Phi, normalQuantile } from '../../lib/normal';
import { mulberry32 } from '../../lib/random';
import { auc } from '../separation/metrics';
import {
  PSI_INVESTIGATE,
  PSI_SIGNIFICANT,
  bandDefaultRates,
  binShares,
  driftedScores,
  equalWidthEdges,
  expectedNoisePsi,
  fadeRelationship,
  psi,
  psiBand,
  psiFromSamples,
  psiNormalExact,
  quantileEdges,
  shiftForPsi,
  tiltResample,
} from './psi';

const mean = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  return s / v.length;
};

const BASE = { mean: 640, sd: 60 };
const decileEdges = Array.from(
  { length: 9 },
  (_, i) => BASE.mean + BASE.sd * normalQuantile((i + 1) / 10),
);

describe('normalQuantile', () => {
  it('inverts Phi', () => {
    for (const p of [0.001, 0.02, 0.1, 0.5, 0.9, 0.975, 0.999]) {
      expect(Phi(normalQuantile(p))).toBeCloseTo(p, 6);
    }
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
  });
});

describe('psi: hand-checked values', () => {
  it('3 bins: [0.5, 0.3, 0.2] vs [0.4, 0.3, 0.3]', () => {
    const r = psi([0.5, 0.3, 0.2], [0.4, 0.3, 0.3])!;
    expect(r.contributions[0]).toBeCloseTo(0.02231, 4);
    expect(r.contributions[1]).toBeCloseTo(0, 12);
    expect(r.contributions[2]).toBeCloseTo(0.04055, 4);
    expect(r.total).toBeCloseTo(0.06286, 4);
  });

  it('4 bins: [0.4, 0.3, 0.2, 0.1] vs [0.25, 0.25, 0.25, 0.25]', () => {
    // bin 1: (0.25 - 0.40) * ln(0.25 / 0.40) = -0.15 * -0.470004 = 0.070501
    // bin 2: (0.25 - 0.30) * ln(0.25 / 0.30) = -0.05 * -0.182322 = 0.009116
    // bin 3: (0.25 - 0.20) * ln(0.25 / 0.20) =  0.05 *  0.223144 = 0.011157
    // bin 4: (0.25 - 0.10) * ln(0.25 / 0.10) =  0.15 *  0.916291 = 0.137444
    // total = 0.070501 + 0.009116 + 0.011157 + 0.137444 = 0.228218
    const r = psi([0.4, 0.3, 0.2, 0.1], [0.25, 0.25, 0.25, 0.25])!;
    expect(r.contributions[0]).toBeCloseTo(0.070501, 5);
    expect(r.contributions[1]).toBeCloseTo(0.009116, 5);
    expect(r.contributions[2]).toBeCloseTo(0.011157, 5);
    expect(r.contributions[3]).toBeCloseTo(0.137444, 5);
    expect(r.total).toBeCloseTo(0.228218, 5);
  });
});

describe('psi: properties', () => {
  const randomShares = (rng: () => number, k: number) => {
    const raw = Array.from({ length: k }, () => 0.01 + rng());
    const s = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / s);
  };

  it('is symmetric (the Swap button relies on this)', () => {
    const rng = mulberry32(5);
    for (let t = 0; t < 50; t++) {
      const e = randomShares(rng, 10);
      const a = randomShares(rng, 10);
      expect(Math.abs(psi(e, a)!.total - psi(a, e)!.total)).toBeLessThan(1e-12);
    }
  });

  it('is 0 for identical shares and never negative', () => {
    const rng = mulberry32(6);
    for (let t = 0; t < 100; t++) {
      const e = randomShares(rng, 7);
      const a = randomShares(rng, 7);
      expect(psi(e, e)!.total).toBe(0);
      expect(psi(e, a)!.total).toBeGreaterThanOrEqual(0);
      psi(e, a)!.contributions.forEach((c) => expect(c).toBeGreaterThanOrEqual(0));
    }
  });

  it('stays finite for zero-share bins, and rejects a length mismatch', () => {
    const r = psi([0.5, 0.5, 0], [0.5, 0, 0.5])!;
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.total).toBeGreaterThan(0);
    expect(psi([0.5, 0.5], [1 / 3, 1 / 3, 1 / 3])).toBeNull();
    expect(psi([], [])).toBeNull();
  });
});

describe('binning', () => {
  const base = driftedScores(1, 5000);

  it('quantileEdges: deciles hold about 10% each; shares sum to 1; outer bins catch the rest', () => {
    const edges = quantileEdges(base, 10);
    expect(edges).toHaveLength(9);
    const { shares } = binShares(base, edges);
    shares.forEach((s) => expect(Math.abs(s - 0.1)).toBeLessThan(0.005));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const far = binShares([-1000, 5000, 640], edges);
    expect(far.counts[0]).toBe(1);
    expect(far.counts[9]).toBe(1);
    expect(far.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('left-closed bins: a value equal to an edge goes to the upper bin', () => {
    expect(binShares([10, 20, 30], [20]).counts).toEqual([1, 2]);
  });

  it('collapses duplicate edges when ties merge bins', () => {
    const edges = quantileEdges([1, 1, 1, 1, 1, 1, 1, 1, 2, 3], 10);
    expect(edges.length).toBeLessThan(9);
    expect(new Set(edges).size).toBe(edges.length);
  });

  it('equalWidthEdges are evenly spaced between min and max', () => {
    const edges = equalWidthEdges([0, 100], 4);
    expect(edges).toEqual([25, 50, 75]);
  });

  it('quantile-edge PSI is unchanged by monotonic transforms; equal-width PSI is not', () => {
    // Continuous (unrounded) data, so interpolated edges cannot straddle a data point.
    const draw = (seed: number, shift: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 5000 }, () => {
        const u = 1 - rng();
        const v = rng();
        return 640 + shift + 60 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      });
    };
    const b = draw(11, 0);
    const t = draw(12, -20);
    const plain = psiFromSamples(b, t, quantileEdges(b, 10))!.total;

    const affine = (x: number) => 3 * x + 7;
    const b2 = b.map(affine);
    const t2 = t.map(affine);
    expect(psiFromSamples(b2, t2, quantileEdges(b2, 10))!.total).toBeCloseTo(plain, 3);

    const ex = (x: number) => Math.exp((x - 640) / 60);
    const b3 = b.map(ex);
    const t3 = t.map(ex);
    expect(psiFromSamples(b3, t3, quantileEdges(b3, 10))!.total).toBeCloseTo(plain, 3);

    const wPlain = psiFromSamples(b, t, equalWidthEdges(b, 10))!.total;
    const wExp = psiFromSamples(b3, t3, equalWidthEdges(b3, 10))!.total;
    expect(Math.abs(wPlain - wExp)).toBeGreaterThan(1e-3);
  });
});

describe('normal theory', () => {
  const at = (shift: number, sd = 60) =>
    psiNormalExact(decileEdges, BASE, { mean: 640 + shift, sd })!;

  it('mean shifts', () => {
    const p20 = at(-20);
    const p30 = at(-30);
    console.log(
      'PSI exact: shift -20 =',
      p20,
      ' shift -30 =',
      p30,
      ' shift +20 =',
      at(20),
    );
    expect(at(0)).toBeCloseTo(0, 6);
    expect(Math.abs(p20 - 0.107)).toBeLessThan(0.01);
    expect(p20).toBeLessThanOrEqual((20 / 60) ** 2);
    expect(p30).toBeGreaterThan(0.22);
    expect(p30).toBeLessThan(0.26);
    expect(Math.abs(at(20) - p20)).toBeLessThan(1e-6);
  });

  it('spread: at most the continuous Jeffreys divergence', () => {
    const s = 1.3;
    const p = at(0, 60 * s);
    console.log(
      'PSI exact: spread x1.3 =',
      p,
      ' continuous bound =',
      (s * s - 1) ** 2 / (2 * s * s),
    );
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual((s * s - 1) ** 2 / (2 * s * s));
  });

  it('shiftForPsi finds where PSI reaches 0.1 and 0.25', () => {
    const s1 = shiftForPsi(PSI_INVESTIGATE, decileEdges, BASE)!;
    const s2 = shiftForPsi(PSI_SIGNIFICANT, decileEdges, BASE)!;
    console.log('shift for PSI 0.1 =', s1, ' for 0.25 =', s2);
    expect(s1).toBeGreaterThan(17);
    expect(s1).toBeLessThan(22);
    expect(s2).toBeGreaterThan(28);
    expect(s2).toBeLessThan(33);
    expect(shiftForPsi(1e6, decileEdges, BASE)).toBeNull();
  });
});

describe('noise theory', () => {
  const base = driftedScores(100, 5000);
  const edges = quantileEdges(base, 10);
  const replicates = (n: number) =>
    Array.from(
      { length: 400 },
      (_, r) => psiFromSamples(base, driftedScores(1000 + r, n), edges)!.total,
    );

  it('mean PSI follows (k - 1)(1/nActual + 1/nExpected)', () => {
    const m1000 = mean(replicates(1000));
    const m200 = mean(replicates(200));
    console.log('noise mean n=1000:', m1000, 'theory', expectedNoisePsi(10, 5000, 1000));
    console.log('noise mean n=200:', m200, 'theory', expectedNoisePsi(10, 5000, 200));
    expect(expectedNoisePsi(10, 5000, 1000)).toBeCloseTo(0.0108, 6);
    expect(Math.abs(m1000 / 0.0108 - 1)).toBeLessThan(0.15);
    expect(Math.abs(m200 / expectedNoisePsi(10, 5000, 200) - 1)).toBeLessThan(0.25);
  });

  it('at 100 loans a month, noise alone often crosses 0.1', () => {
    const r = replicates(100);
    const share = r.filter((p) => p > 0.1).length / r.length;
    console.log('share of 100-loan months above 0.1 with no change:', share);
    expect(share).toBeGreaterThan(0.05);
  });
});

describe('driftedScores', () => {
  it('is deterministic per seed and yields finite integers', () => {
    const a = driftedScores(3, 2000, { shift: -20 });
    expect(driftedScores(3, 2000, { shift: -20 })).toEqual(a);
    expect(driftedScores(4, 2000, { shift: -20 })).not.toEqual(a);
    a.forEach((v) => {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  it('a shift of -20 moves the mean about 20 points', () => {
    const s = driftedScores(8, 5000, { shift: -20 });
    expect(Math.abs(mean(s) - 620)).toBeLessThan(3);
  });

  it('uses common random numbers: moving the shift slides the same applicants', () => {
    const a = driftedScores(9, 3000, { shift: 0 });
    const b = driftedScores(9, 3000, { shift: -35 });
    for (let i = 0; i < a.length; i++)
      expect(Math.abs(a[i]! - 35 - b[i]!)).toBeLessThanOrEqual(1);
    // and so does the spread
    const c = driftedScores(9, 3000, { spreadMult: 1.5 });
    for (let i = 0; i < a.length; i++)
      expect(Math.abs(c[i]! - 640 - 1.5 * (a[i]! - 640))).toBeLessThanOrEqual(1.5);
  });

  it('a new segment of 20% pulls the average down and replaces about 20% of applicants', () => {
    const plain = driftedScores(10, 5000);
    const withSeg = driftedScores(10, 5000, { newSegmentShare: 0.2 });
    const changed = withSeg.filter((v, i) => v !== plain[i]).length / 5000;
    expect(changed).toBeGreaterThan(0.17);
    expect(changed).toBeLessThan(0.23);
    expect(Math.abs(mean(withSeg) - 620)).toBeLessThan(3);
  });
});

describe('tiltResample', () => {
  const rng = mulberry32(21);
  const scores = Array.from(
    { length: 4000 },
    () => 600 + 80 * (rng() + rng() + rng() - 1.5),
  );
  const rows = scores.map((s, i) => ({ id: i, s }));

  it('tilt 0 keeps the mean; negative tilt lowers it', () => {
    const m0 = mean(tiltResample(rows, scores, 0, 5000, 1).map((r) => r.s));
    const mNeg = mean(tiltResample(rows, scores, -1, 5000, 1).map((r) => r.s));
    expect(Math.abs(m0 - mean(scores))).toBeLessThan(3);
    expect(mNeg).toBeLessThan(m0 - 10);
  });

  it('is deterministic per seed and does not touch its input', () => {
    const copy = rows.map((r) => ({ ...r }));
    const a = tiltResample(rows, scores, -0.5, 100, 7);
    expect(tiltResample(rows, scores, -0.5, 100, 7)).toEqual(a);
    expect(tiltResample(rows, scores, -0.5, 100, 8)).not.toEqual(a);
    expect(rows).toEqual(copy);
  });

  it('gives missing scores weight 1 and survives empty input', () => {
    const withNaN = [NaN, 1, 2, 3];
    const out = tiltResample(['a', 'b', 'c', 'd'], withNaN, -1, 50, 2);
    expect(out).toHaveLength(50);
    expect(tiltResample([], [], -1, 10, 1)).toEqual([]);
  });
});

describe('fadeRelationship', () => {
  const rng = mulberry32(31);
  const n = 20000;
  // An informative score: goods centred higher than bads, about 4% bad.
  const flags = Array.from({ length: n }, () => (rng() < 0.96 ? 1 : 0));
  const scores = flags.map(
    (f) => (f ? 640 : 560) + 60 * (rng() + rng() + rng() - 1.5) * 2,
  );
  const split = (fl: number[]) => ({
    goods: scores.filter((_, i) => fl[i]),
    bads: scores.filter((_, i) => !fl[i]),
  });

  it('fade 0 changes nothing', () => {
    expect(fadeRelationship(flags, 0, 1, 0.96)).toEqual(flags);
  });

  it('fade 1 makes the score useless but keeps the default rate', () => {
    const before = split(flags);
    const faded = fadeRelationship(flags, 1, 1, mean(flags));
    const after = split(faded);
    const a0 = auc(before.goods, before.bads)!;
    const a1 = auc(after.goods, after.bads)!;
    console.log('AUC before fade', a0, 'after full fade', a1);
    expect(a0).toBeGreaterThan(0.8);
    expect(Math.abs(a1 - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(mean(faded) - mean(flags))).toBeLessThan(0.005);
  });

  it('is deterministic per seed', () => {
    expect(fadeRelationship(flags, 0.5, 4, 0.96)).toEqual(
      fadeRelationship(flags, 0.5, 4, 0.96),
    );
    expect(fadeRelationship(flags, 0.5, 4, 0.96)).not.toEqual(
      fadeRelationship(flags, 0.5, 5, 0.96),
    );
  });
});

describe('edge cases', () => {
  it('empty arrays give null or an explicit empty state', () => {
    expect(psiFromSamples([], [1, 2, 3], [2])).toBeNull();
    expect(psiFromSamples([1, 2, 3], [], [2])).toBeNull();
    expect(quantileEdges([], 10)).toEqual([]);
    expect(equalWidthEdges([], 10)).toEqual([]);
    expect(binShares([], [1, 2])).toEqual({ counts: [0, 0, 0], shares: [0, 0, 0], n: 0 });
    expect(driftedScores(1, 0)).toEqual([]);
  });

  it('a zero-variance baseline collapses to one bin with PSI 0', () => {
    const flat = new Array<number>(100).fill(640);
    expect(quantileEdges(flat, 10)).toEqual([]);
    expect(equalWidthEdges(flat, 10)).toEqual([]);
    const r = psiFromSamples(flat, [600, 640, 700], [])!;
    expect(r.total).toBe(0);
    expect(r.contributions).toHaveLength(1);
  });

  it('never returns NaN or Infinity', () => {
    const base = driftedScores(2, 500);
    const edges = quantileEdges(base, 10);
    const r = psiFromSamples(base, [Infinity, NaN, 1e9, -1e9, 640], edges)!;
    expect(Number.isFinite(r.total)).toBe(true);
    expect(psi([NaN, 1], [0.5, 0.5])).toBeNull();
    expect(Number.isFinite(expectedNoisePsi(0, 0, 0))).toBe(true);
    expect(psiBand(0.0999)).toBe('stable');
    expect(psiBand(0.1)).toBe('investigate');
    expect(psiBand(0.25)).toBe('significant shift');
  });
});

describe('bandDefaultRates', () => {
  it('gives the share of bads (flag 0) in each slice, null when a slice is empty', () => {
    const scores = [1, 2, 3, 11, 12, 13];
    const flags = [0, 1, 1, 0, 0, 1];
    expect(bandDefaultRates(scores, flags, [10])).toEqual([1 / 3, 2 / 3]);
    expect(bandDefaultRates([1, 2], [1, 0], [10, 20])).toEqual([0.5, null, null]);
  });
});
