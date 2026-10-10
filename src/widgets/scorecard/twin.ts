/** The "near-duplicate feature" for the weights widget. Lives here, not in generateLoans. */
import { mulberry32, normal } from '../../lib/random';
import { fitLogistic } from './scorecard';
import type { LogisticModel } from './scorecard';
import type { Fitted } from './pipeline';

function sd(v: readonly number[]): number {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

/** Remove from `v` its projection onto each (modified Gram-Schmidt) column in `against`. */
function residualize(v: number[], against: readonly (readonly number[])[]): number[] {
  const basis: number[][] = [];
  for (const col of against) {
    const u = [...col];
    for (const q of basis) {
      let d = 0;
      for (let i = 0; i < u.length; i++) d += u[i]! * q[i]!;
      for (let i = 0; i < u.length; i++) u[i]! -= d * q[i]!;
    }
    const norm = Math.sqrt(u.reduce((s, x) => s + x * x, 0));
    if (norm > 1e-9) basis.push(u.map((x) => x / norm));
  }
  const out = [...v];
  for (const q of basis) {
    let d = 0;
    for (let i = 0; i < out.length; i++) d += out[i]! * q[i]!;
    for (let i = 0; i < out.length; i++) out[i]! -= d * q[i]!;
  }
  return out;
}

/**
 * Two near-duplicates of a column whose correlation with EACH OTHER is `corr` (1 = exact
 * duplicates): column + noise and column - noise. They are equally informative and carry
 * the same signal, so a sensible model splits the credit between them instead of
 * counting the evidence twice. The noise is made uncorrelated with the columns in
 * `against` (outcome, other features) so the split does not depend on a lucky draw.
 */
export function twinCopies(
  col: readonly number[],
  corr: number,
  seed: number,
  against: readonly (readonly number[])[] = [],
): [number[], number[]] {
  if (corr >= 1) return [[...col], [...col]];
  const rng = mulberry32(seed);
  // corr(a, b) = (1 - k) / (1 + k) with k = noise variance / column variance.
  const k = (1 - corr) / (1 + corr);
  const noiseSd = sd(col) * Math.sqrt(k);
  const raw = residualize(
    col.map(() => normal(rng)),
    against,
  );
  const e = raw.map((v) => (v * noiseSd) / (sd(raw) || 1));
  return [col.map((v, i) => v + e[i]!), col.map((v, i) => v - e[i]!)];
}

export function correlation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

export const TWIN_CORRELATION = 0.95;

/**
 * Replace the bureau-score WoE column with two near-duplicate copies (the first stays in
 * column 0, the second is appended last) and refit.
 */
export function fitWithTwin(
  fitted: Fitted,
  corr = TWIN_CORRELATION,
  seed = fitted.loans.seed,
): { model: LogisticModel; twinCorrelation: number } {
  const bureau = fitted.X.map((r) => r[0]!);
  const others = fitted.X.map((r) => r.slice(1));
  const against = [
    fitted.y.map(() => 1),
    fitted.y,
    bureau,
    ...others[0]!.map((_, j) => others.map((r) => r[j]!)),
  ];
  const [a, b] = twinCopies(bureau, corr, seed + 1000, against);
  const X = fitted.X.map((r, i) => [a[i]!, ...r.slice(1), b[i]!]);
  return { model: fitLogistic(X, fitted.y), twinCorrelation: correlation(a, b) };
}

const cache = new Map<number, { model: LogisticModel; twinCorrelation: number }>();
export function getTwinFit(fitted: Fitted) {
  const key = fitted.loans.seed;
  let r = cache.get(key);
  if (!r) {
    if (cache.size >= 4) cache.clear();
    r = fitWithTwin(fitted);
    cache.set(key, r);
  }
  return r;
}
