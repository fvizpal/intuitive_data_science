import { describe, expect, it } from 'vitest';
import {
  bestLrQuad,
  convertBack,
  eig2,
  Hessian2,
  maxSafeLrQuad,
  olsFromNormalEquations,
  runQuadratic,
  standardize,
  stepQuadratic,
  stretchOf,
  type Mat2,
} from './general';
import { houseCorrelation, houseH, houseRows, makeHouses } from './houses';
import type { Pt } from './bowl';

const SEED = 42;
const mean = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  return s / v.length;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

function closedForm(H: Mat2): [number, number] {
  const tr = H[0][0] + H[1][1];
  const det = H[0][0] * H[1][1] - H[0][1] ** 2;
  const d = Math.sqrt((tr * tr) / 4 - det);
  return [tr / 2 + d, tr / 2 - d];
}

describe('houses', () => {
  it('is deterministic per seed and keeps the first rows when n changes', () => {
    const a = makeHouses(SEED);
    const b = makeHouses(SEED);
    expect(Array.from(a.price)).toEqual(Array.from(b.price));
    const small = makeHouses(SEED, 50);
    expect(Array.from(small.area)).toEqual(Array.from(a.area.slice(0, 50)));
    expect(Array.from(small.price)).toEqual(Array.from(a.price.slice(0, 50)));
    expect(Array.from(makeHouses(SEED + 1).area)).not.toEqual(Array.from(a.area));
    expect(makeHouses(1, 0).n).toBe(0);
  });

  it('centred columns have mean 0 and H matches two independent closed forms', () => {
    const h = makeHouses(SEED);
    for (const c of [h.areaC, h.roomsC, h.priceC])
      expect(Math.abs(mean(c))).toBeLessThan(1e-9);
    const H = houseH(h, false);
    const e = eig2(H);
    const cf = closedForm(H);
    expect(rel(e.values[0], cf[0])).toBeLessThan(1e-6);
    expect(rel(e.values[1], cf[1])).toBeLessThan(1e-6);
    // eigenvector check: H v = lambda v
    for (let i = 0; i < 2; i++) {
      const v = e.vectors[i]!;
      const hv = [H[0][0] * v[0] + H[0][1] * v[1], H[0][1] * v[0] + H[1][1] * v[1]];
      expect(Math.abs(hv[0]! - e.values[i]! * v[0])).toBeLessThan(1e-6 * e.values[0]);
      expect(Math.abs(hv[1]! - e.values[i]! * v[1])).toBeLessThan(1e-6 * e.values[0]);
    }
  });

  it('standardized H has a unit diagonal and stretch (1 + |r|) / (1 - |r|)', () => {
    const h = makeHouses(SEED);
    const Hs = houseH(h, true);
    const r = houseCorrelation(h);
    expect(Math.abs(Hs[0][0] - 1)).toBeLessThan(1e-9);
    expect(Math.abs(Hs[1][1] - 1)).toBeLessThan(1e-9);
    expect(Math.abs(Hs[0][1] - r)).toBeLessThan(1e-9);
    expect(Math.abs(stretchOf(Hs) - (1 + Math.abs(r)) / (1 - Math.abs(r)))).toBeLessThan(
      1e-9,
    );
    const rawStretch = stretchOf(houseH(h, false));
    console.log(
      `[report] houses: r = ${r.toFixed(4)}, raw stretch = ${rawStretch.toFixed(0)}, standardized stretch = ${stretchOf(Hs).toFixed(3)}`,
    );
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.7);
    expect(rawStretch).toBeGreaterThan(10000);
  });
});

describe('ols and convergence', () => {
  const h = makeHouses(SEED);
  const Xraw = houseRows(h, false);
  const Hraw = houseH(h, false);
  const wRaw = olsFromNormalEquations(Xraw, Array.from(h.priceC));
  const Xs = houseRows(h, true);
  const Hs = houseH(h, true);
  const wStd = olsFromNormalEquations(Xs, Array.from(h.priceC));

  it('normal equations give zero gradient', () => {
    const g = (H: Mat2, X: Pt[], w: Pt) => {
      // gradient of 0.5 mean((y - Xw)^2) is -X'(y - Xw)/n
      let g1 = 0;
      let g2 = 0;
      for (let i = 0; i < X.length; i++) {
        const e = h.priceC[i]! - (X[i]![0] * w[0] + X[i]![1] * w[1]);
        g1 -= X[i]![0] * e;
        g2 -= X[i]![1] * e;
      }
      return [g1 / X.length, g2 / X.length, H[0][0]];
    };
    const a = g(Hraw, Xraw, wRaw);
    expect(Math.abs(a[0]!)).toBeLessThan(1e-8);
    expect(Math.abs(a[1]!)).toBeLessThan(1e-8);
    const b = g(Hs, Xs, wStd);
    expect(Math.abs(b[0]!)).toBeLessThan(1e-8);
    expect(Math.abs(b[1]!)).toBeLessThan(1e-8);
  });

  it('the eigenbasis run matches literal gradient steps', () => {
    const lr = 0.9 * maxSafeLrQuad(Hs);
    const run = runQuadratic(Hs, [0, 0], wStd, lr);
    let w: Pt = [0, 0];
    for (let t = 1; t <= 40; t++) {
      w = stepQuadratic(Hs, w, wStd, lr);
      const c = run.at(t);
      expect(Math.abs(c[0] - w[0])).toBeLessThan(1e-9);
      expect(Math.abs(c[1] - w[1])).toBeLessThan(1e-9);
    }
    const lrRaw = 0.9 * maxSafeLrQuad(Hraw);
    const r2 = runQuadratic(Hraw, [0, 0], wRaw, lrRaw);
    let u: Pt = [0, 0];
    for (let t = 1; t <= 2000; t++) u = stepQuadratic(Hraw, u, wRaw, lrRaw);
    const c = r2.at(2000);
    expect(rel(c[0], u[0])).toBeLessThan(1e-6);
    expect(rel(c[1], u[1])).toBeLessThan(1e-6);
  });

  it('standardized descent converges and converts back to the raw least squares', () => {
    const run = runQuadratic(Hs, [0, 0], wStd, 0.9 * maxSafeLrQuad(Hs));
    expect(run.capped).toBe(false);
    console.log(
      `[report] standardized at 0.9 x safe limit: ${run.steps} steps; safe limit ${maxSafeLrQuad(Hs).toFixed(3)}`,
    );
    const end = run.at(2000);
    const { weights } = convertBack(
      end,
      [h.means.area, h.means.rooms],
      [h.sds.area, h.sds.rooms],
      h.means.price,
    );
    expect(Math.abs(weights[0] - wRaw[0])).toBeLessThan(1e-6);
    expect(Math.abs(weights[1] - wRaw[1])).toBeLessThan(1e-6);
    const direct = convertBack(
      wStd,
      [h.means.area, h.means.rooms],
      [h.sds.area, h.sds.rooms],
    );
    expect(Math.abs(direct.weights[0] - wRaw[0])).toBeLessThan(1e-9);
    expect(Math.abs(direct.weights[1] - wRaw[1])).toBeLessThan(1e-9);
  });

  it('best learning rate on standardized features meets the closed-form bound; raw is capped', () => {
    const stretch = stretchOf(Hs);
    const rate = (stretch - 1) / (stretch + 1);
    const bound = Math.ceil(Math.log(0.01) / (2 * Math.log(rate)));
    const best = runQuadratic(Hs, [0, 0], wStd, bestLrQuad(Hs));
    console.log(
      `[report] standardized best learning rate: bound ${bound}, simulated ${best.steps}`,
    );
    expect(best.steps!).toBeLessThanOrEqual(bound);

    const raw = runQuadratic(Hraw, [0, 0], wRaw, bestLrQuad(Hraw));
    expect(raw.capped).toBe(true);
    expect(raw.steps).toBeNull();
    const at90 = runQuadratic(Hraw, [0, 0], wRaw, 0.9 * maxSafeLrQuad(Hraw));
    console.log(
      `[report] raw: loss gap left after 100000 steps: best lr ${(raw.fractionLeft * 100).toFixed(1)}%, 0.9 x safe ${(at90.fractionLeft * 100).toFixed(1)}%; safe limit ${maxSafeLrQuad(Hraw).toExponential(2)}`,
    );
    console.log(`[report] raw at 0.9 x safe limit: ${at90.steps} steps`);
    expect(at90.steps ?? 100000).toBeGreaterThan(50000);
  });
});

describe('general edge cases', () => {
  it('standardize, empty inputs and invalid learning rates', () => {
    const s = standardize([
      [1, 10],
      [3, 30],
      [5, 50],
    ]);
    expect(Math.abs(mean(s.Z.map((r) => r[0])))).toBeLessThan(1e-12);
    const H = Hessian2(s.Z);
    expect(Math.abs(H[0][0] - 1)).toBeLessThan(1e-12);
    expect(standardize([]).Z).toEqual([]);
    expect(Hessian2([])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(olsFromNormalEquations([], [])).toEqual([0, 0]);
    const I: Mat2 = [
      [1, 0],
      [0, 1],
    ];
    expect(runQuadratic(I, [1, 1], [0, 0], -1).invalid).toBe(true);
    expect(runQuadratic(I, [1, 1], [0, 0], Number.NaN).invalid).toBe(true);
    const z = runQuadratic(I, [1, 1], [0, 0], 0);
    expect(z.capped).toBe(true);
    const d = runQuadratic(I, [1, 1], [0, 0], 3);
    expect(d.diverged).toBe(true);
    for (const g of d.gaps) expect(Number.isFinite(g)).toBe(true);
    expect(Number.isFinite(d.fractionLeft)).toBe(true);
  });
});
