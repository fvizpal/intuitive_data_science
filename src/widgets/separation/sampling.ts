/** Repeated subsamples of a scored pool: how much do Gini and KS wobble? */
import { mulberry32 } from '../../lib/random';
import { auc, gini, ks } from './metrics';

export interface SampleResult {
  gini: number;
  ks: number;
  /** Bads in this sample. */
  nBad: number;
}

/** `count` samples of `size` applicants each, drawn without replacement. Seeded. */
export function drawSamples(
  scores: ArrayLike<number>,
  flags: ArrayLike<number>,
  size: number,
  count: number,
  seed: number,
): SampleResult[] {
  const n = scores.length;
  const k = Math.min(size, n);
  const out: SampleResult[] = [];
  for (let s = 0; s < count; s++) {
    const rng = mulberry32(seed * 1009 + s);
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    // Partial Fisher-Yates: the first k entries are a uniform sample.
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (n - i));
      const t = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = t;
    }
    const goods: number[] = [];
    const bads: number[] = [];
    for (let i = 0; i < k; i++) {
      const r = idx[i]!;
      (flags[r] ? goods : bads).push(scores[r]!);
    }
    const a = auc(goods, bads);
    const kk = ks(goods, bads);
    if (a === null || kk === null) continue; // a sample with no bads says nothing
    out.push({ gini: gini(a) ?? 0, ks: kk.ks, nBad: bads.length });
  }
  return out;
}

export interface Summary {
  min: number;
  max: number;
  mean: number;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / values.length };
}
