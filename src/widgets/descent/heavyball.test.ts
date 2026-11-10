import { describe, expect, it } from 'vitest';
import { START, bestLr, bowlLoss, maxSafeLr, runBowl, stepBowl, type Pt } from './bowl';
import {
  accumulateSteps,
  steadyAcross,
  steadyAlong,
  heavyBallStep,
  maxStableLrMomentum,
  momentumRate,
  momentumRateBowl,
  momentumStatus,
  optimalMomentum,
  runHeavyBall,
} from './heavyball';

function simulate(lr: number, beta: number, kappa: number, steps: number) {
  let p: Pt = [8, 2];
  let v: Pt = [0, 0];
  for (let i = 0; i < steps; i++) ({ p, v } = heavyBallStep(p, v, lr, beta, kappa));
  return p;
}

type M = [number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
];
/** Frobenius norm of M^n, as a log, with rescaling so nothing under- or overflows. */
function logNormPow(m: M, n: number): number {
  let result: M = [1, 0, 0, 1];
  let logR = 0;
  let base = m;
  let logB = 0;
  const norm = (a: M) => Math.hypot(a[0], a[1], a[2], a[3]);
  while (n > 0) {
    if (n & 1) {
      result = mul(result, base);
      const s = norm(result);
      result = result.map((x) => x / s) as M;
      logR += Math.log(s) + logB;
    }
    n >>= 1;
    if (n > 0) {
      base = mul(base, base);
      const s = norm(base);
      base = base.map((x) => x / s) as M;
      logB = 2 * logB + Math.log(s);
    }
  }
  return logR + Math.log(norm(result));
}

describe('heavy ball', () => {
  it('beta = 0 is plain gradient descent', () => {
    for (const [lr, kappa] of [
      [0.05, 10],
      [0.18, 10],
      [0.01, 100],
    ] as const) {
      let p: Pt = [8, 2];
      for (let t = 1; t <= 60; t++) {
        p = stepBowl(p, lr, kappa);
        const h = simulate(lr, 0, kappa, t);
        expect(Math.abs(h[0] - p[0])).toBeLessThan(1e-14);
        expect(Math.abs(h[1] - p[1])).toBeLessThan(1e-14);
      }
      const a = runBowl(START, lr, kappa);
      const b = runHeavyBall(START, lr, 0, kappa);
      expect(b.steps).toBe(a.steps);
    }
  });

  it('stability bound: just under converges, just over diverges (stretch 100)', () => {
    for (const beta of [0.3, 0.67, 0.9]) {
      const lim = maxStableLrMomentum(beta, 100);
      const L0 = bowlLoss(8, 2, 100);
      const lo = simulate(0.999 * lim, beta, 100, 20000);
      expect(bowlLoss(lo[0], lo[1], 100)).toBeLessThan(L0);
      const hi = simulate(1.001 * lim, beta, 100, 2000);
      expect(bowlLoss(hi[0], hi[1], 100) > L0 || !Number.isFinite(hi[1])).toBe(true);
      expect(momentumStatus(1.001 * lim, beta, 100)).toBe('diverging');
      expect(runHeavyBall(START, 1.001 * lim, beta, 100).diverged).toBe(true);
    }
  });

  it('rate matches the spectral radius of the companion matrix (2000th power)', () => {
    const cases: [number, number, number][] = [
      [0.05, 0.5, 1], // complex roots
      [0.2, 0.9, 1], // complex roots
      [0.03, 0.67, 100], // near the best, double-ish roots
      [0.5, 0.2, 1], // real roots
      [0.05, 0.3, 10], // real roots
      [0.3, 0.8, 1], // real roots
      [0.01, 0.0, 10], // plain
      [0.1, 0.95, 5],
    ];
    let complexSeen = 0;
    let realSeen = 0;
    for (const [lr, beta, lambda] of cases) {
      const s = 1 + beta - lr * lambda;
      if (s * s - 4 * beta < 0) complexSeen++;
      else realSeen++;
      const rate = momentumRate(lr, beta, lambda);
      const m: M = [s, -beta, 1, 0];
      const est = Math.exp(logNormPow(m, 2000) / 2000);
      expect(Math.abs(est - rate) / rate).toBeLessThan(0.02);
      if (s * s - 4 * beta < 0)
        expect(Math.abs(rate - Math.sqrt(beta))).toBeLessThan(1e-12);
    }
    expect(complexSeen).toBeGreaterThan(0);
    expect(realSeen).toBeGreaterThan(0);
  });

  it('optimal momentum for stretch 100', () => {
    const o = optimalMomentum(100);
    expect(Math.abs(o.lr - 0.03306)).toBeLessThan(1e-4);
    expect(Math.abs(o.beta - 0.6694)).toBeLessThan(1e-4);
    expect(o.lr).toBeLessThan(maxStableLrMomentum(o.beta, 100));
    expect(Math.abs(maxStableLrMomentum(o.beta, 100) - 0.03339)).toBeLessThan(1e-4);
    for (const k of [10, 100]) {
      const op = optimalMomentum(k);
      const want = (Math.sqrt(k) - 1) / (Math.sqrt(k) + 1);
      expect(Math.abs(momentumRateBowl(op.lr, op.beta, k) - want)).toBeLessThan(1e-9);
      expect(Math.abs(Math.sqrt(op.beta) - want)).toBeLessThan(1e-9);
    }
  });

  it('momentum cuts the step count: stretch 100 and 10', () => {
    const out: string[] = [];
    for (const [k, frac] of [
      [100, 0.5],
      [10, 0.8],
    ] as const) {
      const plain = runBowl(START, bestLr(k), k).steps!;
      const o = optimalMomentum(k);
      const mom = runHeavyBall(START, o.lr, o.beta, k).steps!;
      const rounded = runHeavyBall(START, o.lr, Math.round(o.beta * 100) / 100, k).steps!;
      out.push(
        `stretch ${k}: plain ${plain}, momentum ${mom} (beta rounded to 2 decimals: ${rounded}); lr ${o.lr.toFixed(4)}, beta ${o.beta.toFixed(4)}`,
      );
      expect(mom).toBeLessThanOrEqual(frac * plain);
      expect(momentumStatus(o.lr, Math.round(o.beta * 100) / 100, k)).toBe('smooth');
    }
    console.log(`[report] ${out.join(' | ')}`);
  });

  it('too much momentum rings', () => {
    const lr = bestLr(100);
    expect(momentumStatus(lr, 0.95, 100)).toBe('rings');
    // The drawn path can run past 99% (here to 99.9999%) so the ringing shows; count sign changes in x on it.
    const run = runHeavyBall(START, lr, 0.95, 100, { pathShare: 1e-6 });
    const flips = (path: readonly Pt[]) => {
      let n = 0;
      for (let i = 1; i < path.length; i++)
        if (Math.sign(path[i]![0]) !== Math.sign(path[i - 1]![0])) n++;
      return n;
    };
    // And over the 300 steps the loss chart shows, from the literal recurrence.
    let p: Pt = [8, 2];
    let v: Pt = [0, 0];
    const xs: Pt[] = [p];
    for (let i = 0; i < 300; i++) {
      ({ p, v } = heavyBallStep(p, v, lr, 0.95, 100));
      xs.push(p);
    }
    console.log(
      `[report] beta 0.95: ${run.steps} steps to 99%; x changes sign ${flips(run.path)} times on the drawn path, ${flips(xs)} times over 300 steps`,
    );
    expect(flips(run.path)).toBeGreaterThanOrEqual(3);
    expect(flips(xs)).toBeGreaterThanOrEqual(3);
  });

  it('invalid input is explicit, outputs stay finite', () => {
    expect(runHeavyBall(START, -1, 0.5, 10).invalid).toBe(true);
    expect(runHeavyBall(START, 0.1, 1, 10).invalid).toBe(true);
    expect(runHeavyBall(START, 0.1, Number.NaN, 10).invalid).toBe(true);
    expect(momentumStatus(0.1, 1.2, 10)).toBe('invalid');
    const z = runHeavyBall(START, 0, 0.5, 10);
    expect(z.capped).toBe(true);
    const d = runHeavyBall(START, 5, 0.9, 10);
    expect(d.diverged).toBe(true);
    for (const g of d.gaps) expect(Number.isFinite(g)).toBe(true);
    for (const p of d.path)
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    expect(maxSafeLr(1)).toBe(2);
  });
});

describe('accumulated steps (the bars widget)', () => {
  it('beta = 0 returns the pushes; steady pushes build to 1 / (1 - beta)', () => {
    expect(accumulateSteps([1, -1, 1], 0)).toEqual([1, -1, 1]);
    const along = accumulateSteps(
      Array.from({ length: 400 }, () => 1),
      0.9,
    );
    expect(along[0]).toBe(1);
    expect(along[1]).toBeCloseTo(1.9, 12);
    expect(along[2]).toBeCloseTo(2.71, 12);
    expect(Math.abs(along[399]! - steadyAlong(0.9))).toBeLessThan(1e-9);
    expect(steadyAlong(0.9)).toBeCloseTo(10, 12);
  });

  it('flipping pushes settle at 1 / (1 + beta) of a plain swing', () => {
    const flips = Array.from({ length: 401 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const out = accumulateSteps(flips, 0.9);
    expect(out[1]).toBeCloseTo(-0.1, 12);
    expect(out[2]).toBeCloseTo(0.91, 12);
    expect(Math.abs(Math.abs(out[400]!) - steadyAcross(0.9))).toBeLessThan(1e-9);
    expect(steadyAcross(0.9)).toBeCloseTo(1 / 1.9, 12);
  });

  it('bad beta falls back to plain and nothing is NaN', () => {
    for (const b of [-1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(accumulateSteps([1, 1, 1], b)).toEqual([1, 1, 1]);
      expect(steadyAlong(b)).toBe(1);
      expect(steadyAcross(b)).toBe(1);
    }
    expect(accumulateSteps([Number.NaN, 1], 0.5)).toEqual([0, 1]);
  });
});

describe('the numbers printed in the momentum section', () => {
  it('along the hill: 1, 1.9, 2.71, 3.44, 4.10 and running totals 1, 2.9, 5.61, 9.05, 13.14', () => {
    const v = accumulateSteps([1, 1, 1, 1, 1], 0.9);
    [1, 1.9, 2.71, 3.439, 4.0951].forEach((want, i) =>
      expect(v[i]).toBeCloseTo(want, 10),
    );
    let total = 0;
    const totals = v.map((x) => (total += x));
    [1, 2.9, 5.61, 9.049, 13.1441].forEach((want, i) =>
      expect(totals[i]).toBeCloseTo(want, 9),
    );
  });

  it('across the hill: the second step is -0.1 and swings settle near 0.53', () => {
    const v = accumulateSteps([1, -1, 1, -1], 0.9);
    expect(v[1]).toBeCloseTo(-0.1, 12);
    expect(steadyAcross(0.9)).toBeCloseTo(0.5263, 3);
  });

  it('narrow hill, same learning rate 0.0198: steps and loss left', () => {
    const k = 100;
    const lr = bestLr(k);
    expect(lr).toBeCloseTo(0.0198, 4);
    const want: [number, number, number, number][] = [
      [0, 116, 67, 30],
      [0.5, 33, 7, 1.2],
      [0.7, 20, 7, 0.1],
      [0.9, 16, 9, 2.0],
      [0.95, 50, 37, 4.7],
    ];
    for (const [beta, steps, left10, left30] of want) {
      const r = runHeavyBall(START, lr, beta, k, { pathShare: 1e-6 });
      expect(r.steps).toBe(steps);
      expect(Math.abs(r.gaps[10]! * 100 - left10)).toBeLessThan(0.6);
      expect(Math.abs(r.gaps[30]! * 100 - left30)).toBeLessThan(
        Math.max(0.06, 0.006 * left30),
      );
    }
    // overshoot at 0.9: 1.0% left at step 20, back up to 2.0% at step 30
    const r9 = runHeavyBall(START, lr, 0.9, k, { pathShare: 1e-6 });
    expect(Math.abs(r9.gaps[20]! * 100 - 1.0)).toBeLessThan(0.06);
    expect(r9.gaps[30]!).toBeGreaterThan(r9.gaps[20]!);
  });
});
