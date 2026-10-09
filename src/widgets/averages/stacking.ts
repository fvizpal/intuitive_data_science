/** Layout helpers for dot plots (pure, no React). */

/**
 * Stack level (0 = bottom) of every dot. Dots whose values fall in the same bin of width
 * `binSize` stack on top of each other, ordered by value and then by original index.
 */
export function stackLevels(values: readonly number[], binSize: number): number[] {
  const size = binSize > 0 ? binSize : 1;
  const order = values
    .map((v, i) => ({ v, i, bin: Math.round(v / size) }))
    .sort((a, b) => a.v - b.v || a.i - b.i);
  const next = new Map<number, number>();
  const levels = new Array<number>(values.length).fill(0);
  for (const { i, bin } of order) {
    const level = next.get(bin) ?? 0;
    levels[i] = level;
    next.set(bin, level + 1);
  }
  return levels;
}

/** Number of dots in the tallest stack. */
export const tallestStack = (levels: readonly number[]): number =>
  levels.length ? Math.max(...levels) + 1 : 0;

/** Evenly spaced tick values from `lo` to `hi` (inclusive) every `step`. */
export function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0)) return out;
  const n = Math.floor((hi - lo) / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(Number((lo + i * step).toFixed(10)));
  return out;
}
