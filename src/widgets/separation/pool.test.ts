import { describe, expect, it } from 'vitest';
import { auc, gini, ks, splitGroups } from './metrics';
import { CHUNK_SIZE, POOL_SIZE, buildPool, createPoolBuilder } from './pool';

describe('reality-check pool', () => {
  const pool = buildPool();

  it('has 20,000 applicants with about 4% bads', () => {
    expect(pool.scores).toHaveLength(POOL_SIZE);
    const bads = pool.flags.reduce((s, f) => s + (1 - f), 0);
    expect(bads / POOL_SIZE).toBeGreaterThan(0.035);
    expect(bads / POOL_SIZE).toBeLessThan(0.045);
  });

  it('is deterministic and the chunked builder agrees', () => {
    const b = createPoolBuilder();
    while (!b.step());
    expect(Array.from(b.result().scores.slice(0, 50))).toEqual(
      Array.from(pool.scores.slice(0, 50)),
    );
    expect(CHUNK_SIZE * 10).toBe(POOL_SIZE);
  });

  it('the scorecard still ranks fresh applicants well, if a little worse than the book it was built on', () => {
    const { goods, bads } = splitGroups(Array.from(pool.scores), Array.from(pool.flags));
    const a = auc(goods, bads)!;
    expect(gini(a)!).toBeGreaterThan(0.3);
    // ...and a little worse: the score always looks best on the data it was built on.
    expect(gini(a)!).toBeLessThan(pool.reference.gini);
    expect(ks(goods, bads)!.ks).toBeGreaterThan(0.25);
    expect(pool.reference.gini).toBeGreaterThan(0.4);
  });
});

import { drawSamples, summarize } from './sampling';

describe('drawSamples', () => {
  const pool = buildPool();
  const run = (size: number) =>
    summarize(drawSamples(pool.scores, pool.flags, size, 40, 3).map((r) => r.gini))!;

  it('is deterministic per seed', () => {
    const a = drawSamples(pool.scores, pool.flags, 500, 5, 1);
    expect(a).toEqual(drawSamples(pool.scores, pool.flags, 500, 5, 1));
    expect(a).not.toEqual(drawSamples(pool.scores, pool.flags, 500, 5, 2));
  });

  it('draws the requested number of applicants without replacement', () => {
    const r = drawSamples(
      Int32Array.from([1, 2, 3, 4]),
      Uint8Array.from([1, 1, 0, 0]),
      4,
      1,
      1,
    );
    expect(r[0]!.nBad).toBe(2); // all four, each once
  });

  it('smaller samples wobble more', () => {
    const small = run(500);
    const large = run(5000);
    expect(small.max - small.min).toBeGreaterThan(large.max - large.min);
    expect(Math.abs(large.mean - small.mean)).toBeLessThan(0.08);
  });
});
