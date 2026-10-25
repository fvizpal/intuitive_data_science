import { describe, expect, it } from 'vitest';
import { lambdaMax, lassoFit, lassoPath } from './lasso';
import { ridgeFit } from './ridge';
import { orthonormal, randomProblem } from './testkit';
import { mulberry32, normal } from '../../lib/random';
import { matOf } from './linalg';

describe('lasso orthonormal closed form', () => {
  const n = 50;
  const p = 6;
  const z = orthonormal(n, p, 21);
  const rng = mulberry32(5);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = 2;
    for (let j = 0; j < p; j++) y[i] = y[i]! + (j - 2) * 0.6 * z.a[i * p + j]!;
    y[i] = y[i]! + normal(rng);
  }
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const bols = Array.from({ length: p }, (_, j) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += (z.a[i * p + j]! * (y[i]! - ybar)) / n;
    return s;
  });
  it('soft thresholds b_ols by lambda', () => {
    for (const l of [0.05, 0.3, 1.2]) {
      const f = lassoFit(z, y, l);
      for (let j = 0; j < p; j++) {
        const want = Math.sign(bols[j]!) * Math.max(Math.abs(bols[j]!) - l, 0);
        expect(Math.abs(f.standardizedCoefs[j]! - want)).toBeLessThan(1e-8);
      }
      expect(f.converged).toBe(true);
    }
  });
});

/** Standardized columns computed independently of the library. */
function zScores(x: { n: number; p: number; a: Float64Array }) {
  const z = new Float64Array(x.n * x.p);
  for (let j = 0; j < x.p; j++) {
    let m = 0;
    for (let i = 0; i < x.n; i++) m += x.a[i * x.p + j]! / x.n;
    let v = 0;
    for (let i = 0; i < x.n; i++) v += (x.a[i * x.p + j]! - m) ** 2 / x.n;
    for (let i = 0; i < x.n; i++) z[i * x.p + j] = (x.a[i * x.p + j]! - m) / Math.sqrt(v);
  }
  return z;
}

describe('lasso KKT', () => {
  const { x, y } = randomProblem(60, 12, 31, 0.5);
  const z = zScores(x);
  const ybar = y.reduce((a, b) => a + b, 0) / 60;
  const lmax = lambdaMax(x, y);
  it('holds at 8 lambdas', () => {
    for (let t = 1; t <= 8; t++) {
      const lam = lmax * 0.9 ** (t * 2);
      const f = lassoFit(x, y, lam);
      const r = new Float64Array(60);
      for (let i = 0; i < 60; i++) {
        let s = y[i]! - ybar;
        for (let j = 0; j < 12; j++) s -= z[i * 12 + j]! * f.standardizedCoefs[j]!;
        r[i] = s;
      }
      for (let j = 0; j < 12; j++) {
        let g = 0;
        for (let i = 0; i < 60; i++) g += (z[i * 12 + j]! * r[i]!) / 60;
        const b = f.standardizedCoefs[j]!;
        if (b !== 0) expect(Math.abs(g - lam * Math.sign(b))).toBeLessThan(1e-6);
        else expect(Math.abs(g)).toBeLessThanOrEqual(lam + 1e-6);
      }
    }
  });
});

describe('lasso path', () => {
  const { x, y } = randomProblem(60, 12, 41, 0.4);
  const lmax = lambdaMax(x, y);
  it('all zero at lambdaMax, one feature just below', () => {
    const f = lassoFit(x, y, lmax);
    expect(f.nonzero).toBe(0);
    for (const b of f.coefs) expect(b).toBe(0);
    const g = lassoFit(x, y, lmax * 0.999);
    expect(g.nonzero).toBe(1);
  });
  it('l1 norm does not grow with lambda; lambda 0 equals least squares; warm = cold', () => {
    const lambdas = [
      0,
      ...Array.from({ length: 20 }, (_, i) => lmax * 1e-3 * 4000 ** (i / 19)),
    ];
    const path = lassoPath(x, y, lambdas);
    let prev = Infinity;
    for (let i = 0; i < lambdas.length; i++) {
      const l1 = path[i]!.standardizedCoefs.reduce((s, b) => s + Math.abs(b), 0);
      if (i > 0) expect(l1).toBeLessThanOrEqual(prev + 1e-9);
      prev = l1;
    }
    // path is in ascending lambda: l1 should be non-increasing
    const ols = ridgeFit(x, y, 0);
    for (let j = 0; j < 12; j++)
      expect(Math.abs(path[0]!.coefs[j]! - ols.coefs[j]!)).toBeLessThan(1e-4);
    lambdas.forEach((l, i) => {
      const cold = lassoFit(x, y, l);
      for (let j = 0; j < 12; j++)
        expect(Math.abs(path[i]!.coefs[j]! - cold.coefs[j]!)).toBeLessThan(1e-8);
    });
  });
  it('no NaN with n < p, a constant column and empty input', () => {
    const rng = mulberry32(3);
    const small = matOf(8, 12);
    for (let i = 0; i < small.a.length; i++) small.a[i] = normal(rng);
    for (let i = 0; i < 8; i++) small.a[i * 12 + 4] = 3;
    const ys = Array.from({ length: 8 }, () => normal(rng));
    const f = lassoFit(small, ys, 0);
    expect(f.dropped).toEqual([4]);
    expect([...f.coefs].every(Number.isFinite)).toBe(true);
    const e = lassoFit(matOf(0, 5), [], 0.1);
    expect(Number.isFinite(e.intercept)).toBe(true);
    const r = ridgeFit(small, ys, 0);
    expect(r.undetermined).toBe(true);
    expect([...r.coefs].every(Number.isFinite)).toBe(true);
    expect(r.dropped).toEqual([4]);
  });
});
