/**
 * The delivery-time world for the "units matter" widget. Pure TypeScript, no React.
 *
 * minutes = 10 + 2.5 * distance_km + 1.8 * items + Normal(0, 3), distance ~ Normal(6, 3) clipped to
 * [0.5, 20], items an integer from 1 to 8. Draws are row-interleaved per seed (common random numbers).
 */
import { mulberry32, normal } from '../../lib/random';
import { matOf } from './linalg';
import { ridgeFit } from './ridge';

export const DELIVERY_N = 60;
export const DELIVERY_NOISE = 3;
export const TRUE_PER_KM = 2.5;
export const TRUE_PER_ITEM = 1.8;
export const FRESH_ORDERS = 20000;
/** Fixed seed of the 20,000 fresh orders, the same for every reader and every training set. */
export const FRESH_SEED = 90210;

export interface Delivery {
  n: number;
  km: Float64Array;
  items: Float64Array;
  minutes: Float64Array;
}

export function makeDelivery(seed: number, n: number): Delivery {
  const rows = Math.max(0, Math.floor(n));
  const rng = mulberry32(seed);
  const km = new Float64Array(rows);
  const items = new Float64Array(rows);
  const minutes = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    km[i] = Math.min(20, Math.max(0.5, normal(rng, 6, 3)));
    items[i] = 1 + Math.floor(rng() * 8);
    minutes[i] =
      10 +
      TRUE_PER_KM * km[i]! +
      TRUE_PER_ITEM * items[i]! +
      normal(rng, 0, DELIVERY_NOISE);
  }
  return { n: rows, km, items, minutes };
}

let freshCache: Delivery | null = null;
/** Orders the model never saw. Cached: it never changes. */
export function makeDeliveryFresh(seed = FRESH_SEED, count = FRESH_ORDERS): Delivery {
  if (seed === FRESH_SEED && count === FRESH_ORDERS)
    return (freshCache ??= makeDelivery(seed, count));
  return makeDelivery(seed, count);
}

/** The fixed grid of 50 orders used to compare predictions: distance 1..14 km, items 1..8. */
export function predictionGrid(): { km: number[]; items: number[] } {
  const km: number[] = [];
  const items: number[] = [];
  for (let i = 0; i < 50; i++) {
    km.push(1 + (13 * i) / 49);
    items.push(1 + ((i * 3) % 8));
  }
  return { km, items };
}

export type Unit = 'km' | 'm';

export interface DeliveryFit {
  /** Coefficients converted back to minutes per km and minutes per item. */
  perKm: number;
  perItem: number;
  intercept: number;
  trainRmse: number;
  freshRmse: number;
  /** Predictions (minutes) on the fixed grid of 50 orders. */
  grid: number[];
}

export interface DeliveryOptions {
  unit: Unit;
  standardize: boolean;
  lambda: number;
}

const scale = (u: Unit) => (u === 'm' ? 1000 : 1);

export function fitDelivery(
  d: Delivery,
  { unit, standardize, lambda }: DeliveryOptions,
  fresh: Delivery | null = makeDeliveryFresh(),
): DeliveryFit {
  const s = scale(unit);
  const x = matOf(d.n, 2);
  for (let i = 0; i < d.n; i++) {
    x.a[i * 2] = d.km[i]! * s;
    x.a[i * 2 + 1] = d.items[i]!;
  }
  const f = ridgeFit(x, d.minutes, lambda, { standardize });
  const perKm = f.coefs[0]! * s;
  const perItem = f.coefs[1]!;
  const predict = (km: number, items: number) =>
    f.intercept + perKm * km + perItem * items;
  const rmse = (set: Delivery) => {
    if (set.n === 0) return 0;
    let t = 0;
    for (let i = 0; i < set.n; i++)
      t += (set.minutes[i]! - predict(set.km[i]!, set.items[i]!)) ** 2;
    return Math.sqrt(t / set.n);
  };
  const g = predictionGrid();
  return {
    perKm,
    perItem,
    intercept: f.intercept,
    trainRmse: rmse(d),
    freshRmse: fresh ? rmse(fresh) : 0,
    grid: g.km.map((k, i) => predict(k, g.items[i]!)),
  };
}

/** Largest gap, in minutes, between two sets of predictions on the same grid. */
export const maxGap = (a: number[], b: number[]): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};
