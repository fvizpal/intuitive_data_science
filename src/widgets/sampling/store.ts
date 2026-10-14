import { useSyncExternalStore } from 'react';

/**
 * State shared by the islands on this page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface PageState {
  seed: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** True once the reader has put widget 3 at 100 people, and at 400. */
  saw100: boolean;
  saw400: boolean;
}

export const DEFAULT_SEED = 1;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  guess: null,
  saw100: false,
  saw400: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  newPopulation: () => set({ seed: state.seed + 1 }),
  resetSeed: () => set({ seed: DEFAULT_SEED }),
  setGuess: (guess: number) => set({ guess }),
  markN: (n: number) => {
    if (n === 100 && !state.saw100) set({ saw100: true });
    if (n === 400 && !state.saw400) set({ saw400: true });
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function usePage(): PageState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
