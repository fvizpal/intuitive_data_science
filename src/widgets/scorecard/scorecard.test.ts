import { describe, expect, it } from 'vitest';
import { generateLoans } from '../../lib/loanData';
import { mulberry32, normal } from '../../lib/random';
import { binFeature, computeBins, isMonotonic } from '../woe-iv/woe';
import { BIN_SPECS } from './bins';
import coefsFixture from './fixtures/coefs.json';
import { SCORECARD_SEED, getFitted } from './pipeline';
import {
  DEFAULT_SCALE,
  applicantScore,
  applicantScoreExact,
  binPoints,
  cutoffStats,
  evidenceStack,
  fitLogistic,
  logOddsFromScore,
  pdFromScore,
  reasonCodes,
  scaling,
  scoreAll,
  scoreFromLogOdds,
  scoreHistogram,
} from './scorecard';
import type { PointsTable } from './scorecard';
import { correlation, fitWithTwin, twinCopies } from './twin';

const fitted = getFitted(SCORECARD_SEED);
const scale = scaling(DEFAULT_SCALE);

describe('fixed bins (seed 42)', () => {
  const loans = generateLoans(42);
  for (const spec of BIN_SPECS) {
    const idx = binFeature(loans.columns[spec.key], spec.edges);
    const bins = computeBins(idx, loans.defaulted, {
      nBins: spec.edges.length,
      missingIndex: spec.edges.length - 1,
    });
    const numeric = bins.slice(0, spec.labels.length);

    it(`${spec.key}: WoE moves one way across the numeric bins`, () => {
      const woes = numeric.map((b) => b.woe);
      expect(isMonotonic(woes)).toBe(true);
      const rising = (woes.at(-1) as number) > (woes[0] as number);
      expect(rising).toBe(spec.direction === 'higher-safer');
    });

    it(`${spec.key}: every numeric bin has >= 5% of people and >= 30 defaulters`, () => {
      for (const b of numeric) {
        expect(b.pctOfPopulation).toBeGreaterThanOrEqual(0.05);
        expect(b.bad).toBeGreaterThanOrEqual(30);
      }
    });

    it(`${spec.key}: a Missing bin exists only where the feature has missing values`, () => {
      const missing = bins[spec.edges.length - 1]!;
      expect(missing.count > 0).toBe(spec.missingLabel !== null);
    });
  }
});

describe('scaling', () => {
  it('defaults: factor ~28.854, offset ~487.12', () => {
    expect(scale.factor).toBeCloseTo(28.854, 2);
    expect(scale.offset).toBeCloseTo(487.12, 2);
  });

  it('score 600 at 50:1, +20 per doubling, ~578.8 at 24:1', () => {
    const at = (odds: number) => scoreFromLogOdds(Math.log(odds), scale);
    expect(at(50)).toBeCloseTo(600, 9);
    expect(at(100) - at(50)).toBeCloseTo(20, 9);
    expect(at(24)).toBeCloseTo(578.8, 1);
  });

  it('logOddsFromScore inverts scoreFromLogOdds; PD falls as score rises', () => {
    for (const lo of [-2, 0, 1.5, 3.2, 6]) {
      expect(logOddsFromScore(scoreFromLogOdds(lo, scale), scale)).toBeCloseTo(lo, 10);
    }
    let prev = 1;
    for (let s = 400; s <= 800; s += 25) {
      const pd = pdFromScore(s, scale);
      expect(pd).toBeLessThan(prev);
      prev = pd;
    }
    expect(pdFromScore(600, scale)).toBeCloseTo(1 / 51, 10);
  });
});

describe('fitLogistic', () => {
  it('recovers known coefficients on a large synthetic dataset', () => {
    const rng = mulberry32(7);
    const truth = { b0: 1.2, b: [0.8, -0.5, 1.5] };
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 40000; i++) {
      const row = [normal(rng), normal(rng), normal(rng)];
      const z = truth.b0 + row.reduce((s, v, j) => s + v * truth.b[j]!, 0);
      X.push(row);
      y.push(rng() < 1 / (1 + Math.exp(-z)) ? 1 : 0);
    }
    const m = fitLogistic(X, y);
    expect(m.converged).toBe(true);
    expect(Math.abs(m.intercept - truth.b0)).toBeLessThan(0.05);
    truth.b.forEach((b, j) => expect(Math.abs(m.coefs[j]! - b)).toBeLessThan(0.05));
  });

  it('gives positive coefficients on the real WoE features', () => {
    expect(fitted.model.converged).toBe(true);
    for (const c of fitted.model.coefs) expect(c).toBeGreaterThan(0);
  });

  it('stays finite under perfect separation', () => {
    const m = fitLogistic([[-1], [-2], [1], [2]], [0, 0, 1, 1]);
    expect(Number.isFinite(m.intercept) && m.coefs.every(Number.isFinite)).toBe(true);
  });

  it('matches the statsmodels fixture within 1e-3', () => {
    expect(coefsFixture.seed).toBe(SCORECARD_SEED);
    expect(coefsFixture.features).toEqual(BIN_SPECS.map((s) => s.key));
    expect(Math.abs(fitted.model.intercept - coefsFixture.intercept)).toBeLessThan(1e-3);
    coefsFixture.coefs.forEach((c, j) =>
      expect(Math.abs(fitted.model.coefs[j]! - c)).toBeLessThan(1e-3),
    );
  });
});

describe('near-duplicate feature', () => {
  it('splits the credit between the two copies', () => {
    const single = fitted.model.coefs[0]!;
    const { model, twinCorrelation } = fitWithTwin(fitted, 0.95);
    expect(twinCorrelation).toBeGreaterThan(0.93);
    expect(twinCorrelation).toBeLessThan(0.97);
    const a = model.coefs[0]!;
    const b = model.coefs[4]!;
    expect(a).toBeLessThan(single);
    expect(b).toBeLessThan(single);
    expect(Math.abs(a + b - single)).toBeLessThan(0.25 * single);
  });

  it('stays finite and splits evenly with an exact duplicate', () => {
    const { model } = fitWithTwin(fitted, 1);
    expect([model.intercept, ...model.coefs].every(Number.isFinite)).toBe(true);
    expect(model.coefs[0]!).toBeCloseTo(model.coefs[4]!, 3);
    expect(model.coefs[0]! + model.coefs[4]!).toBeCloseTo(fitted.model.coefs[0]!, 2);
  });

  it('twinCopies hits the requested correlation', () => {
    const col = fitted.X.map((r) => r[0]!);
    const [a, b] = twinCopies(col, 0.95, 1);
    expect(Math.abs(correlation(a, b) - 0.95)).toBeLessThan(0.02);
  });
});

describe('points', () => {
  const table = binPoints(fitted.model, fitted.bins, scale);

  it('sum of unrounded points equals the exact score; rounded sum is within n/2', () => {
    const n = table.features.length;
    for (const picks of [
      [0, 0, 0, 0],
      [3, 3, 3, 3],
      [1, 2, 0, 3],
      [4, 0, 1, 4],
    ]) {
      const exact = applicantScoreExact(table, picks);
      const logOdds =
        fitted.model.intercept +
        picks.reduce(
          (s, p, j) => s + fitted.model.coefs[j]! * fitted.bins[j]!.stats[p]!.woe,
          0,
        );
      expect(exact).toBeCloseTo(scoreFromLogOdds(logOdds, scale), 8);
      expect(Math.abs(applicantScore(table, picks).total - exact)).toBeLessThanOrEqual(
        n / 2,
      );
    }
  });

  it('points are integers and the average score is near the 24:1 score', () => {
    for (const f of table.features) {
      for (const p of f.points) expect(Number.isInteger(p)).toBe(true);
    }
    const scores = scoreAll(fitted.loans.columns, table, fitted.bins);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    expect(mean).toBeGreaterThan(560);
    expect(mean).toBeLessThan(640);
  });

  it('reasonCodes names the features that lose the most points', () => {
    const mk = (key: string, points: number[]) => ({
      key,
      label: key,
      binLabels: ['low', 'mid', 'high'],
      available: [true, true, true],
      exact: points,
      points,
    });
    const t: PointsTable = {
      scaling: scale,
      features: [mk('A', [10, 31, 41]), mk('B', [20, 31, 41]), mk('C', [30, 32, 42])],
    };
    // Lowest bin everywhere: gaps are A 31, B 21, C 12.
    const codes = reasonCodes(t, [0, 0, 0], 2);
    expect(codes.map((c) => c.key)).toEqual(['A', 'B']);
    expect(codes[0]!.gap).toBe(31);
    expect(codes[0]!.text).toContain('A: low costs 31 points versus the best bin');
    expect(reasonCodes(t, [0, 0, 0], 1).map((c) => c.key)).toEqual(['A']);
    expect(reasonCodes(t, [2, 2, 2])).toEqual([]);
    expect(reasonCodes(t, [2, 1, 0]).map((c) => c.key)).toEqual(['C', 'B']);
  });

  it('reasonCodes ignores empty bins when finding the best bin', () => {
    const t: PointsTable = {
      scaling: scale,
      features: [
        {
          key: 'A',
          label: 'A',
          binLabels: ['low', 'high', 'Missing'],
          available: [true, true, false],
          exact: [],
          points: [10, 20, 999],
        },
      ],
    };
    expect(reasonCodes(t, [0])[0]!.gap).toBe(10);
  });
});

describe('cutoffStats and histogram', () => {
  const table = binPoints(fitted.model, fitted.bins, scale);
  const scores = scoreAll(fitted.loans.columns, table, fitted.bins);
  const flags = fitted.loans.defaulted;
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);

  it('raising the cutoff never raises the approval rate', () => {
    let prev = 1;
    for (let c = lo - 5; c <= hi + 5; c += 3) {
      const { approvalRate } = cutoffStats(scores, flags, c);
      expect(approvalRate).toBeLessThanOrEqual(prev);
      prev = approvalRate;
    }
  });

  it('approves everyone below every score and nobody above, all finite', () => {
    const all = cutoffStats(scores, flags, lo - 1);
    expect(all.approvalRate).toBe(1);
    expect(all.badsRejectedShare).toBe(0);
    const none = cutoffStats(scores, flags, hi + 1);
    expect(none.approvalRate).toBe(0);
    expect(none.badRateApproved).toBe(0);
    expect(none.badsRejectedShare).toBe(1);
    for (const v of [...Object.values(all), ...Object.values(none)]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('a higher cutoff lowers the bad rate among approved', () => {
    const lowCut = cutoffStats(scores, flags, lo).badRateApproved;
    const highCut = cutoffStats(scores, flags, lo + (hi - lo) * 0.6).badRateApproved;
    expect(highCut).toBeLessThan(lowCut);
  });

  it('histograms of goods and bads each sum to 1', () => {
    const h = scoreHistogram(scores, flags, 30);
    expect(h.goods.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    expect(h.bads.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    expect(scoreHistogram([], [], 5).goods).toHaveLength(5);
  });
});

describe('evidenceStack', () => {
  it('returns the starting odds when all WoE are zero', () => {
    const r = evidenceStack(24, [0, 0, 0, 0]);
    expect(r.finalOdds).toBeCloseTo(24, 10);
    expect(r.finalPd).toBeCloseTo(1 / 25, 10);
  });

  it('adds evidence in log-odds and keeps every output finite', () => {
    const r = evidenceStack(24, [0.64, -0.69, 1.2, -3]);
    expect(r.steps[0]!.oddsFactor).toBeCloseTo(Math.exp(0.64), 10);
    expect(r.finalLogOdds).toBeCloseTo(Math.log(24) + 0.64 - 0.69 + 1.2 - 3, 10);
    const nums = [
      r.startLogOdds,
      r.finalOdds,
      r.finalPd,
      ...r.steps.flatMap((s) => [s.woe, s.oddsFactor, s.logOdds, s.odds]),
    ];
    expect(nums.every(Number.isFinite)).toBe(true);
  });
});
