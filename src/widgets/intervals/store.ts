import { useSyncExternalStore } from 'react';
import { DEFAULT_LEVEL, type Level } from './intervals';

/**
 * State shared by widgets 1 to 3 (and the predict prompt). Astro hydrates every widget as
 * its own React root, so a React context cannot span them; this tiny store (one per page
 * load, never persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface PageState {
  seed: number;
  level: Level;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** Latched once the reader has drawn 100+ intervals at 95%. */
  answerSeen: boolean;
}

export const DEFAULT_SEED = 1;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  level: DEFAULT_LEVEL,
  guess: null,
  answerSeen: false,
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
  setLevel: (level: Level) => set({ level }),
  setGuess: (guess: number) => set({ guess }),
  markAnswerSeen: () => {
    if (!state.answerSeen) set({ answerSeen: true });
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
