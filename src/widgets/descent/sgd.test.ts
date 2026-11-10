import { describe, expect, it } from 'vitest';
import { commute } from '../../lib/populations';
import { popMean } from '../sampling/sampling';
import {
  makeIndexStream,
  meanPath,
  popVariance,
  runSgdMean,
  sgdTheory,
  wobble,
} from './sgd';

const pop = commute(42);
const ybar = popMean(pop);
const sigma2 = popVariance(pop);

describe('sgd on the commute mean', () => {
  it('the population looks like the sampling page (mean about 32, SD about 17)', () => {
    expect(ybar).toBeGreaterThan(30);
    expect(ybar).toBeLessThan(34);
    expect(Math.sqrt(sigma2)).toBeGreaterThan(15);
    expect(Math.sqrt(sigma2)).toBeLessThan(19);
  });

  it('a full batch follows the noise-free path', () => {
    for (const lr of [0.01, 0.1, 0.5, 1]) {
      const p = runSgdMean(pop, 80, lr, 'all', 60, 1);
      for (let t = 0; t <= 60; t++)
        expect(Math.abs(p[t]! - meanPath(80, ybar, lr, t))).toBeLessThan(1e-12);
    }
  });

  it('the average over chains follows the mean path (lr 0.1, B 10)', () => {
    const chains = 2000;
    const vals: number[] = [];
    for (let s = 0; s < chains; s++)
      vals.push(runSgdMean(pop, 80, 0.1, 10, 20, 1000 + s)[20]! - ybar);
    const m = vals.reduce((a, b) => a + b, 0) / chains;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (chains - 1));
    const se = sd / Math.sqrt(chains);
    const want = 0.9 ** 20 * (80 - ybar);
    console.log(
      `[report] mean of w_20 - ybar over ${chains} chains: ${m.toFixed(3)} vs ${want.toFixed(3)} (3 SE = ${(3 * se).toFixed(3)})`,
    );
    expect(Math.abs(m - want)).toBeLessThan(3 * se);
  });

  it('stationary wobble matches lr * sigma2 / (B (2 - lr))', () => {
    const chains = 600;
    const T = 800;
    const rows: string[] = [];
    const sdAt: Record<string, number> = {};
    for (const B of [1, 10, 100]) {
      const streams: Uint16Array[] = [];
      for (let s = 0; s < chains; s++)
        streams.push(makeIndexStream(5000 + s, T, B, pop.length));
      for (const lr of [0.1, 0.3]) {
        let acc = 0;
        for (let s = 0; s < chains; s++) {
          const p = runSgdMean(pop, ybar, lr, B, T, 5000 + s, {
            stream: streams[s]!,
            streamB: B,
          });
          acc += (p[T]! - ybar) ** 2;
        }
        const v = acc / chains;
        const th = (lr * sigma2) / (B * (2 - lr));
        expect(Math.sqrt(th)).toBeCloseTo(sgdTheory(pop, lr, B), 9);
        rows.push(
          `lr ${lr}, B ${B}: simulated var ${v.toFixed(2)} vs theory ${th.toFixed(2)} (ratio ${(v / th).toFixed(3)})`,
        );
        expect(Math.abs(v / th - 1)).toBeLessThan(0.15);
        sdAt[`${lr}|${B}`] = Math.sqrt(v);
      }
    }
    const ratio = sdAt['0.1|100']! / sdAt['0.1|1']!;
    console.log(
      `[report] SGD wobble vs theory:\n  ${rows.join('\n  ')}\n  SD ratio B=100 over B=1 at lr 0.1: ${ratio.toFixed(3)}`,
    );
    expect(Math.abs(ratio / 0.1 - 1)).toBeLessThan(0.2);
  });

  it('a shrinking learning rate quiets the wobble', () => {
    const T = 2000;
    const flat = wobble(runSgdMean(pop, 80, 0.1, 1, T, 7), 200);
    const decayed = wobble(
      runSgdMean(pop, 80, 0.1, 1, T, 7, { decay: true, decayHalf: 50 }),
      200,
    );
    console.log(
      `[report] wobble over the last 200 of ${T} steps (B 1, lr 0.1): constant ${flat.toFixed(2)}, shrinking ${decayed.toFixed(2)}`,
    );
    expect(decayed).toBeLessThan(0.5 * flat);
  });

  it('batches are nested, deterministic and in range', () => {
    const N = pop.length;
    const small = makeIndexStream(9, 50, 10, N);
    const big = makeIndexStream(9, 50, 100, N);
    for (let t = 0; t < 50; t++)
      for (let j = 0; j < 10; j++) expect(small[t * 10 + j]).toBe(big[t * 100 + j]);
    expect(Array.from(makeIndexStream(9, 5, 7, N))).toEqual(
      Array.from(makeIndexStream(9, 5, 7, N)),
    );
    expect(Array.from(makeIndexStream(10, 5, 7, N))).not.toEqual(
      Array.from(makeIndexStream(9, 5, 7, N)),
    );
    const all = makeIndexStream(3, 600, 1000, N);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < all.length; i++) {
      lo = Math.min(lo, all[i]!);
      hi = Math.max(hi, all[i]!);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(N);
    // a run with its own stream equals a run with a prebuilt wider one
    const a = runSgdMean(pop, 80, 0.1, 10, 100, 4);
    const b = runSgdMean(pop, 80, 0.1, 10, 100, 4, {
      stream: makeIndexStream(4, 100, 1000, N),
      streamB: 1000,
    });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('edge cases stay finite and never throw', () => {
    expect(Array.from(runSgdMean([], 80, 0.1, 10, 5, 1))).toEqual([
      80, 80, 80, 80, 80, 80,
    ]);
    expect(runSgdMean(pop, 80, -1, 10, 5, 1).every(Number.isFinite)).toBe(true);
    expect(runSgdMean(pop, 80, Number.NaN, 10, 5, 1).every(Number.isFinite)).toBe(true);
    expect(runSgdMean(pop, 80, 0.1, 0, 5, 1).every(Number.isFinite)).toBe(true);
    expect(sgdTheory(pop, 0.1, 'all')).toBe(0);
    expect(sgdTheory(pop, 2.5, 1)).toBe(0);
    expect(sgdTheory(pop, 0, 1)).toBe(0);
    expect(wobble([])).toBe(0);
    expect(wobble([1, 2, 3], 200)).toBeGreaterThan(0);
    expect(runSgdMean(pop, 80, 0, 10, 10, 1).every((v) => v === 80)).toBe(true);
  });
});
