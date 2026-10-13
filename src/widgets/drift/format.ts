/** Plain-language readings and number formats for the PSI page. Pure, no React. */
import { BASE_SD, PSI_INVESTIGATE, PSI_SIGNIFICANT, psiBand } from './psi';
import type { PsiBand } from './psi';

/** PSI: three decimals while it is small, two once it is large. Never NaN. */
export const fmtPsi = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v < 0.3
      ? v.toFixed(3)
      : v.toFixed(2);

export const fmtPct1 = (v: number): string =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
export const fmtPct0 = (v: number): string =>
  Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—';
export const fmt2 = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2);
export const fmtInt = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : '—';

export interface BandInfo {
  band: PsiBand;
  label: string;
  icon: string;
  /** CSS color token (never the only signal: the icon and label say it too). */
  color: string;
  /** What the band means in one friendly line. */
  reading: string;
}

const BANDS: Record<PsiBand, BandInfo> = {
  stable: {
    band: 'stable',
    label: 'Stable',
    icon: '✓',
    color: 'var(--color-good)',
    reading: 'Little has changed: keep monitoring.',
  },
  investigate: {
    band: 'investigate',
    label: 'Investigate',
    icon: '▲',
    color: 'var(--color-neg)',
    reading: 'A noticeable shift: investigate.',
  },
  'significant shift': {
    band: 'significant shift',
    label: 'Significant shift',
    icon: '✖',
    color: 'var(--color-bad)',
    reading: 'A large shift: investigate now.',
  },
};

export const bandInfo = (value: number): BandInfo => BANDS[psiBand(value)];

export const BAND_CONVENTIONS = `below ${PSI_INVESTIGATE} stable, ${PSI_INVESTIGATE} to under ${PSI_SIGNIFICANT} investigate, ${PSI_SIGNIFICANT} and up significant shift`;

/** "a third", "half", "1.5 standard deviations" for a distance measured in SDs. */
export function sdPhrase(d: number): string {
  const x = Math.abs(d);
  if (!Number.isFinite(x)) return 'an unknown amount';
  if (x < 0.08) return 'almost nothing';
  const named: [number, string][] = [
    [1 / 6, 'about a sixth of a standard deviation'],
    [1 / 3, 'about a third of a standard deviation'],
    [1 / 2, 'about half a standard deviation'],
    [2 / 3, 'about two thirds of a standard deviation'],
    [5 / 6, 'about five sixths of a standard deviation'],
    [1, 'about one standard deviation'],
  ];
  if (x <= 1.08) {
    let best = named[0]!;
    for (const n of named) if (Math.abs(n[0] - x) < Math.abs(best[0] - x)) best = n;
    return best[1];
  }
  return `about ${x.toFixed(1)} standard deviations`;
}

/** The short noun form used in "about a third and a half". */
export function sdShort(d: number): string {
  const x = Math.abs(d);
  const named: [number, string][] = [
    [1 / 6, 'a sixth'],
    [1 / 3, 'a third'],
    [1 / 2, 'a half'],
    [2 / 3, 'two thirds'],
    [1, 'one'],
  ];
  if (x > 1.1) return x.toFixed(1);
  let best = named[0]!;
  for (const n of named) if (Math.abs(n[0] - x) < Math.abs(best[0] - x)) best = n;
  return best[1];
}

export function shiftReading(shift: number): string {
  if (shift === 0) return 'The average has not moved. Today looks like build time.';
  const pts = Math.abs(shift);
  const dir = shift < 0 ? 'lower' : 'higher';
  const size = sdPhrase(pts / BASE_SD);
  const who =
    shift < 0
      ? pts <= 20
        ? 'Applicants are a bit riskier on average.'
        : pts <= 40
          ? 'Applicants are clearly riskier on average.'
          : 'Applicants are much riskier on average.'
      : pts <= 20
        ? 'Applicants are a bit safer on average.'
        : pts <= 40
          ? 'Applicants are clearly safer on average.'
          : 'Applicants are much safer on average.';
  return `Average moved ${pts} points ${dir}: ${size}. ${who}`;
}

export function spreadReading(mult: number): string {
  if (Math.abs(mult - 1) < 0.025) return 'Same spread as build time.';
  return mult > 1
    ? `Scores are ${mult.toFixed(2).replace(/0$/, '')} times as spread out: more very safe and more very risky applicants.`
    : `Scores are only ${mult.toFixed(2).replace(/0$/, '')} times as spread out: applicants are bunched closer to the middle.`;
}

export function segmentReading(share: number): string {
  return share > 0
    ? `A new group of lower-scoring applicants makes up ${Math.round(share * 100)}% of today.`
    : '';
}

// ---------- "drift is not damage" ----------

/** Gini this far below build time counts as "falls" (about twice its sampling noise). */
export const GINI_FALL = 0.1;
