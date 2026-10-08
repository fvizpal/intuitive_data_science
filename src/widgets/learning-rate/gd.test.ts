import { describe, expect, it } from 'vitest';
import {
  MAX_STEPS,
  X0_DEFAULT,
  classify,
  gdStep,
  grad,
  loss,
  simulate,
  snapEta,
} from './gd';

describe('loss and gradient', () => {
  it('has its minimum of 1 at x = 2', () => {
    expect(loss(2)).toBe(1);
    expect(grad(2)).toBe(0);
  });

  it('matches L(x) = (x - 2)^2 + 1', () => {
    expect(loss(-2)).toBe(17);
    expect(grad(-2)).toBe(-8);
  });
});

describe('gdStep', () => {
  it('moves by eta times the slope, downhill', () => {
    expect(gdStep(-2, 0.1)).toBeCloseTo(-1.2);
  });

  it('lands exactly on the minimum with eta = 0.5', () => {
    expect(gdStep(-2, 0.5)).toBe(2);
    expect(gdStep(6.5, 0.5)).toBe(2);
  });

  it('reflects across the minimum with eta = 1', () => {
    expect(gdStep(-2, 1)).toBe(6);
    expect(gdStep(6, 1)).toBe(-2);
  });
});

describe('snapEta', () => {
  it('snaps near 0.5 and 1 only', () => {
    expect(snapEta(0.4975)).toBe(0.5);
    expect(snapEta(1.004)).toBe(1);
    expect(snapEta(0.45)).toBe(0.45);
    expect(snapEta(0.99)).toBe(0.99);
  });
});

describe('classify', () => {
  it.each([
    [0.01, 'smooth'],
    [0.1, 'smooth'],
    [0.49, 'smooth'],
    [0.5, 'one-step'],
    [0.498, 'one-step'],
    [0.51, 'bounce-converge'],
    [0.95, 'bounce-converge'],
    [1, 'stuck'],
    [1.003, 'stuck'],
    [1.02, 'diverging'],
    [1.2, 'diverging'],
  ] as const)('eta %s -> %s', (eta, status) => {
    expect(classify(eta)).toBe(status);
  });
});

describe('simulate', () => {
  it('converges monotonically for small eta', () => {
    const { xs, escaped } = simulate(X0_DEFAULT, 0.1);
    expect(escaped).toBe(false);
    expect(xs).toHaveLength(MAX_STEPS + 1);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1] as number);
    }
    expect(Math.abs((xs.at(-1) as number) - 2)).toBeLessThan(0.01);
  });

  it('reaches the minimum in one step at eta = 0.5 and stays there', () => {
    const { xs } = simulate(X0_DEFAULT, 0.5);
    expect(xs.slice(0, 3)).toEqual([-2, 2, 2]);
  });

  it('bounces across the minimum while shrinking for 0.5 < eta < 1', () => {
    const { xs, escaped } = simulate(X0_DEFAULT, 0.8);
    expect(escaped).toBe(false);
    expect(xs[1]).toBeGreaterThan(2);
    expect(xs[2]).toBeLessThan(2);
    expect(Math.abs((xs.at(-1) as number) - 2)).toBeLessThan(1e-6);
  });

  it('never settles at eta = 1', () => {
    const { xs, escaped } = simulate(X0_DEFAULT, 1);
    expect(escaped).toBe(false);
    expect(xs.slice(0, 4)).toEqual([-2, 6, -2, 6]);
    expect(xs).toHaveLength(MAX_STEPS + 1);
  });

  it('leaves the plot and stops early when eta > 1', () => {
    const { xs, escaped } = simulate(X0_DEFAULT, 1.1);
    expect(escaped).toBe(true);
    expect(xs.length).toBeLessThan(MAX_STEPS);
    const last = xs.at(-1) as number;
    expect(last < -3 || last > 7).toBe(true);
  });

  it('respects a custom start and step cap', () => {
    const { xs } = simulate(5, 0.1, 5);
    expect(xs).toHaveLength(6);
    expect(xs[0]).toBe(5);
  });
});
