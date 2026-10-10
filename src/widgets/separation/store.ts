import { useSyncExternalStore } from 'react';
import {
  DEFAULT_CUTOFF,
  DEFAULT_SEED,
  DEFAULT_SEPARATION,
  SCORE_HI,
  SCORE_LO,
} from './model';

/**
 * State shared by the islands on this page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface PageState {
  seed: number;
  separation: number;
  cutoff: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** Pair draws in widget 3, valid only for the seed and separation they were made on. */
  pairs: { seed: number; separation: number; n: number };
}

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  separation: DEFAULT_SEPARATION,
  cutoff: DEFAULT_CUTOFF,
  guess: null,
  pairs: { seed: DEFAULT_SEED, separation: DEFAULT_SEPARATION, n: 0 },
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const clampCut = (v: number) => Math.round(Math.min(SCORE_HI, Math.max(SCORE_LO, v)));

export const pageActions = {
  setSeparation: (v: number) =>
    set({ separation: Math.round(Math.min(3, Math.max(0, v)) * 10) / 10 }),
  setCutoff: (v: number) => set({ cutoff: clampCut(v) }),
  reshuffle: () => set({ seed: state.seed + 1 }),
  /** Back to the page defaults (the reader's prediction is kept). */
  reset: () =>
    set({
      seed: DEFAULT_SEED,
      separation: DEFAULT_SEPARATION,
      cutoff: DEFAULT_CUTOFF,
    }),
  setGuess: (guess: number) => set({ guess }),
  setPairDraws: (n: number) =>
    set({ pairs: { seed: state.seed, separation: state.separation, n } }),
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function usePage(): PageState & { draws: number } {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
  const draws =
    s.pairs.seed === s.seed && s.pairs.separation === s.separation ? s.pairs.n : 0;
  return { ...s, draws };
}
