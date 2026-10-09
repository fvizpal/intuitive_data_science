import { useSyncExternalStore } from 'react';

/**
 * The reader's pick for the Predict prompt, shared between two islands (the prompt near
 * the top and the outlier widget that reveals the answer). Astro hydrates every widget
 * as its own React root, so a context cannot span them. One value, one page load, never
 * persisted.
 */
export const GUESS_OPTIONS = ['about 6', 'about 17', 'about 120'] as const;
/** Index of the right answer in GUESS_OPTIONS (the median). */
export const GUESS_ANSWER = 0;

let guess: number | null = null;
const listeners = new Set<() => void>();

export function setGuess(next: number) {
  guess = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useGuess(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => guess,
    () => null,
  );
}
