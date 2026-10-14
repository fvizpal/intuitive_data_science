/**
 * Mock populations for the sampling page. About 10,000 values each, built from a seed with
 * lib/random.ts, so every reader sees the same crowd. No React.
 */
import { mulberry32, normal } from './random';

export const POP_SIZE = 10_000;

export type PopId = 'commute' | 'cricket' | 'dice' | 'cafe' | 'views' | 'bulbs';

export interface PopMeta {
  id: PopId;
  /** Short name for pills and headings. */
  label: string;
  /** What one value is, in plain words. */
  what: string;
  unit: string;
  unitShort: string;
  /** Axis range for drawing the population itself. */
  xMin: number;
  xMax: number;
  /** Bin width for drawing the population itself. */
  binWidth: number;
  /** Plain-language shape. */
  shape: string;
}

export const POP_META: Record<PopId, PopMeta> = {
  commute: {
    id: 'commute',
    label: 'Commute times',
    what: 'one commute',
    unit: 'minutes',
    unitShort: 'min',
    xMin: 0,
    xMax: 120,
    binWidth: 5,
    shape: 'long tail to the right',
  },
  cricket: {
    id: 'cricket',
    label: 'Cricket innings',
    what: 'one innings',
    unit: 'runs',
    unitShort: 'runs',
    xMin: 0,
    xMax: 120,
    binWidth: 3,
    shape: 'spike at 0, then a long tail',
  },
  dice: {
    id: 'dice',
    label: 'Dice rolls',
    what: 'one roll',
    unit: 'pips',
    unitShort: '',
    xMin: 0.5,
    xMax: 6.5,
    binWidth: 1,
    shape: 'flat: every face equally likely',
  },
  cafe: {
    id: 'cafe',
    label: 'Café arrival time',
    what: 'one arrival',
    unit: 'hour of the day',
    unitShort: 'h',
    xMin: 7,
    xMax: 22,
    binWidth: 0.5,
    shape: 'two humps: lunch and dinner',
  },
  views: {
    id: 'views',
    label: 'Video views',
    what: 'one video',
    unit: 'thousand views',
    unitShort: 'k views',
    xMin: 0,
    xMax: 20,
    binWidth: 0.5,
    shape: 'a few giants and many small',
  },
  bulbs: {
    id: 'bulbs',
    label: 'Bulbs',
    what: 'one bulb',
    unit: '1 = faulty',
    unitShort: '',
    xMin: -0.5,
    xMax: 1.5,
    binWidth: 1,
    shape: 'mostly 0, 4% are 1',
  },
};

const SALT: Record<PopId, number> = {
  commute: 11,
  cricket: 23,
  dice: 37,
  cafe: 41,
  views: 53,
  bulbs: 67,
};

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rngFor = (id: PopId, seed: number) => mulberry32(SALT[id] * 1_000_003 + seed);

function build(id: PopId, seed: number): number[] {
  const rng = rngFor(id, seed);
  const out = new Array<number>(POP_SIZE);
  switch (id) {
    case 'commute':
      for (let i = 0; i < POP_SIZE; i++)
        out[i] = Math.round(clip(Math.exp(normal(rng, 3.34, 0.5)), 3, 180));
      break;
    case 'cricket':
      for (let i = 0; i < POP_SIZE; i++)
        out[i] =
          rng() < 0.12
            ? 0
            : Math.max(
                1,
                Math.min(200, Math.round(Math.exp(normal(rng, Math.log(28), 0.9)))),
              );
      break;
    case 'dice':
      for (let i = 0; i < POP_SIZE; i++) out[i] = 1 + Math.floor(rng() * 6);
      break;
    case 'cafe':
      for (let i = 0; i < POP_SIZE; i++) {
        const v = rng() < 0.5 ? normal(rng, 13, 1.5) : normal(rng, 20, 1.5);
        out[i] = Math.round(clip(v, 7, 22) * 100) / 100;
      }
      break;
    case 'views':
      for (let i = 0; i < POP_SIZE; i++)
        out[i] = Math.round(Math.exp(normal(rng, Math.log(2), 1.2)) * 10) / 10;
      break;
    case 'bulbs': {
      for (let i = 0; i < POP_SIZE; i++) out[i] = i < 400 ? 1 : 0;
      for (let i = POP_SIZE - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = out[i]!;
        out[i] = out[j]!;
        out[j] = t;
      }
      break;
    }
  }
  return out;
}

const cache = new Map<string, number[]>();

/**
 * The population for an id and seed. Same arguments return the same array (identity), which
 * the sample matrix uses as its cache key. Treat the array as read-only.
 */
export function getPopulation(id: PopId, seed: number): number[] {
  const key = `${id}|${seed}`;
  let pop = cache.get(key);
  if (!pop) {
    if (cache.size >= 24) cache.delete(cache.keys().next().value as string);
    pop = build(id, seed);
    cache.set(key, pop);
  }
  return pop;
}

export const commute = (seed: number) => getPopulation('commute', seed);
export const cricket = (seed: number) => getPopulation('cricket', seed);
export const dice = (seed: number) => getPopulation('dice', seed);
export const cafe = (seed: number) => getPopulation('cafe', seed);
export const views = (seed: number) => getPopulation('views', seed);
export const bulbs = (seed: number) => getPopulation('bulbs', seed);
