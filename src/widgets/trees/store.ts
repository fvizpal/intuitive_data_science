import { useSyncExternalStore } from 'react';

/**
 * State shared across the page's widgets: the fruit seed and sample size, and the predict
 * pick. Astro hydrates every widget as its own React root, so a React context cannot span
 * them; this tiny store (one per page load, never persisted) can. Every widget keeps its
 * own other controls.
 */
export interface PageState {
  seed: number;
  /** Fruit in each training sample. */
  n: number;
  guess: number | null;
  /** What widget 2's Score-by control shows, for the predict reveal. */
  scored: 'mix' | 'accuracy' | null;
}

export const DEFAULT_SEED = 1;
export const DEFAULT_N = 60;
export const N_OPTIONS = [30, 60, 200] as const;
/** A "New fruit" press moves the seed this far, so derived streams never overlap. */
export const SEED_STEP = 1000;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  n: DEFAULT_N,
  guess: null,
  scored: null,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  newFruit: () => set({ seed: state.seed + SEED_STEP }),
  setN: (n: number) => set({ n }),
  /** Back to the defaults for the shared sample (the predict pick stays). */
  reset: () => set({ seed: DEFAULT_SEED, n: DEFAULT_N }),
  setGuess: (guess: number) => set({ guess }),
  setScored: (scored: PageState['scored']) => {
    if (state.scored !== scored) set({ scored });
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
