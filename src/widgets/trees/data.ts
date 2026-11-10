/** Mock worlds for the decision-tree page. Pure TypeScript, no React. */
import { mulberry32, normal } from '../../lib/random';
import { Phi } from '../../lib/normal';

export const WEIGHT_RANGE = [60, 300] as const;
export const SHADE_RANGE = [0, 10] as const;
export const FRUIT_BOUNDS = {
  x0: WEIGHT_RANGE[0],
  x1: WEIGHT_RANGE[1],
  y0: SHADE_RANGE[0],
  y1: SHADE_RANGE[1],
} as const;

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Labeled {
  /** Rows of features. */
  X: number[][];
  /** 0 or 1 per row. */
  y: number[];
}

/**
 * Apples (0) and oranges (1), 50/50, features [weight in g, skin shade 0-10].
 * Each index has its own fixed uniform and two fixed standard normals, so a larger n
 * keeps every earlier row.
 */
export function makeFruit(seed: number, n: number): Labeled {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
    const u = rng();
    const z1 = normal(rng);
    const z2 = normal(rng);
    const orange = u >= 0.5;
    X.push([
      clip((orange ? 185 : 150) + 30 * z1, WEIGHT_RANGE[0], WEIGHT_RANGE[1]),
      clip((orange ? 6 : 3.5) + 1.6 * z2, SHADE_RANGE[0], SHADE_RANGE[1]),
    ]);
    y.push(orange ? 1 : 0);
  }
  return { X, y };
}

/** Class = (x < 0.5) XOR (y < 0.5). Row i sits in quadrant i mod 4, so quadrants are balanced. */
export function makeCheckerboard(seed: number, n = 200): Labeled {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const y: number[] = [];
  const m = Math.max(0, Math.floor(n));
  for (let i = 0; i < m; i++) {
    const q = i % 4;
    const right = q === 1 || q === 3;
    const top = q === 2 || q === 3;
    const x = (right ? 0.5 : 0) + 0.5 * rng();
    const v = (top ? 0.5 : 0) + 0.5 * rng();
    X.push([x, v]);
    y.push(x < 0.5 !== v < 0.5 ? 1 : 0);
  }
  return { X, y };
}

/** Weight x shade grid cell centres (size x size), row-major. */
export function makeFruitGrid(size = 40): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++)
      out.push([
        WEIGHT_RANGE[0] + ((i + 0.5) / size) * (WEIGHT_RANGE[1] - WEIGHT_RANGE[0]),
        SHADE_RANGE[0] + ((j + 0.5) / size) * (SHADE_RANGE[1] - SHADE_RANGE[0]),
      ]);
  return out;
}

/** The best any rule can do on unclipped fruit: Phi(d / 2), d the distance between the classes. */
export function bayesAccuracyFruit(): number {
  const d = Math.sqrt((35 / 30) ** 2 + (2.5 / 1.6) ** 2);
  return Phi(d / 2);
}

// ---------- delivery world ----------

export const DELIVERY_NOISE = 3;
export const deliveryTruth = (km: number): number => 8 + 2.5 * km;
export const TRAIN_KM = [1, 10] as const;
export const NEW_KM = [10, 16] as const;

export interface DeliveryData {
  x: number[];
  y: number[];
}

/** Orders: distance ~ Uniform(1, maxKm), time = 8 + 2.5 km + Normal(0, 3). Prefix-stable in n. */
export function makeDelivery(
  seed: number,
  n: number,
  opts: { maxKm?: number } = {},
): DeliveryData {
  const maxKm = opts.maxKm ?? 10;
  const rng = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
    const u = rng();
    const z = normal(rng);
    const km = 1 + (maxKm - 1) * u;
    x.push(km);
    y.push(deliveryTruth(km) + DELIVERY_NOISE * z);
  }
  return { x, y };
}

/** Evenly spaced cell centres on [lo, hi]. */
export function makeDeliveryGrid(lo: number, hi: number, points = 400): number[] {
  const g: number[] = [];
  for (let i = 0; i < points; i++) g.push(lo + ((i + 0.5) / points) * (hi - lo));
  return g;
}
