import { mulberry32, normal } from '../../lib/random';

export interface Pair {
  x: number;
  y: number;
}

export function mean(v: readonly number[]): number {
  if (v.length === 0) return 0;
  let s = 0;
  for (const a of v) s += a;
  return s / v.length;
}

/** Sample standard deviation (n − 1). Returns 0 for fewer than two values. */
export function std(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  let s = 0;
  for (const a of v) s += (a - m) ** 2;
  return Math.sqrt(s / (v.length - 1));
}

/** Pearson correlation. Returns 0 (never NaN) when either input has no spread. */
export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  if (!(den > 1e-12) || !Number.isFinite(den)) return 0;
  return Math.max(-1, Math.min(1, sxy / den));
}

/** Ranks starting at 1; tied values share the average of their ranks. */
export function rank(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]![1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(x: readonly number[], y: readonly number[]): number {
  return pearson(rank(x), rank(y));
}

/** Residual of `v` after removing its projection on `u` (both centered first). */
function residualize(v: number[], u: number[]): number[] {
  const mu = mean(u);
  const mv = mean(v);
  const uc = u.map((a) => a - mu);
  const vc = v.map((a) => a - mv);
  let uv = 0;
  let uu = 0;
  for (let i = 0; i < uc.length; i++) {
    uv += uc[i]! * vc[i]!;
    uu += uc[i]! ** 2;
  }
  const b = uu > 0 ? uv / uu : 0;
  return vc.map((a, i) => a - b * uc[i]!);
}

const standardize = (v: number[]): number[] => {
  const m = mean(v);
  const s = std(v) || 1;
  return v.map((a) => (a - m) / s);
};

/**
 * Standard-normal pairs with target correlation rho: y = rho·z1 + √(1−rho²)·z2.
 * With `exact`, z2 is made exactly uncorrelated with z1 and both are standardized,
 * so the sample correlation equals rho (handy when the UI shows rho as "the r").
 */
export function genCorrelated(
  seed: number,
  n: number,
  rho: number,
  { exact = false }: { exact?: boolean } = {},
): Pair[] {
  const rng = mulberry32(seed);
  const r = Math.max(-1, Math.min(1, rho));
  let z1 = Array.from({ length: n }, () => normal(rng));
  let z2 = Array.from({ length: n }, () => normal(rng));
  if (exact && n > 2) {
    z1 = standardize(z1);
    z2 = standardize(residualize(z2, z1));
  }
  const c = Math.sqrt(1 - r * r);
  return z1.map((a, i) => ({ x: a, y: r * a + c * z2[i]! }));
}

export interface OlsResult {
  beta1: number;
  beta2: number;
  /** True when the design was (near-)singular and a tiny ridge penalty was used. */
  singular: boolean;
}

const BETA_CAP = 1e3;
const capBeta = (b: number) =>
  Number.isFinite(b) ? Math.max(-BETA_CAP, Math.min(BETA_CAP, b)) : 0;

/** One-feature least squares slope on centered data. */
export function ols1(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  return sxx > 1e-12 ? capBeta(sxy / sxx) : 0;
}

/**
 * Two-feature least squares on centered data via the 2×2 normal equations.
 * Near-singular designs (x2 ≈ x1) fall back to a tiny ridge penalty and are flagged,
 * so the result is always finite.
 */
export function ols2(
  x1: readonly number[],
  x2: readonly number[],
  y: readonly number[],
): OlsResult {
  const n = Math.min(x1.length, x2.length, y.length);
  const m1 = mean(x1.slice(0, n));
  const m2 = mean(x2.slice(0, n));
  const my = mean(y.slice(0, n));
  let a = 0; // Σ x1²
  let b = 0; // Σ x1·x2
  let d = 0; // Σ x2²
  let p = 0; // Σ x1·y
  let q = 0; // Σ x2·y
  for (let i = 0; i < n; i++) {
    const u = x1[i]! - m1;
    const v = x2[i]! - m2;
    const w = y[i]! - my;
    a += u * u;
    b += u * v;
    d += v * v;
    p += u * w;
    q += v * w;
  }
  const scale = a + d;
  if (!(scale > 1e-12)) return { beta1: 0, beta2: 0, singular: true };
  let det = a * d - b * b;
  let singular = false;
  if (det <= 1e-9 * scale * scale) {
    singular = true;
    const lambda = 1e-6 * scale;
    a += lambda;
    d += lambda;
    det = a * d - b * b;
  }
  return {
    beta1: capBeta((d * p - b * q) / det),
    beta2: capBeta((a * q - b * p) / det),
    singular,
  };
}

/** Resample indices with replacement (seeded). */
export function bootstrap(indices: readonly number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const n = indices.length;
  return Array.from({ length: n }, () => indices[Math.floor(rng() * n)]!);
}

/** Pearson r split into agreeing and disagreeing parts (each ≥ 0, agree − disagree = r). */
export function rectangleParts(pts: readonly Pair[]): {
  agree: number;
  disagree: number;
  r: number;
  mx: number;
  my: number;
} {
  const mx = mean(pts.map((p) => p.x));
  const my = mean(pts.map((p) => p.y));
  let agree = 0;
  let disagree = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pts) {
    const prod = (p.x - mx) * (p.y - my);
    if (prod >= 0) agree += prod;
    else disagree -= prod;
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const den = Math.sqrt(sxx * syy);
  if (!(den > 1e-12)) return { agree: 0, disagree: 0, r: 0, mx, my };
  return {
    agree: agree / den,
    disagree: disagree / den,
    r: (agree - disagree) / den,
    mx,
    my,
  };
}

/** Plain-language strength and direction of a correlation. */
export function describeR(r: number): string {
  // Classify the displayed (2-decimal) value so the words always match the number.
  const a = Math.round(Math.abs(r) * 100) / 100;
  if (a < 0.1) return 'no linear link';
  const strength =
    a < 0.3
      ? 'weak'
      : a < 0.6
        ? 'moderate'
        : a < 0.85
          ? 'strong'
          : a < 0.995
            ? 'very strong'
            : 'perfect';
  return `${strength} ${r > 0 ? 'positive' : 'negative'}`;
}

/** Formats a number for display; never shows NaN or Infinity. */
export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s.replace('-', '−');
}
