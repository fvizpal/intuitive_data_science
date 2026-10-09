import { describe, expect, it } from 'vitest';
import { ordinal } from './data';
import { stackLevels, tallestStack, ticks } from './stacking';

describe('stackLevels', () => {
  it('stacks equal values and leaves distant values at the bottom', () => {
    expect(stackLevels([5, 5, 5, 9], 1)).toEqual([0, 1, 2, 0]);
  });

  it('stacks dots that land in the same bin even if the values differ slightly', () => {
    expect(stackLevels([5.1, 4.9, 20], 1)).toEqual([1, 0, 0]);
  });

  it('is independent of input order', () => {
    const levels = stackLevels([7, 3, 7, 3, 7], 1);
    expect(levels[1]).not.toBe(levels[3]);
    expect([...levels].sort()).toEqual([0, 0, 1, 1, 2]);
  });

  it('handles empty input and a zero bin size', () => {
    expect(stackLevels([], 1)).toEqual([]);
    expect(stackLevels([1, 1], 0)).toEqual([0, 1]);
    expect(tallestStack([])).toBe(0);
    expect(tallestStack([0, 1, 2, 0])).toBe(3);
  });
});

describe('ticks', () => {
  it('lists inclusive, evenly spaced ticks', () => {
    expect(ticks(0, 20, 5)).toEqual([0, 5, 10, 15, 20]);
    expect(ticks(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(ticks(0, 10, 0)).toEqual([]);
  });
});

describe('ordinal', () => {
  it('writes 1st, 2nd, 3rd, 11th, 73rd', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 50, 73, 100].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '50th',
      '73rd',
      '100th',
    ]);
  });
});
