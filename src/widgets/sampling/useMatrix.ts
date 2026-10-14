import { useEffect, useState } from 'react';
import { prepareMatrix, readyMatrix, type SampleMatrix } from './sampling';

/**
 * The memoized sample matrix for a population, or null while it is still being built in
 * small slices after the widget appears (the widget shows a skeleton meanwhile).
 */
export function useMatrix(
  pop: ArrayLike<number>,
  maxN: number,
  reps: number,
  seed: number,
): SampleMatrix | null {
  const [, bump] = useState(0);
  const ready = readyMatrix(pop, maxN, reps, seed);
  useEffect(() => {
    if (readyMatrix(pop, maxN, reps, seed)) return;
    let alive = true;
    void prepareMatrix(pop, maxN, reps, seed).then(() => {
      if (alive) bump((x) => x + 1);
    });
    return () => {
      alive = false;
    };
  }, [pop, maxN, reps, seed]);
  return ready;
}

/** True when the reader asks the browser for less motion. Read at the moment of use. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
