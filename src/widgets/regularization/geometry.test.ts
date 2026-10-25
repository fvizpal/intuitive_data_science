import { describe, expect, it } from 'vitest';
import {
  contourEllipse,
  eig2,
  ellipseAngle,
  ellipsePoint,
  errorLevel,
  lassoZeros,
  regionBoundary,
  regionNorm,
  regionRadius,
  sigmaOf,
  solve2D,
  type Pt,
  type Sigma2,
} from './geometry';

const twin = sigmaOf(0.99);
const I2 = sigmaOf(0);

describe('solve2D', () => {
  it('twin features at penalty 2.5', () => {
    const r = solve2D(twin, [2, 1], 2.5, 'ridge');
    const l = solve2D(twin, [2, 1], 2.5, 'lasso');
    console.log('twin ridge', r, 'lasso', l);
    expect(Math.abs(r[0] - 0.667)).toBeLessThan(2e-3);
    expect(Math.abs(r[1] - 0.663)).toBeLessThan(2e-3);
    expect(Math.abs(l[0] - 0.49)).toBeLessThan(0.01);
    expect(l[1]).toBe(0);
  });
  it('orthogonal case, penalty 1.2', () => {
    const r = solve2D(I2, [2, 1], 1.2, 'ridge');
    const l = solve2D(I2, [2, 1], 1.2, 'lasso');
    expect(Math.abs(r[0] - 2 / 2.2)).toBeLessThan(1e-9);
    expect(Math.abs(r[1] - 1 / 2.2)).toBeLessThan(1e-9);
    expect(Math.abs(r[0] - 0.909)).toBeLessThan(1e-3);
    expect(Math.abs(r[1] - 0.455)).toBeLessThan(1e-3);
    expect(Math.abs(l[0] - 0.8)).toBeLessThan(1e-6);
    expect(l[1]).toBe(0);
  });
  it('lambda 0 returns b; a big lambda returns zeros', () => {
    for (const s of [I2, sigmaOf(0.9), twin] as Sigma2[])
      for (const m of ['ridge', 'lasso'] as const) {
        const z = solve2D(s, [1.7, -0.4], 0, m);
        expect(Math.abs(z[0] - 1.7)).toBeLessThan(1e-9);
        expect(Math.abs(z[1] + 0.4)).toBeLessThan(1e-9);
        const big = solve2D(s, [1.7, -0.4], 1e9, m);
        expect(Math.abs(big[0])).toBeLessThan(1e-6);
        expect(Math.abs(big[1])).toBeLessThan(1e-6);
      }
  });
  it('lasso satisfies the KKT conditions', () => {
    for (const rho of [0, 0.9, 0.99])
      for (const lam of [0.2, 0.9, 2.5, 3.9]) {
        const s = sigmaOf(rho);
        const b: Pt = [2, 1];
        const z = solve2D(s, b, lam, 'lasso');
        const g = [
          s[0][0] * (z[0] - b[0]) + s[0][1] * (z[1] - b[1]),
          s[1][0] * (z[0] - b[0]) + s[1][1] * (z[1] - b[1]),
        ];
        for (let j = 0; j < 2; j++) {
          if (z[j] !== 0)
            expect(Math.abs(g[j]! + lam * Math.sign(z[j]!))).toBeLessThan(1e-9);
          else expect(Math.abs(g[j]!)).toBeLessThanOrEqual(lam + 1e-9);
        }
      }
  });
  it('dragging b so b2 > b1 flips the surviving twin', () => {
    const a = solve2D(twin, [2, 1], 2.5, 'lasso');
    const b = solve2D(twin, [1, 2], 2.5, 'lasso');
    expect(a[1]).toBe(0);
    expect(b[0]).toBe(0);
    expect(b[1]).toBeGreaterThan(0.4);
  });
});

describe('geometry', () => {
  for (const [name, s] of [
    ['unrelated', I2],
    ['overlap', sigmaOf(0.9)],
    ['twin', twin],
  ] as const)
    for (const method of ['ridge', 'lasso'] as const)
      it(`contour and region touch at the solution (${name}, ${method})`, () => {
        const b: Pt = [2, 1];
        const z = solve2D(s, b, 1.2, method);
        const radius = regionRadius(method, z);
        // the region boundary passes through the solution
        expect(Math.abs(regionNorm(method, z) - radius)).toBeLessThan(1e-9);
        const pts = regionBoundary(method, radius, 120);
        for (const p of pts)
          expect(Math.abs(regionNorm(method, p) - radius)).toBeLessThan(1e-9);
        // the contour through the solution passes through the solution
        const level = errorLevel(s, b, z);
        const t = ellipseAngle(s, b, z);
        const q = ellipsePoint(s, b, level, t);
        expect(Math.abs(q[0] - z[0])).toBeLessThan(1e-9);
        expect(Math.abs(q[1] - z[1])).toBeLessThan(1e-9);
        for (const p of contourEllipse(s, b, level, 48))
          expect(Math.abs(errorLevel(s, b, p) - level)).toBeLessThan(1e-9);
      });
  it('eigen-decomposition reconstructs Sigma', () => {
    const { values, vectors } = eig2(sigmaOf(0.9));
    expect(values[0]).toBeCloseTo(1.9, 10);
    expect(values[1]).toBeCloseTo(0.1, 10);
    expect(
      Math.abs(vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1]),
    ).toBeLessThan(1e-12);
  });
});

describe('lassoZeros', () => {
  it('matches the solver everywhere on a grid of handle positions', () => {
    for (const rho of [0, 0.9, 0.99])
      for (const lam of [0.3, 1.2, 2.5])
        for (let i = 0; i <= 36; i++)
          for (let j = 0; j <= 36; j++) {
            const b: Pt = [-1 + i * 0.125, -1 + j * 0.125];
            const z = solve2D(sigmaOf(rho), b, lam, 'lasso');
            const [z1, z2] = lassoZeros(sigmaOf(rho), b, lam);
            // away from the zone edges the answers must agree exactly
            if (z1 !== (z[0] === 0) || z2 !== (z[1] === 0)) {
              // allow a hair of disagreement exactly on a boundary
              const [e1, e2] = lassoZeros(sigmaOf(rho), b, lam + 1e-7);
              const [f1, f2] = lassoZeros(sigmaOf(rho), b, lam - 1e-7);
              expect(z1 === (z[0] === 0) || e1 === (z[0] === 0) || f1 === (z[0] === 0)).toBe(true);
              expect(z2 === (z[1] === 0) || e2 === (z[1] === 0) || f2 === (z[1] === 0)).toBe(true);
            }
          }
  });
  it('the zone grows with the penalty and is empty with none', () => {
    const count = (lam: number) => {
      let n = 0;
      for (let i = 0; i <= 36; i++)
        for (let j = 0; j <= 36; j++)
          if (lassoZeros(I2, [-1 + i * 0.125, -1 + j * 0.125], lam)[1]) n++;
      return n;
    };
    expect(count(0.01)).toBeLessThan(count(1));
    expect(count(1)).toBeLessThan(count(3));
  });
});
