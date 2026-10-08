import { describe, expect, it } from 'vitest';
import { mulberry32, normal, uniform } from './random';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays within [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('distributions', () => {
  it('normal has roughly the requested mean and sd', () => {
    const r = mulberry32(3);
    const xs = Array.from({ length: 20000 }, () => normal(r, 5, 2));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(5, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('uniform respects bounds', () => {
    const r = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const x = uniform(r, -3, 7);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThan(7);
    }
  });
});
