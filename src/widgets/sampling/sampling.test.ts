import { describe, expect, it } from 'vitest';
import {
  POP_META,
  POP_SIZE,
  bulbs,
  cafe,
  commute,
  cricket,
  dice,
  getPopulation,
  views,
  type PopId,
} from '../../lib/populations';
import { skewness } from '../averages/stats';
import {
  BELL_CLOSE,
  BELL_FAR,
  bellGap,
  bellReading,
  drawSample,
  expectedZeroShare,
  needForTenEvents,
  normalBelowZero,
  popMean,
  popSd,
  proportionSamples,
  sampleMeansMatrix,
  sdOf,
  se,
  shareWithin,
  meanOf,
} from './sampling';

const SEED = 1;
const REPS = 2000;
const IDS: PopId[] = ['commute', 'cricket', 'dice', 'cafe', 'views', 'bulbs'];

describe('exact enumeration on dice', () => {
  const faces = [1, 2, 3, 4, 5, 6];
  const sd = popSd(faces);

  it('popSd([1..6]) = sqrt(35/12)', () => {
    expect(Math.abs(sd - 1.70783)).toBeLessThan(1e-5);
    expect(Math.abs(sd - Math.sqrt(35 / 12))).toBeLessThan(1e-12);
  });

  it('all 36 ordered pairs: SD of the means = sigma / sqrt(2)', () => {
    const means: number[] = [];
    for (const a of faces) for (const b of faces) means.push((a + b) / 2);
    expect(means).toHaveLength(36);
    expect(Math.abs(meanOf(means)! - 3.5)).toBeLessThan(1e-12);
    expect(Math.abs(sdOf(means, false)! - sd / Math.sqrt(2))).toBeLessThan(1e-12);
  });

  it('all 216 ordered triples: SD of the means = sigma / sqrt(3)', () => {
    const means: number[] = [];
    for (const a of faces)
      for (const b of faces) for (const c of faces) means.push((a + b + c) / 3);
    expect(means).toHaveLength(216);
    expect(Math.abs(meanOf(means)! - 3.5)).toBeLessThan(1e-12);
    expect(Math.abs(sdOf(means, false)! - sd / Math.sqrt(3))).toBeLessThan(1e-12);
  });
});

describe('determinism and the matrix', () => {
  it('every population is the same for the same seed, and differs across seeds', () => {
    for (const id of IDS) {
      expect(getPopulation(id, 5)).toHaveLength(POP_SIZE);
      expect(getPopulation(id, 5)).toBe(getPopulation(id, 5));
    }
    // Rebuilding from scratch (fresh seed values) gives equal numbers.
    const a = commute(901);
    const b = commute(901);
    expect(a).toEqual(b);
    expect(commute(902)).not.toEqual(a);
  });

  it('drawSample is deterministic and only returns population values', () => {
    for (const id of IDS) {
      const pop = getPopulation(id, SEED);
      const s1 = drawSample(pop, 30, 7);
      expect(drawSample(pop, 30, 7)).toEqual(s1);
      expect(s1).toHaveLength(30);
      const set = new Set(pop);
      expect(s1.every((v) => set.has(v))).toBe(true);
    }
    expect(drawSample(commute(SEED), 30, 8)).not.toEqual(
      drawSample(commute(SEED), 30, 7),
    );
  });

  it('the matrix is memoized per population and seed', () => {
    const pop = commute(SEED);
    const m1 = sampleMeansMatrix(pop, 800, REPS, SEED)!;
    expect(sampleMeansMatrix(pop, 800, REPS, SEED)).toBe(m1);
    expect(sampleMeansMatrix(pop, 800, REPS, SEED + 1)).not.toBe(m1);
  });

  it('first n columns are a prefix of the first m columns (common random numbers)', () => {
    const pop = commute(SEED);
    const m = sampleMeansMatrix(pop, 800, REPS, SEED)!;
    for (const n of [1, 5, 25, 100, 800]) {
      const means = m.meansForN(n)!;
      for (const r of [0, 1, 777, REPS - 1]) {
        let sum = 0;
        for (let c = 0; c < n; c++) sum += pop[m.idx[r * m.maxN + c]!]!;
        expect(Math.abs(means[r]! * n - sum)).toBeLessThan(1e-9);
      }
    }
    // a smaller maxN gives the same first columns
    const small = sampleMeansMatrix(pop, 100, REPS, SEED)!;
    expect(Array.from(small.meansForN(25)!.slice(0, 50))).toEqual(
      Array.from(m.meansForN(25)!.slice(0, 50)),
    );
    // "sample number r + 1" at n = 25 is what the widgets display
    expect(m.sampleValues(3, 25).reduce((a, b) => a + b, 0) / 25).toBeCloseTo(
      m.meansForN(25)![3]!,
      9,
    );
  });
});

describe('population targets', () => {
  it('commute: mean near 32 and a right skew', () => {
    const pop = commute(SEED);
    expect(Math.abs(popMean(pop) - 32)).toBeLessThan(1);
    expect(skewness(pop)).toBeGreaterThan(1.0);
    expect(Math.min(...pop)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...pop)).toBeLessThanOrEqual(180);
  });
  it('cricket: about 12% ducks and a long tail', () => {
    const pop = cricket(SEED);
    const zeros = pop.filter((v) => v === 0).length / pop.length;
    expect(zeros).toBeGreaterThan(0.1);
    expect(zeros).toBeLessThan(0.14);
    expect(skewness(pop)).toBeGreaterThan(1.0);
  });
  it('dice: mean near 3.5', () => {
    expect(Math.abs(popMean(dice(SEED)) - 3.5)).toBeLessThan(0.05);
  });
  it('cafe: mean between the two humps', () => {
    const m = popMean(cafe(SEED));
    expect(m).toBeGreaterThan(15.5);
    expect(m).toBeLessThan(17.5);
  });
  it('views: a heavy right tail', () => {
    expect(skewness(views(SEED))).toBeGreaterThan(3);
  });
  it('bulbs: exactly 400 faulty', () => {
    const pop = bulbs(SEED);
    expect(pop.filter((v) => v === 1).length).toBe(400);
    expect(pop.filter((v) => v === 0).length).toBe(9600);
  });
  it('every population has a plain shape description', () => {
    for (const id of IDS) expect(POP_META[id].shape.length).toBeGreaterThan(5);
  });
});

describe('the spread rule', () => {
  const pop = commute(SEED);
  const m = sampleMeansMatrix(pop, 800, REPS, SEED)!;
  const sdAt = (n: number) => sdOf(m.meansForN(n)!)!;

  it('SD of the averages is within 6% of sigma / sqrt(n)', () => {
    for (const n of [5, 10, 25, 100, 400, 800]) {
      expect(Math.abs(sdAt(n) / se(pop, n) - 1)).toBeLessThan(0.06);
    }
  });
  it('4 times as many people halves the spread (within 8%)', () => {
    expect(Math.abs(sdAt(400) / sdAt(100) - 0.5) / 0.5).toBeLessThan(0.08);
  });
  it('averages centre on the population mean', () => {
    const c = meanOf(m.meansForN(25)!)!;
    expect(Math.abs(c / popMean(pop) - 1)).toBeLessThan(0.01);
  });
  it('about 95% of averages fall within 2 standard errors', () => {
    const share = shareWithin(m.meansForN(100)!, popMean(pop), 2 * se(pop, 100))!;
    expect(share).toBeGreaterThan(0.93);
    expect(share).toBeLessThan(0.97);
  });
  it('the averages lose their skew as n grows', () => {
    expect(skewness(Array.from(m.meansForN(25)!))).toBeGreaterThan(0.15);
    expect(skewness(Array.from(m.meansForN(25)!))).toBeLessThan(0.6);
    expect(skewness(Array.from(m.meansForN(100)!))).toBeLessThan(0.35);
  });
});

describe('shape and calibration', () => {
  const gapOf = (id: PopId, n: number) => {
    const m = sampleMeansMatrix(getPopulation(id, SEED), 800, REPS, SEED)!;
    return bellGap(m.meansForN(n)!);
  };
  const label = (id: PopId, n: number) => bellReading(gapOf(id, n));

  it('thresholds are ordered', () => {
    expect(BELL_CLOSE).toBeLessThan(BELL_FAR);
  });
  it('commute: not a bell alone, a bell at 100', () => {
    expect(gapOf('commute', 1)!).toBeGreaterThan(BELL_FAR);
    expect(gapOf('commute', 100)!).toBeLessThan(BELL_CLOSE);
  });
  it('cricket: not a bell alone, near a bell at 100', () => {
    expect(label('cricket', 1)).toBe('not a bell yet');
    expect(['close to a bell', 'getting there']).toContain(label('cricket', 100));
  });
  it('dice and cafe: flat and humped at 1, a bell at 30', () => {
    for (const id of ['dice', 'cafe'] as const) {
      expect(label(id, 1)).not.toBe('close to a bell');
      expect(label(id, 30)).toBe('close to a bell');
    }
  });
  it('dice and cafe stay "close to a bell" at 30 for other seeds too', () => {
    for (const seed of [2, 3, 4, 5])
      for (const id of ['dice', 'cafe'] as const) {
        const m = sampleMeansMatrix(getPopulation(id, seed), 100, REPS, seed)!;
        expect(bellReading(bellGap(m.meansForN(30)!))).toBe('close to a bell');
      }
  });
  it('views: still not a bell at 100 (heavy tail)', () => {
    expect(label('views', 100)).not.toBe('close to a bell');
  });
  it('bellGap is null for too few averages or no spread', () => {
    expect(bellGap([1, 2, 3])).toBeNull();
    expect(bellGap(new Array(50).fill(4))).toBeNull();
    expect(bellReading(null)).toBeNull();
  });
  it('prints the calibration table', () => {
    const rows = (['commute', 'cricket', 'dice', 'cafe', 'views'] as const).map((id) => {
      const g = (n: number) => gapOf(id, n)!.toFixed(3);
      return `${id.padEnd(8)} n=1 ${g(1)}  n=30 ${g(30)}  n=100 ${g(100)}`;
    });
    console.log(`BELL_CLOSE=${BELL_CLOSE} BELL_FAR=${BELL_FAR}\n${rows.join('\n')}`);
  });
});

describe('rare events (bulbs)', () => {
  const pop = bulbs(SEED);
  const p = 0.04;
  const at = (n: number) => proportionSamples(pop, n, REPS, SEED)!;

  it('zero-faulty share matches (1 - p)^n', () => {
    expect(expectedZeroShare(p, 25)).toBeCloseTo(0.36, 2);
    const z = (n: number) => at(n).filter((v) => v === 0).length / REPS;
    expect(Math.abs(z(25) - expectedZeroShare(p, 25))).toBeLessThan(0.03);
    expect(Math.abs(z(100) - 0.0169)).toBeLessThan(0.015);
  });
  it('skewness of the proportions matches theory', () => {
    expect(Math.abs(skewness(Array.from(at(25))) - 0.94)).toBeLessThan(0.15);
    expect(Math.abs(skewness(Array.from(at(100))) - 0.47)).toBeLessThan(0.15);
  });
  it('SD of the proportions is within 8% of sqrt(p(1-p)/n)', () => {
    for (const n of [25, 100, 500]) {
      const theory = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(sdOf(at(n))! / theory - 1)).toBeLessThan(0.08);
    }
  });
  it('a bell approximation leaks below zero', () => {
    expect(Math.abs(normalBelowZero(p, 25) - 0.154)).toBeLessThan(0.01);
    expect(Math.abs(normalBelowZero(p, 100) - 0.021)).toBeLessThan(0.005);
    expect(normalBelowZero(p, 250)).toBeLessThan(0.002);
    expect(needForTenEvents(p)).toBe(250);
  });
});

describe('degenerate input', () => {
  it('never returns NaN or Infinity, never throws', () => {
    const pop = commute(SEED);
    expect(sampleMeansMatrix(pop, 0, REPS, SEED)).toBeNull();
    expect(sampleMeansMatrix(pop, 800, 0, SEED)).toBeNull();
    expect(sampleMeansMatrix([], 800, REPS, SEED)).toBeNull();
    const m = sampleMeansMatrix(pop, 100, 50, SEED)!;
    expect(m.meansForN(0)).toBeNull();
    expect(m.meansForN(101)).toBeNull();
    expect(m.meansForN(NaN)).toBeNull();
    expect(m.sampleValues(0, 0)).toEqual([]);
    expect(drawSample(pop, 0, 1)).toEqual([]);
    expect(drawSample([], 5, 1)).toEqual([]);
    expect(proportionSamples(bulbs(SEED), 0, REPS)).toBeNull();
    expect(proportionSamples(bulbs(SEED), 25, 0)).toBeNull();
    expect(popMean([])).toBe(0);
    expect(popSd([])).toBe(0);
    expect(se(pop, 0)).toBe(0);
    expect(shareWithin([], 1, 1)).toBeNull();
    expect(sdOf([1])).toBeNull();
    expect(expectedZeroShare(0.04, 0)).toBe(0);
    expect(normalBelowZero(0, 25)).toBe(0);
    expect(normalBelowZero(1, 25)).toBe(0);
    expect(needForTenEvents(0)).toBe(0);
    const out = [
      se(pop, 25),
      expectedZeroShare(0.04, 25),
      normalBelowZero(0.04, 1),
      needForTenEvents(0.5),
      bellGap(m.meansForN(1)!) ?? 0,
    ];
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

// POP_SIZE is part of the contract: "about 10,000 values".
describe('population size', () => {
  it('is 10,000', () => expect(POP_SIZE).toBe(10_000));
});
