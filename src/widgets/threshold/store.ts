import { useSyncExternalStore } from 'react';

/**
 * State shared by the islands on this page. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export const DEFAULT_SEED = 1;
export const DEFAULT_CUTOFF = 50;
export const DEFAULT_SHARE = 0.1;
export const FLAG_NOTHING = 101;

/** Widget 3 keeps its own three knobs, apart from the shared ones. */
export interface RareState {
  share: number;
  recall: number;
  falseAlarmRate: number;
}
export const DEFAULT_RARE: RareState = { share: 0.04, recall: 0.9, falseAlarmRate: 0.05 };

export interface PageState {
  seed: number;
  cutoff: number;
  /** Share of mail that is spam, shared by widgets 1, 2 and 4. */
  share: number;
  guess: number | null;
  rare: RareState;
  /** True once the rare-events widget has been scrolled into view (reveals the answer). */
  rareSeen: boolean;
}

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  cutoff: DEFAULT_CUTOFF,
  share: DEFAULT_SHARE,
  guess: null,
  rare: DEFAULT_RARE,
  rareSeen: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const pageActions = {
  setCutoff: (v: number) => set({ cutoff: Math.round(clamp(v, 0, FLAG_NOTHING)) }),
  setShare: (v: number) => set({ share: Math.round(clamp(v, 0.01, 0.5) * 100) / 100 }),
  newMail: () => set({ seed: state.seed + 1 }),
  /** Back to the page defaults (the reader's prediction is kept). */
  reset: () => set({ seed: DEFAULT_SEED, cutoff: DEFAULT_CUTOFF, share: DEFAULT_SHARE }),
  setGuess: (guess: number) => set({ guess }),
  setRare: (patch: Partial<RareState>) => set({ rare: { ...state.rare, ...patch } }),
  resetRare: () => set({ rare: DEFAULT_RARE }),
  markRareSeen: () => {
    if (!state.rareSeen) set({ rareSeen: true });
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
