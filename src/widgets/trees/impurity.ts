/** How mixed a box is. Pure TypeScript, no React. 0 = all one kind. */
export type Measure = 'gini' | 'entropy';

const sum = (c: readonly number[]): number => {
  let s = 0;
  for (const v of c) s += v;
  return s;
};

/** Gini impurity: 1 - sum of squared shares. An empty box counts as pure (0). */
export function gini(counts: readonly number[]): number {
  const total = sum(counts);
  if (!(total > 0)) return 0;
  let s = 0;
  for (const c of counts) s += (c / total) ** 2;
  return Math.max(0, 1 - s);
}

/** Entropy in bits (log base 2), with 0 log 0 = 0. */
export function entropy(counts: readonly number[]): number {
  const total = sum(counts);
  if (!(total > 0)) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return Math.max(0, h);
}

export const impurityOf = (m: Measure): ((c: readonly number[]) => number) =>
  m === 'entropy' ? entropy : gini;

/** Average of the two boxes' impurities, weighted by how many rows each holds. */
export function weightedImpurity(
  left: readonly number[],
  right: readonly number[],
  measure: Measure = 'gini',
): number {
  const nl = sum(left);
  const nr = sum(right);
  const n = nl + nr;
  if (!(n > 0)) return 0;
  const f = impurityOf(measure);
  return (nl / n) * f(left) + (nr / n) * f(right);
}

/** Impurity before the split minus weighted impurity after. */
export function gain(
  parent: readonly number[],
  left: readonly number[],
  right: readonly number[],
  measure: Measure = 'gini',
): number {
  return impurityOf(measure)(parent) - weightedImpurity(left, right, measure);
}
