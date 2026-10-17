import { useSyncExternalStore } from 'react';
import { DEFAULT_NOISE, MAX_DEGREE } from './fit';

/**
 * State shared by the first three widgets and the predict prompt. Astro hydrates every
 * widget as its own React root, so a React context cannot span them; this tiny store (one
 * per page load, never persisted) is the smallest thing that can. It holds only controls.
 */
export type Shape = 'falls-then-rises' | 'keeps-falling' | 'rises-first';

export interface PageState {
  seed: number;
  n: number;
  noiseSd: number;
  degree: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** What the new-data error curve does at the current settings (set by the complexity curve). */
  shape: Shape | null;
}

export const DEFAULT_SEED = 1;
export const DEFAULT_N = 20;
export const DEFAULT_DEGREE = 1;
export const N_OPTIONS = [10, 20, 50, 200] as const;
/** A new "New data" press moves the seed this far, so streams (seed + index) never overlap. */
export const SEED_STEP = 1000;

/** Most flexible curve allowed with n points. */
export const capFor = (n: number): number => Math.max(1, Math.min(MAX_DEGREE, n - 1));

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  n: DEFAULT_N,
  noiseSd: DEFAULT_NOISE,
  degree: DEFAULT_DEGREE,
  guess: null,
  shape: null,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  newData: () => set({ seed: state.seed + SEED_STEP }),
  setN: (n: number) => set({ n, degree: Math.min(state.degree, capFor(n)) }),
  setNoise: (noiseSd: number) => set({ noiseSd }),
  setDegree: (degree: number) =>
    set({ degree: Math.max(1, Math.min(capFor(state.n), Math.round(degree))) }),
  /** Back to the defaults for the shared controls (the predict pick stays). */
  reset: () =>
    set({
      seed: DEFAULT_SEED,
      n: DEFAULT_N,
      noiseSd: DEFAULT_NOISE,
      degree: DEFAULT_DEGREE,
    }),
  setGuess: (guess: number) => set({ guess }),
  setShape: (shape: Shape) => {
    if (state.shape !== shape) set({ shape });
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
