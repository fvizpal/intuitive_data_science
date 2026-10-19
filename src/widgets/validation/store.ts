import { useSyncExternalStore } from 'react';

/**
 * The page's one shared piece of state: the seed, plus what the predict prompt needs to
 * know about the coin-flip widget. Astro hydrates every widget as its own React root, so a
 * React context cannot span them; this tiny store (one per page load, never persisted) can.
 * Everything else lives in each widget.
 */
export interface PageState {
  seed: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** Settings of the coin-flip widget, for the predict reveal. */
  coin: { m: number; K: number };
  coinSeen: boolean;
}

export const DEFAULT_SEED = 38;
/** A "New data" press moves the seed this far, so derived streams never overlap. */
export const SEED_STEP = 1000;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  guess: null,
  coin: { m: 100, K: 50 },
  coinSeen: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  newData: () => set({ seed: state.seed + SEED_STEP }),
  setGuess: (guess: number) => set({ guess }),
  setCoin: (m: number, K: number) => {
    if (state.coin.m !== m || state.coin.K !== K || !state.coinSeen)
      set({ coin: { m, K }, coinSeen: true });
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
