import { describe, expect, it } from 'vitest';
import { fitPoly, makeStream, trainingSet, rmse } from '../biasvar/fit';
import { mulberry32, normal } from '../../lib/random';
import { effectiveDf, fitRidgePoly, ridgeFit, ridgePath } from './ridge';
import { orthonormal, randomProblem } from './testkit';

/** Tiny independent solver: Gaussian elimination with partial pivoting. */
function gauss(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

describe('ridge QR vs normal equations', () => {
  it("matches (X'X + n lambda I)^-1 X'y on centered columns, intercept unpenalized", () => {
    const { x, y } = randomProblem(30, 4, 5);
    for (const lambda of [0.01, 0.3, 2]) {
      const fit = ridgeFit(x, y, lambda, { standardize: false });
      // reference: center, normal equations
      const n = 30;
      const mean = [0, 1, 2, 3].map((j) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += x.a[i * 4 + j]!;
        return s / n;
      });
      const ybar = y.reduce((a, b) => a + b, 0) / n;
      const A = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
      const c = new Array<number>(4).fill(0);
      for (let i = 0; i < n; i++)
        for (let a = 0; a < 4; a++) {
          const za = x.a[i * 4 + a]! - mean[a]!;
          c[a] = c[a]! + za * (y[i]! - ybar);
          for (let b = 0; b < 4; b++)
            A[a]![b] = A[a]![b]! + za * (x.a[i * 4 + b]! - mean[b]!);
        }
      for (let a = 0; a < 4; a++) A[a]![a] = A[a]![a]! + n * lambda;
      const ref = gauss(A, c);
      for (let j = 0; j < 4; j++)
        expect(Math.abs(fit.coefs[j]! - ref[j]!)).toBeLessThan(1e-8);
      const icpt = ybar - ref.reduce((s, b, j) => s + b * mean[j]!, 0);
      expect(Math.abs(fit.intercept - icpt)).toBeLessThan(1e-8);
    }
  });
});

describe('fitRidgePoly', () => {
  const ts = trainingSet(makeStream(3, 20), 20, 2);
  it('lambda = 0 equals fitPoly', () => {
    const a = fitRidgePoly(ts.x, ts.y, 12, 0);
    const b = fitPoly(ts.x, ts.y, 12);
    for (let h = 0; h <= 24; h += 0.5)
      expect(Math.abs(a.model.predict(h) - b.predict(h))).toBeLessThan(1e-6);
    expect(a.undetermined).toBe(false);
  });
  it('properties over the lambda grid', () => {
    const lambdas = [
      0,
      ...Array.from({ length: 40 }, (_, i) => 10 ** (-6 + (7 * i) / 39)),
    ];
    let prevTrain = -1;
    let prevNorm = Infinity;
    let prevDf = Infinity;
    for (const l of lambdas) {
      const f = fitRidgePoly(ts.x, ts.y, 12, l);
      const t = rmse(f.model, ts.x, ts.y);
      expect(t).toBeGreaterThanOrEqual(prevTrain - 1e-9);
      expect(f.coefNorm).toBeLessThanOrEqual(prevNorm + 1e-9);
      expect(f.effectiveDf).toBeLessThan(prevDf);
      if (l === 0) expect(Math.abs(f.effectiveDf - 13)).toBeLessThan(1e-6);
      prevTrain = t;
      prevNorm = f.coefNorm;
      prevDf = f.effectiveDf;
    }
    const big = fitRidgePoly(ts.x, ts.y, 12, 1e8);
    expect(big.effectiveDf).toBeLessThan(1.01);
    const mean = ts.y.reduce((a, b) => a + b, 0) / ts.y.length;
    for (const h of [0, 6, 12, 18, 24])
      expect(Math.abs(big.model.predict(h) - mean)).toBeLessThan(1e-3);
  });
  it('lambda = 0 with too few rows falls back and flags', () => {
    const f = fitRidgePoly([1, 2, 3], [1, 2, 3], 12, 0);
    expect(f.undetermined).toBe(true);
    expect(Number.isFinite(f.model.predict(2))).toBe(true);
    const e = fitRidgePoly([], [], 12, 0.1);
    expect(Number.isFinite(e.effectiveDf)).toBe(true);
  });
});

describe('orthonormal closed forms', () => {
  const n = 50;
  const p = 6;
  const z = orthonormal(n, p, 9);
  const rng = mulberry32(12);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = 5;
    for (let j = 0; j < p; j++) y[i] = y[i]! + (j - 2) * 0.7 * z.a[i * p + j]!;
    y[i] = y[i]! + normal(rng);
  }
  const ols = Array.from({ length: p }, (_, j) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += (z.a[i * p + j]! * (y[i]! - 5)) / n;
    // Z centered so Z'y/n uses y minus its mean; use true mean
    return s;
  });
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const bols = Array.from({ length: p }, (_, j) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += (z.a[i * p + j]! * (y[i]! - ybar)) / n;
    return s;
  });
  it('ridge = b / (1 + lambda), df = 1 + p / (1 + lambda)', () => {
    expect(ols.length).toBe(p);
    for (const l of [0.05, 0.3, 1.2]) {
      const f = ridgeFit(z, y, l);
      for (let j = 0; j < p; j++)
        expect(Math.abs(f.standardizedCoefs[j]! - bols[j]! / (1 + l))).toBeLessThan(1e-8);
      expect(Math.abs(f.effectiveDf - (1 + p / (1 + l)))).toBeLessThan(1e-8);
      expect(Math.abs(effectiveDf(z, l) - (1 + p / (1 + l)))).toBeLessThan(1e-8);
    }
  });
  it('ridgePath agrees with ridgeFit', () => {
    const ls = [0, 0.05, 0.3, 1.2, 7];
    const path = ridgePath(z, y, ls);
    ls.forEach((l, i) => {
      const f = ridgeFit(z, y, l);
      for (let j = 0; j < p; j++)
        expect(Math.abs(path[i]!.coefs[j]! - f.coefs[j]!)).toBeLessThan(1e-8);
      expect(Math.abs(path[i]!.effectiveDf - f.effectiveDf)).toBeLessThan(1e-8);
    });
  });
});
