import { useSyncExternalStore } from 'react';
import { DEFAULT_SCALE, binPoints, scaling } from './scorecard';
import type { PointsTable, ScaleInput, Scaling } from './scorecard';
import { SCORECARD_SEED } from './pipeline';
import type { Fitted } from './pipeline';

/**
 * State shared by the islands on this page: the data seed, the score scale from the
 * ScaleDesigner, and the reader's prediction. Astro hydrates every widget as its own React
 * root, so a React context cannot span them; this tiny store (one per page load, never
 * persisted) is the smallest thing that can. It holds only controls, never data.
 */
export interface PageState {
  seed: number;
  scale: ScaleInput;
  scaling: Scaling;
  /** Index of the reader's pick in the predict prompt. */
  guess: number | null;
}

const INITIAL: PageState = {
  seed: SCORECARD_SEED,
  scale: DEFAULT_SCALE,
  scaling: scaling(DEFAULT_SCALE),
  guess: null,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  reshuffle: () => set({ seed: state.seed + 1 }),
  resetSeed: () => set({ seed: SCORECARD_SEED }),
  setScale: (patch: Partial<ScaleInput>) => {
    const scale = { ...state.scale, ...patch };
    set({ scale, scaling: scaling(scale) });
  },
  resetScale: () => set({ scale: DEFAULT_SCALE, scaling: INITIAL.scaling }),
  setGuess: (guess: number) => set({ guess }),
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

/** Points per bin change only when the scale sliders move, so memoize on the last inputs. */
let lastTable: { fitted: Fitted; scaling: Scaling; table: PointsTable } | null = null;
export function getPointsTable(fitted: Fitted, s: Scaling): PointsTable {
  if (lastTable && lastTable.fitted === fitted && lastTable.scaling === s) {
    return lastTable.table;
  }
  const table = binPoints(fitted.model, fitted.bins, s);
  lastTable = { fitted, scaling: s, table };
  return table;
}
