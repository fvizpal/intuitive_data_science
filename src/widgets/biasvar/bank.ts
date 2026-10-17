/**
 * The "bank" behind the averaged widgets: for one (seed, n) it fits 200 training sets at
 * every degree once, off the main thread.
 *
 * Least squares is linear in y, and y = f(x) + sd * z. So a fit is A + sd * B, where A is the
 * fit to the noiseless truth and B the fit to the z draws. The bank stores A and B (never the
 * noise level) as small moments, which makes any noise level exact and instant:
 *   variance      = vAA + 2 sd vAB + sd^2 vBB
 *   test MSE      = uu - 2 sd ub + sd^2 bb      (mean over hours, then over sets)
 *   training MSE  = raa + 2 sd rab + sd^2 rbb   (mean over the training points)
 * fit.test.ts checks these against the direct decompose() and errorsByDegree().
 */
import {
  BIG,
  GRID_POINTS,
  MAX_DEGREE,
  defaultGrid,
  factorPoly,
  makeStream,
  trueCurve,
} from './fit';

export const BANK_SETS = 200;
export const SHOWN_SETS = 30;
/** Sets averaged by the complexity curve. */
export const CURVE_SETS = 60;

export interface DegreeBank {
  degree: number;
  /** Mean over sets of the fit to the noiseless truth / to the z draws, on the grid. */
  abar: Float64Array;
  bbar: Float64Array;
  vAA: number;
  vAB: number;
  vBB: number;
  /** Grids of the first SHOWN_SETS fits, set-major (set * 400 + grid point). */
  shownA: Float64Array;
  shownB: Float64Array;
  /** Per set: mean over hours of u^2, u*B, B^2 with u = f - A. */
  uu: Float64Array;
  ub: Float64Array;
  bb: Float64Array;
  /** Per set: mean over training points of rA^2, rA*rB, rB^2. */
  raa: Float64Array;
  rab: Float64Array;
  rbb: Float64Array;
}

export interface Bank {
  seed: number;
  n: number;
  cap: number;
  sets: number;
  /** Index 0 = degree 1. */
  degrees: DegreeBank[];
}

const clamp = (v: number) => (v > BIG ? BIG : v < -BIG ? -BIG : v);

let basisCache: Float64Array | null = null;
/** Chebyshev basis at the 400 grid hours, row-major, MAX_DEGREE + 1 columns. */
function gridBasis(): Float64Array {
  if (basisCache) return basisCache;
  const { g } = defaultGrid();
  const P = MAX_DEGREE + 1;
  const B = new Float64Array(g.length * P);
  for (let i = 0; i < g.length; i++) {
    const t = (2 * g[i]!) / 24 - 1;
    B[i * P] = 1;
    B[i * P + 1] = t;
    for (let k = 2; k < P; k++)
      B[i * P + k] = 2 * t * B[i * P + k - 1]! - B[i * P + k - 2]!;
  }
  basisCache = B;
  return B;
}

interface Inputs {
  xs: Float64Array[];
  fx: Float64Array[];
  z: Float64Array[];
}

/** Incremental builder: call step() until it returns true (one degree per step), then result(). */
export function createBankBuilder(seed: number, n: number, sets = BANK_SETS) {
  const cap = Math.max(1, Math.min(MAX_DEGREE, n - 1));
  const inputs: Inputs = { xs: [], fx: [], z: [] };
  for (let r = 0; r < sets; r++) {
    const s = makeStream(seed + r, n);
    inputs.xs.push(s.x);
    inputs.fx.push(s.x.map(trueCurve));
    inputs.z.push(s.z);
  }
  const { f } = defaultGrid();
  const G = GRID_POINTS;
  const P = MAX_DEGREE + 1;
  const basis = gridBasis();
  const degrees: DegreeBank[] = [];

  function buildDegree(d: number): DegreeBank {
    const R = sets;
    const gridA = new Float64Array(R * G);
    const gridB = new Float64Array(R * G);
    const uu = new Float64Array(R);
    const ub = new Float64Array(R);
    const bb = new Float64Array(R);
    const raa = new Float64Array(R);
    const rab = new Float64Array(R);
    const rbb = new Float64Array(R);
    for (let r = 0; r < R; r++) {
      const fac = factorPoly(inputs.xs[r]!, d);
      const ca = fac.solve(inputs.fx[r]!);
      const cb = fac.solve(inputs.z[r]!);
      const p = fac.p;
      let suu = 0;
      let sub = 0;
      let sbb = 0;
      for (let g = 0; g < G; g++) {
        let a = 0;
        let b = 0;
        for (let k = 0; k < p; k++) {
          const t = basis[g * P + k]!;
          a += ca[k]! * t;
          b += cb[k]! * t;
        }
        a = clamp(a);
        b = clamp(b);
        gridA[r * G + g] = a;
        gridB[r * G + g] = b;
        const u = f[g]! - a;
        suu += u * u;
        sub += u * b;
        sbb += b * b;
      }
      uu[r] = suu / G;
      ub[r] = sub / G;
      bb[r] = sbb / G;
      let saa = 0;
      let sab = 0;
      let sbb2 = 0;
      const nn = fac.n;
      for (let i = 0; i < nn; i++) {
        let a = 0;
        let b = 0;
        for (let k = 0; k < p; k++) {
          const t = fac.design[i * p + k]!;
          a += ca[k]! * t;
          b += cb[k]! * t;
        }
        const ra = inputs.fx[r]![i]! - a;
        const rb = inputs.z[r]![i]! - b;
        saa += ra * ra;
        sab += ra * rb;
        sbb2 += rb * rb;
      }
      raa[r] = saa / nn;
      rab[r] = sab / nn;
      rbb[r] = sbb2 / nn;
    }
    const abar = new Float64Array(G);
    const bbar = new Float64Array(G);
    for (let r = 0; r < R; r++)
      for (let g = 0; g < G; g++) {
        abar[g] = abar[g]! + gridA[r * G + g]! / R;
        bbar[g] = bbar[g]! + gridB[r * G + g]! / R;
      }
    let vAA = 0;
    let vAB = 0;
    let vBB = 0;
    for (let r = 0; r < R; r++)
      for (let g = 0; g < G; g++) {
        const da = gridA[r * G + g]! - abar[g]!;
        const db = gridB[r * G + g]! - bbar[g]!;
        vAA += da * da;
        vAB += da * db;
        vBB += db * db;
      }
    const denom = R * G;
    const keep = Math.min(SHOWN_SETS, R) * G;
    return {
      degree: d,
      abar,
      bbar,
      vAA: vAA / denom,
      vAB: vAB / denom,
      vBB: vBB / denom,
      shownA: gridA.slice(0, keep),
      shownB: gridB.slice(0, keep),
      uu,
      ub,
      bb,
      raa,
      rab,
      rbb,
    };
  }

  return {
    steps: cap,
    step(): boolean {
      degrees.push(buildDegree(degrees.length + 1));
      return degrees.length >= cap;
    },
    result(): Bank {
      return { seed, n, cap, sets, degrees };
    },
  };
}

export function buildBank(seed: number, n: number, sets = BANK_SETS): Bank {
  const b = createBankBuilder(seed, n, sets);
  while (!b.step());
  return b.result();
}

// ---------- reading a bank at any noise level ----------

const at = (bank: Bank, degree: number): DegreeBank =>
  bank.degrees[Math.max(1, Math.min(bank.cap, degree)) - 1]!;

export interface Parts {
  bias2: number;
  variance: number;
  noise2: number;
  total: number;
}

/** Bias, variance and noise at one degree, over all sets in the bank. */
export function partsAt(bank: Bank, degree: number, noiseSd: number): Parts {
  const d = at(bank, degree);
  const { f } = defaultGrid();
  let bias2 = 0;
  for (let g = 0; g < f.length; g++) {
    const gap = f[g]! - (d.abar[g]! + noiseSd * d.bbar[g]!);
    bias2 += gap * gap;
  }
  bias2 /= f.length;
  const variance = Math.max(0, d.vAA + 2 * noiseSd * d.vAB + noiseSd * noiseSd * d.vBB);
  const noise2 = noiseSd * noiseSd;
  return { bias2, variance, noise2, total: bias2 + variance + noise2 };
}

/** The mean fit (A + sd B averaged over sets) on the grid. */
export function meanCurve(bank: Bank, degree: number, noiseSd: number): Float64Array {
  const d = at(bank, degree);
  return d.abar.map((a, g) => a + noiseSd * d.bbar[g]!);
}

/** The k-th displayed fit (k < SHOWN_SETS) on the grid. */
export function shownCurve(
  bank: Bank,
  degree: number,
  noiseSd: number,
  k: number,
): Float64Array {
  const d = at(bank, degree);
  const out = new Float64Array(GRID_POINTS);
  for (let g = 0; g < GRID_POINTS; g++)
    out[g] = clamp(
      d.shownA[k * GRID_POINTS + g]! + noiseSd * d.shownB[k * GRID_POINTS + g]!,
    );
  return out;
}

export interface CurvePoint {
  /** Average training RMSE and average error on new data, over the first `sets` sets. */
  train: number;
  test: number;
}

export function errorsAt(
  bank: Bank,
  degree: number,
  noiseSd: number,
  sets = CURVE_SETS,
): CurvePoint {
  const d = at(bank, degree);
  const S = Math.min(sets, bank.sets);
  let tr = 0;
  let te = 0;
  for (let r = 0; r < S; r++) {
    tr += d.raa[r]! + 2 * noiseSd * d.rab[r]! + noiseSd * noiseSd * d.rbb[r]!;
    te += d.uu[r]! - 2 * noiseSd * d.ub[r]! + noiseSd * noiseSd * d.bb[r]!;
  }
  return {
    train: Math.sqrt(Math.max(0, tr / S)),
    test: Math.sqrt(noiseSd * noiseSd + Math.max(0, te / S)),
  };
}

export interface CurveSummary {
  degrees: number[];
  train: number[];
  test: number[];
  bestDegree: number;
}

export function curveSummary(
  bank: Bank,
  noiseSd: number,
  sets = CURVE_SETS,
): CurveSummary {
  const degrees: number[] = [];
  const train: number[] = [];
  const test: number[] = [];
  for (let d = 1; d <= bank.cap; d++) {
    const e = errorsAt(bank, d, noiseSd, sets);
    degrees.push(d);
    train.push(e.train);
    test.push(e.test);
  }
  let b = 0;
  for (let i = 1; i < test.length; i++) if (test[i]! < test[b]! - 1e-12) b = i;
  return { degrees, train, test, bestDegree: degrees[b] ?? 1 };
}
