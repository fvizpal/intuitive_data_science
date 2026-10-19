import { describe, expect, it } from 'vitest';
import {
  connectTheDots,
  forecasterPicks,
  holdoutScore,
  nextYearScore,
  scoreTable,
  winnerOf,
} from './forecasters';
import { makeBills, observed } from './validation';

const log = (...a: unknown[]) => console.log('[report]', ...a);

describe('connectTheDots', () => {
  it('passes through its points, joins them with straight segments and goes flat after the end', () => {
    const f = connectTheDots([2, 0, 4], [20, 10, 40]);
    expect(f.predict(0)).toBe(10);
    expect(f.predict(2)).toBe(20);
    expect(f.predict(1)).toBeCloseTo(15, 12);
    expect(f.predict(3)).toBeCloseTo(30, 12);
    expect(f.predict(10)).toBe(40);
    expect(f.predict(-5)).toBe(10);
    expect(connectTheDots([], []).predict(3)).toBe(0);
  });
});

describe('the way you hold months back changes the winner', () => {
  const pool = observed(makeBills(5));
  it('scores are finite and deterministic', () => {
    for (const method of ['random', 'future'] as const)
      for (const r of scoreTable(pool, method, 9)) {
        expect(Number.isFinite(r.validation)).toBe(true);
        expect(Number.isFinite(r.real)).toBe(true);
      }
    expect(scoreTable(pool, 'random', 9)).toEqual(scoreTable(pool, 'random', 9));
    expect(holdoutScore({ t: [], y: [] }, 'random', 'dots', 1)).toBeNull();
    expect(nextYearScore({ t: [], y: [] }, 'trend')).toBe(80);
  });

  it('on 200 histories: random usually prefers connect-the-dots, future the trend line, and the trend line really wins', () => {
    const p = forecasterPicks(41, 200);
    log('right pick random/future', p.rightRandom, p.rightFuture, 'of', p.reps);
    log(
      'picked random',
      p.pickedRandom,
      'future',
      p.pickedFuture,
      'truth',
      p.winsNextYear,
    );
    expect(p.winsNextYear.trend).toBeGreaterThan(0.8 * p.reps);
    expect(p.pickedRandom.dots).toBeGreaterThan(0.8 * p.reps);
    expect(p.pickedFuture.trend).toBeGreaterThan(0.8 * p.reps);
    expect(p.rightFuture).toBeGreaterThan(p.rightRandom + 0.5 * p.reps);
  });

  it('winnerOf ties go to the first forecaster', () => {
    expect(
      winnerOf(
        [
          { kind: 'dots', validation: 1, real: 2 },
          { kind: 'trend', validation: 1, real: 1 },
        ],
        'validation',
      ),
    ).toBe('dots');
  });
});
