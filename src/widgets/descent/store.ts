import { useSyncExternalStore } from 'react';

/**
 * State shared by widgets 1 and 4: the stretch (kappa) and the seed. Astro hydrates every
 * widget as its own React root, so a React context cannot span them; this tiny store (one per
 * page load, never persisted) can. The other widgets keep their own controls.
 *
 * `touched` is false until someone changes the stretch. Until then widget 1 shows its own
 * default (4) and widget 4 its own (100), and the shared value is the page default (10).
 */
export interface PageState {
  seed: number;
  kappa: number;
  touched: boolean;
}

export const DEFAULT_SEED = 42;
export const DEFAULT_KAPPA = 10;
export const KAPPA_MIN = 1;
export const KAPPA_MAX = 100;

const INITIAL: PageState = {
  seed: DEFAULT_SEED,
  kappa: DEFAULT_KAPPA,
  touched: false,
};

let state: PageState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<PageState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pageActions = {
  setKappa: (kappa: number) =>
    set({
      kappa: Math.min(
        KAPPA_MAX,
        Math.max(KAPPA_MIN, Number.isFinite(kappa) ? kappa : DEFAULT_KAPPA),
      ),
      touched: true,
    }),
  /** Back to the page defaults: stretch 10 (each widget shows its own default again). */
  resetBowl: () => set({ kappa: DEFAULT_KAPPA, touched: false }),
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

/** The stretch a widget shows: its own default until someone has changed the shared one. */
export const kappaFor = (p: PageState, widgetDefault: number): number =>
  p.touched ? p.kappa : widgetDefault;
