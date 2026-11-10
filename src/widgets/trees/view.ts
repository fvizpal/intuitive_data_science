/** Small helpers shared by the tree widgets. Pure TypeScript. */
import type { Candidate } from './tree';
import { countsOf } from './tree';

export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Index of the candidate whose threshold is closest to v (0 when there are none). */
export function nearestIdx(curve: readonly Candidate[], v: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const d = Math.abs(curve[i]!.threshold - v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Apple/orange counts on the "yes" (feature < threshold) and "no" sides. */
export function sideCounts(
  X: number[][],
  y: readonly number[],
  rows: readonly number[],
  feature: number,
  threshold: number,
): { left: [number, number]; right: [number, number] } {
  const l: number[] = [];
  const r: number[] = [];
  for (const i of rows) (X[i]![feature]! < threshold ? l : r).push(i);
  return { left: countsOf(y, l), right: countsOf(y, r) };
}

/** "almost all apples" style note for a box, or null when it is not nearly pure. */
export function pureNote(
  c: readonly [number, number],
  names: [string, string] = ['apples', 'oranges'],
): string | null {
  const total = c[0] + c[1];
  if (total < 5) return null;
  const top = Math.max(c[0], c[1]);
  const kind = names[c[1] > c[0] ? 1 : 0];
  if (top === total) return `all ${kind}`;
  return top / total >= 0.9 ? `almost all ${kind}` : null;
}
