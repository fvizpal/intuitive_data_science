import { useSyncExternalStore } from 'react';

/**
 * State shared across the page's widgets: the wide-dataset seed and size, the penalty-strength
 * slider position (widgets 2 and 4), the predict pick, and what widget 1's lines do (for the
 * predict reveal). Astro hydrates every widget as its own React root, so a React context cannot
 * span them; this tiny store (one per page load, never persisted) can. Widgets 1, 3 and 5 keep
 * their own controls.
 */
export type LeashShape = 'rises-first' | 'falls-then-rises' | 'keeps-falling';

export interface PageState {
  seed: number;
  /** Rows in the 20-feature dataset. */
  n: number;
  /** Slider position on the shared penalty grid: 0 = no penalty, 1..60 = log-spaced. */
  pos: number;
  guess: number | null;
  /** What the new-data error line does in widget 1, and whether it is at the defaults. */
  leash: { shape: LeashShape; atDefaults: boolean; n: number } | null;
}

export const DEFAULT_SEED = 11;
export const DEFAULT_N = 40;
export const N_WIDE = [30, 40, 100] as const;
/** A "New data" press moves the seed this far, so derived streams never overlap. */
export const SEED_STEP = 1000;
export const GRID_STEPS = 60;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  n: DEFAULT_N,
  pos: 0,
  guess: null,
  leash: null,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  newData: () => set({ seed: state.seed + SEED_STEP }),
  setN: (n: number) => set({ n }),
  setPos: (pos: number) =>
    set({ pos: Math.max(0, Math.min(GRID_STEPS, Math.round(pos))) }),
  /** Back to the defaults for the shared dataset and slider (the predict pick stays). */
  reset: () => set({ seed: DEFAULT_SEED, n: DEFAULT_N, pos: 0 }),
  setGuess: (guess: number) => set({ guess }),
  setLeash: (leash: PageState['leash']) => {
    const cur = state.leash;
    if (
      !cur ||
      !leash ||
      cur.shape !== leash.shape ||
      cur.atDefaults !== leash.atDefaults ||
      cur.n !== leash.n
    )
      set({ leash });
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
