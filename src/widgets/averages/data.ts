import { mulberry32, normal } from '../../lib/random';

/** Monthly turnover (₹ lakh) of nine small businesses. Shared by the Predict prompt and widget 2. */
export const TURNOVERS: readonly number[] = [4, 5, 5, 6, 6, 7, 7, 8, 9];
/** The one very large business. */
export const OUTLIER_DEFAULT = 120;
export const OUTLIER_MAX = 200;

export const DOT_MIN = 0;
export const DOT_MAX = 20;
export const DOT_COUNT = 15;
export const DOT_LIMIT = 25;
export const DOT_SEED = 3;

/** Whole numbers on a 0 to 20 line, mildly right-skewed so some values repeat. */
export function startingDots(seed: number, n = DOT_COUNT): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () =>
    Math.min(DOT_MAX, Math.max(DOT_MIN, Math.round(Math.exp(normal(rng, 1.65, 0.5))))),
  );
}

/** A fruit shop trip: price per kg and how many kg were bought. The cheap fruit is bought most. */
export const PURCHASES: readonly { name: string; price: number; kg: number }[] = [
  { name: 'Mangoes', price: 180, kg: 1 },
  { name: 'Grapes', price: 150, kg: 1 },
  { name: 'Apples', price: 120, kg: 2 },
  { name: 'Oranges', price: 80, kg: 4 },
  { name: 'Papayas', price: 50, kg: 5 },
  { name: 'Bananas', price: 40, kg: 10 },
];
/** The slider changes the kg of the last (cheapest, biggest) purchase. */
export const BIG_BUY_DEFAULT = 10;
export const BIG_BUY_MIN = 1;
export const BIG_BUY_MAX = 30;

/** Plain number for the page: one decimal, a real minus sign, never NaN. */
export function f1(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(1);
  return Number(s) === 0 ? '0.0' : `${v < 0 ? '−' : ''}${s}`;
}

/** Integer count or percent, never NaN. */
export function f0(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

/** "5", "5 and 7", "3, 5 and 8". */
export function listNumbers(values: readonly number[]): string {
  const s = values.map((v) => String(v));
  if (s.length <= 1) return s.join('');
  return `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const tens = v % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
  return `${v}${suffix}`;
}
