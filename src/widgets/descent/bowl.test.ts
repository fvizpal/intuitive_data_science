import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../lib/random';
import {
  CHART_STEPS,
  START,
  bestLr,
  bestRate,
  bowlGrad,
  bowlLoss,
  bowlStatus,
  gradDirectional,
  maxSafeLr,
  runBowl,
  stepBowl,
  stepsAtBestLr,
  tangentAt,
  type Pt,
} from './bowl';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

function iterate(p0: Pt, lr: number, kappa: number, t: number): Pt {
  let p = p0;
  for (let i = 0; i < t; i++) p = stepBowl(p, lr, kappa);
  return p;
}

describe('bowl: exact coordinates', () => {
  it('x_t = (1 - lr)^t x0 and y_t = (1 - lr kappa)^t y0', () => {
    const cases: [number, number, number][] = [
      [0.05, 10, 30],
      [0.3, 3, 12],
      [0.18, 10, 25],
      [0.01, 100, 80],
      [0.9, 1, 7],
      [0.02, 50, 40],
    ];
    for (const [lr, kappa, t] of cases) {
      const p = iterate([8, 2], lr, kappa, t);
      expect(rel(p[0], (1 - lr) ** t * 8)).toBeLessThan(1e-12);
      expect(rel(p[1], (1 - lr * kappa) ** t * 2)).toBeLessThan(1e-12);
      const run = runBowl([8, 2], lr, kappa, { maxSteps: t });
      void run;
    }
  });

  it('runBowl path points follow the closed form', () => {
    const run = runBowl(START, 0.05, 10);
    run.path.forEach((p, i) => {
      const t = run.pathSteps[i]!;
      expect(rel(p[0], 0.95 ** t * 8)).toBeLessThan(1e-12);
      expect(rel(p[1], 0.5 ** t * 2)).toBeLessThan(1e-12);
    });
    expect(run.path.length).toBeLessThanOrEqual(400);
  });
});

describe('bowl: gradient geometry', () => {
  it('gradient is perpendicular to the ring, slopes match, small steps go down', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const x = (rng() - 0.5) * 24;
      const y = (rng() - 0.5) * 10;
      const kappa = 1 + rng() * 99;
      const g = bowlGrad(x, y, kappa);
      const tn = tangentAt(x, y, kappa);
      expect(Math.abs(g[0] * tn[0] + g[1] * tn[1])).toBeLessThan(1e-9);
      expect(Math.hypot(tn[0], tn[1])).toBeCloseTo(1, 12);
      const gn = Math.hypot(g[0], g[1]);
      const up = gradDirectional(x, y, kappa, g);
      expect(Math.abs(up - gn)).toBeLessThan(1e-5 * Math.max(1, gn));
      expect(Math.abs(gradDirectional(x, y, kappa, tn))).toBeLessThan(
        1e-5 * Math.max(1, gn),
      );
      const lr = (2 / kappa) * (0.05 + 0.9 * rng());
      const q = stepBowl([x, y], lr, kappa);
      expect(bowlLoss(q[0], q[1], kappa)).toBeLessThan(bowlLoss(x, y, kappa));
    }
    expect(bowlGrad(0, 0, 7)).toEqual([0, 0]);
  });
});

describe('bowl: limits', () => {
  it('just under the safe limit converges, just over diverges, at the limit it is stuck', () => {
    for (const kappa of [1, 5, 50]) {
      const safe = maxSafeLr(kappa);
      const L0 = bowlLoss(8, 2, kappa);
      const lo = iterate([8, 2], 0.99 * safe, kappa, 5000);
      expect(bowlLoss(lo[0], lo[1], kappa)).toBeLessThan(L0);
      const hi = iterate([8, 2], 1.01 * safe, kappa, 300);
      expect(bowlLoss(hi[0], hi[1], kappa)).toBeGreaterThan(L0);
      let p: Pt = [8, 2];
      for (let t = 0; t < 100; t++) {
        p = stepBowl(p, safe, kappa);
        expect(Math.abs(Math.abs(p[1]) - 2)).toBeLessThan(1e-9);
      }
      expect(runBowl(START, 1.01 * safe, kappa).diverged).toBe(true);
    }
  });

  it('bowlStatus gives each label', () => {
    expect(bowlStatus(0.25, 10)).toBe('diverging');
    expect(bowlStatus(0.2, 10)).toBe('stuck');
    expect(bowlStatus(0.19, 10)).toBe('bouncing');
    expect(bowlStatus(0.01, 10)).toBe('crawling');
    expect(bowlStatus(0.05, 10)).toBe('smooth');
    expect(bowlStatus(0.02, 10)).toBe('crawling'); // a = 0.98 exactly
    expect(bowlStatus(0.03, 10)).toBe('smooth');
    expect(bowlStatus(Number.NaN, 10)).toBe('invalid');
    expect(bowlStatus(0.1, 0.5)).toBe('invalid');
    expect(bowlStatus(-1, 10)).toBe('invalid');
  });
});

describe('bowl: best learning rate', () => {
  it('both factors have the same size and the gap shrinks by rate^2 per step', () => {
    for (const kappa of [1, 2, 10, 100, 1000]) {
      const lr = bestLr(kappa);
      const r = bestRate(kappa);
      expect(Math.abs(Math.abs(1 - lr) - r)).toBeLessThan(1e-12);
      expect(Math.abs(Math.abs(1 - lr * kappa) - r)).toBeLessThan(1e-12);
      const t = 7;
      const p = iterate([8, 2], lr, kappa, t);
      expect(
        rel(bowlLoss(p[0], p[1], kappa), r ** (2 * t) * bowlLoss(8, 2, kappa)),
      ).toBeLessThan(1e-9);
    }
  });

  it('simulated 99% steps equal the closed form: 1, 3, 12, 116, 1152', () => {
    const expected: Record<number, number> = { 1: 1, 2: 3, 10: 12, 100: 116, 1000: 1152 };
    for (const k of [1, 2, 10, 100, 1000]) {
      const run = runBowl(START, bestLr(k), k);
      console.log(`[report] best learning rate, stretch ${k}: ${run.steps} steps`);
      expect(run.steps).toBe(expected[k]);
      expect(stepsAtBestLr(k)).toBe(expected[k]);
    }
  });

  it('no other learning rate has a faster worst-case pace (stretch 10 and 100)', () => {
    // The best rate minimises max(|1 - lr|, |1 - lr kappa|), the pace of the slowest
    // direction. From the fixed start (8, 2) a slightly smaller rate can finish sooner,
    // because most of the starting loss sits in the fast-dying steep direction. Report it.
    for (const k of [10, 100]) {
      const best = runBowl(START, bestLr(k), k).steps!;
      const safe = maxSafeLr(k);
      const pace = (lr: number) => Math.max(Math.abs(1 - lr), Math.abs(1 - lr * k));
      let fewest = Infinity;
      for (let i = 0; i < 200; i++) {
        const f = 0.01 + ((0.9999 - 0.01) * i) / 199;
        expect(pace(f * safe)).toBeGreaterThanOrEqual(pace(bestLr(k)) - 1e-12);
        fewest = Math.min(fewest, runBowl(START, f * safe, k).steps ?? Infinity);
      }
      console.log(
        `[report] stretch ${k}: best rate ${best} steps; fewest on the 200-rate grid ${fewest}`,
      );
      expect(fewest).toBeLessThanOrEqual(best);
      expect(fewest).toBeGreaterThan(0.4 * best);
    }
  });
});

describe('bowl: stretch costs steps', () => {
  it('about 10 times the steps for 10 times the stretch', () => {
    const s = (k: number) => runBowl(START, bestLr(k), k).steps!;
    const a = s(100) / s(10);
    const b = s(1000) / s(100);
    console.log(
      `[report] steps ratio 100/10 = ${a.toFixed(2)}, 1000/100 = ${b.toFixed(2)}`,
    );
    expect(a).toBeGreaterThan(8);
    expect(a).toBeLessThan(11);
    expect(b).toBeGreaterThan(8);
    expect(b).toBeLessThan(11);
  });

  it('at 0.9 x the safe limit, stretch 100 crawls', () => {
    const lr = 0.9 * maxSafeLr(100);
    expect(Math.abs(1 - lr - 0.982)).toBeLessThan(1e-12);
    const run = runBowl(START, lr, 100);
    console.log(`[report] stretch 100 at 0.9 x safe limit: ${run.steps} steps`);
    // The start (8, 2) puts 86% of the loss in the steep direction, which dies at 0.8 per
    // step, so only the gentle direction's 14% is left to crawl: the count is far below 200.
    expect(run.steps).toBeGreaterThan(50);
    expect(run.steps).toBeLessThan(200);
  });
});

describe('bowl: edge inputs', () => {
  it('lr = 0 never moves; bad input is explicit, not an exception', () => {
    const z = runBowl(START, 0, 10);
    expect(z.capped).toBe(true);
    expect(z.steps).toBeNull();
    expect(z.invalid).toBe(false);
    for (const bad of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = runBowl(START, bad, 10);
      expect(r.invalid).toBe(true);
      expect(r.steps).toBeNull();
    }
    expect(runBowl(START, 0.1, 0.5).invalid).toBe(true);
    expect(runBowl([0, 0], 0.1, 3).steps).toBe(0);
  });

  it('never returns NaN or Infinity', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const lr = rng() * 5 * (rng() < 0.5 ? 1 : 1e-4);
      const k = 1 + rng() * 200;
      const r = runBowl([rng() * 20 - 10, rng() * 8 - 4], lr, k);
      expect(r.gaps.length).toBe(CHART_STEPS + 1);
      for (const g of r.gaps) expect(Number.isFinite(g)).toBe(true);
      for (const p of r.path) {
        expect(Number.isFinite(p[0])).toBe(true);
        expect(Number.isFinite(p[1])).toBe(true);
      }
      expect(r.path.length).toBeLessThanOrEqual(400);
    }
  });
});
