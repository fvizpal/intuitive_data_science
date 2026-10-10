import { useSyncExternalStore } from 'react';
import { DEFAULT_SEED } from './data';

/**
 * State shared by the islands on this page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface PageState {
  seed: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** The "my value" marker of the 68-95-99.7 widget, in standard deviations. */
  z: number;
  /** True once the reader has played with that widget (this reveals the answer above). */
  touched: boolean;
}

export const Z_DEFAULT = 2;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  guess: null,
  z: Z_DEFAULT,
  touched: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  reshuffle: () => set({ seed: state.seed + 1 }),
  resetSeed: () => set({ seed: DEFAULT_SEED }),
  setGuess: (guess: number) => set({ guess }),
  setZ: (z: number) =>
    set({ z: Math.round(Math.min(4, Math.max(-4, z)) * 10) / 10, touched: true }),
  touch: () => set({ touched: true }),
  resetZ: () => set({ z: Z_DEFAULT, touched: false }),
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
