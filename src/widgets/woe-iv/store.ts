import { useSyncExternalStore } from 'react';
import { DEFAULT_SEED, generateLoans } from '../../lib/loanData';
import type { Loans } from '../../lib/loanData';
import type { RankedKey } from './features';

/**
 * State shared by the islands on one page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only the controls, not the data.
 */
export interface PageState {
  seed: number;
  feature: RankedKey;
  bin: number;
  /** The reader's pick for "which feature tells us the most", revealed in the ranking. */
  guess: RankedKey | null;
}

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  feature: 'bureau_score',
  bin: 0,
  guess: null,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  reshuffle: () => set({ seed: state.seed + 1, bin: 0 }),
  /** Back to the default dataset and selection (the guess is kept). */
  reset: () => set({ seed: DEFAULT_SEED, feature: INITIAL.feature, bin: 0 }),
  setFeature: (feature: RankedKey) => set({ feature, bin: 0 }),
  setBin: (bin: number) => set({ bin }),
  setGuess: (guess: RankedKey) => set({ guess }),
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

/** False during server rendering and hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Datasets are pure functions of the seed; keep the last few so widgets share one copy. */
const cache = new Map<number, Loans>();
export function getLoans(seed: number): Loans {
  let loans = cache.get(seed);
  if (!loans) {
    if (cache.size >= 4) cache.clear();
    loans = generateLoans(seed);
    cache.set(seed, loans);
  }
  return loans;
}
