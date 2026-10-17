/**
 * Memoised mail streams. A stream is built once per (seed, n); the labels, the sorted
 * threshold curve and the histogram once per (seed, n, spam share). Moving the cutoff or
 * the cost slider only reads from these, so it never touches the raw emails.
 */
import {
  DEFAULT_THRESHOLDS,
  bestByF1,
  curveByThreshold,
  makeStream,
  mailFromStream,
  type Best,
  type CurveRow,
} from './threshold';

export const N_SMALL = 2000;
export const N_LARGE = 20000;
export const BINS = 20; // 5-point bins over 0 to 100

export interface MailView {
  n: number;
  spam: number;
  good: number;
  /** One confusion row per cutoff 0..101; index = cutoff. */
  curve: CurveRow[];
  bestF1: Best | null;
  hist: { good: number[]; spam: number[]; max: number };
}

const MAX_CACHED = 12;
const streams = new Map<string, ReturnType<typeof makeStream>>();
const views = new Map<string, MailView>();

const remember = <V>(map: Map<string, V>, key: string, value: V) => {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHED) map.delete(map.keys().next().value as string);
};

const viewKey = (seed: number, n: number, share: number) => `${seed}:${n}:${share}`;

/** The view if it is already built (never builds). */
export const peekMail = (seed: number, n: number, share: number): MailView | null =>
  views.get(viewKey(seed, n, share)) ?? null;

export function getMail(seed: number, n: number, share: number): MailView {
  const key = viewKey(seed, n, share);
  const hit = views.get(key);
  if (hit) return hit;

  const sk = `${seed}:${n}`;
  let stream = streams.get(sk);
  if (!stream) {
    stream = makeStream(seed, n);
    remember(streams, sk, stream);
  }
  const { scores, labels } = mailFromStream(stream, n, share);
  const curve = curveByThreshold(scores, labels, DEFAULT_THRESHOLDS);
  const good = new Array<number>(BINS).fill(0);
  const spamBins = new Array<number>(BINS).fill(0);
  let spam = 0;
  for (let i = 0; i < n; i++) {
    const b = Math.min(BINS - 1, Math.floor(scores[i]! / 5));
    if (labels[i]) {
      spamBins[b]!++;
      spam++;
    } else good[b]!++;
  }
  const view: MailView = {
    n,
    spam,
    good: n - spam,
    curve,
    bestF1: bestByF1(curve),
    hist: { good, spam: spamBins, max: Math.max(1, ...good, ...spamBins) },
  };
  remember(views, key, view);
  return view;
}
