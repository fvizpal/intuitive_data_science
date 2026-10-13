import { useSyncExternalStore } from 'react';

/**
 * State shared by the islands on this page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface Scenario {
  /** Points the average score moved (negative = applicants are riskier). */
  shift: number;
  /** Multiplier on the spread of today's scores. */
  spreadMult: number;
  /** Share of today's applicants from a new low-score group. */
  newSegmentShare: number;
}

export interface PageState extends Scenario {
  seed: number;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
  /** True once the PSI widget has appeared, which reveals the predict answer. */
  psiSeen: boolean;
}

export const DEFAULT_SEED = 8;
export const DEFAULT_SCENARIO: Scenario = {
  shift: -20,
  spreadMult: 1,
  newSegmentShare: 0,
};

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  ...DEFAULT_SCENARIO,
  guess: null,
  psiSeen: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

export const pageActions = {
  setShift: (v: number) => set({ shift: clamp(round(v, 5), -60, 60) }),
  setSpread: (v: number) => set({ spreadMult: clamp(round(v, 0.05), 0.6, 1.6) }),
  setScenario: (s: Scenario) => set({ ...s }),
  reshuffle: () => set({ seed: state.seed + 1 }),
  /** Back to the page defaults (the reader's prediction is kept). */
  reset: () => set({ seed: DEFAULT_SEED, ...DEFAULT_SCENARIO }),
  setGuess: (guess: number) => set({ guess }),
  markPsiSeen: () => {
    if (!state.psiSeen) set({ psiSeen: true });
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
