import type { FeatureKey, Loans } from '../../lib/loanData';
import { binFeature, computeBins, equalCountEdges, totalIV } from './woe';
import type { BinStat } from './woe';

export interface FeatureMeta {
  key: FeatureKey;
  /** Full name for buttons and headings. */
  label: string;
  /** Short name for chart axes. */
  short: string;
  /** Used in sentences: "people with <with> below 580". */
  with: string;
  /** Digits shown after the decimal point. */
  decimals: number;
  /** Smallest meaningful step when nudging a bin edge. */
  step: number;
}

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
  bureau_score: {
    key: 'bureau_score',
    label: 'Bureau score',
    short: 'Bureau score',
    with: 'a bureau score',
    decimals: 0,
    step: 5,
  },
  max_dpd_6m: {
    key: 'max_dpd_6m',
    label: 'Days past due',
    short: 'Days past due',
    with: 'a worst delay (days past due)',
    decimals: 0,
    step: 1,
  },
  years_in_business: {
    key: 'years_in_business',
    label: 'Years in business',
    short: 'Years in business',
    with: 'years in business',
    decimals: 0,
    step: 1,
  },
  monthly_turnover_lakh: {
    key: 'monthly_turnover_lakh',
    label: 'Monthly turnover',
    short: 'Monthly turnover',
    with: 'monthly turnover (₹ lakh)',
    decimals: 1,
    step: 0.5,
  },
  noise_feature: {
    key: 'noise_feature',
    label: 'A random number',
    short: 'Random number',
    with: 'a random number',
    decimals: 2,
    step: 0.01,
  },
  post_default_collection_calls: {
    key: 'post_default_collection_calls',
    label: 'Collection calls after default',
    short: 'Collection calls*',
    with: 'collection calls after default',
    decimals: 0,
    step: 1,
  },
};

/** The five honest features, in the order shown to the reader. */
export const RANKED_KEYS = [
  'bureau_score',
  'max_dpd_6m',
  'years_in_business',
  'monthly_turnover_lakh',
  'noise_feature',
] as const satisfies readonly FeatureKey[];
export type RankedKey = (typeof RANKED_KEYS)[number];

export interface Analysis {
  /** Numeric bin edges, outer edges included. */
  edges: number[];
  /** One entry per numeric bin, then the Missing bin last (it may be empty). */
  bins: BinStat[];
  iv: number;
}

export function analyze(
  loans: Loans,
  key: FeatureKey,
  edges: readonly number[],
): Analysis {
  const values = loans.columns[key];
  const idx = binFeature(values, edges);
  const bins = computeBins(idx, loans.defaulted, {
    nBins: edges.length,
    missingIndex: edges.length - 1,
  });
  return { edges: [...edges], bins, iv: totalIV(bins) };
}

/** The leakage column is almost all zeros, so it is split as "no calls" vs "any calls". */
export function defaultEdges(loans: Loans, key: FeatureKey, k = 5): number[] {
  if (key === 'post_default_collection_calls') return [0, 1, 1000];
  return equalCountEdges(loans.columns[key], k);
}

export function analyzeDefault(loans: Loans, key: FeatureKey, k = 5): Analysis {
  return analyze(loans, key, defaultEdges(loans, key, k));
}

/** Overall default rate of the dataset. */
export const portfolioRate = (loans: Loans): number =>
  loans.defaulted.reduce((s, d) => s + d, 0) / loans.n;

const nf = new Intl.NumberFormat('en-US');
export const fmtInt = (n: number): string => nf.format(Math.round(n));
export const pct = (v: number, digits = 1): string => `${(v * 100).toFixed(digits)}%`;

/** Signed number with a real minus sign: +0.85, −1.20, 0.00. Never NaN. */
export function signed(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return `${v > 0 ? '+' : '−'}${s}`;
}

export type Reading = 'safer' | 'riskier' | 'average';

/** Plain-language reading of a WoE value. */
export function woeReading(woe: number, tolerance = 0.05): Reading {
  if (woe > tolerance) return 'safer';
  if (woe < -tolerance) return 'riskier';
  return 'average';
}

export const READING_TEXT: Record<Reading, string> = {
  safer: 'Safer than average',
  riskier: 'Riskier than average',
  average: 'About average',
};

export const READING_GLYPH: Record<Reading, string> = {
  safer: '▲',
  riskier: '▼',
  average: '●',
};

export const READING_COLOR: Record<Reading, string> = {
  safer: 'var(--color-pos)',
  riskier: 'var(--color-neg)',
  average: 'var(--color-muted)',
};

/** Compares a default rate with the portfolio rate in words. */
export function rateReading(rate: number, portfolio: number): Reading {
  if (rate < portfolio * 0.85) return 'safer';
  if (rate > portfolio * 1.15) return 'riskier';
  return 'average';
}

const edgeText = (meta: FeatureMeta, v: number): string => {
  const s = v.toFixed(meta.decimals);
  return meta.decimals === 0 ? fmtInt(Number(s)) : s;
};

/** Short label for charts: "<580", "580–639", "700+", "Missing". */
export function binLabel(meta: FeatureMeta, edges: readonly number[], i: number): string {
  const nBins = edges.length - 1;
  if (i >= nBins) return 'Missing';
  const a = edges[i] as number;
  const b = edges[i + 1] as number;
  if (nBins === 1) return 'All';
  if (i === 0) return `<${edgeText(meta, b)}`;
  if (i === nBins - 1) return `${edgeText(meta, a)}+`;
  const upper = meta.decimals === 0 ? b - 1 : b;
  return `${edgeText(meta, a)}–${edgeText(meta, upper)}`;
}

/** Sentence fragment: "a bureau score below 580". */
export function binPhrase(
  meta: FeatureMeta,
  edges: readonly number[],
  i: number,
): string {
  const nBins = edges.length - 1;
  if (i >= nBins) return `no ${meta.with.replace(/^a /, '')} on file`;
  const a = edges[i] as number;
  const b = edges[i + 1] as number;
  if (nBins === 1) return meta.with;
  if (i === 0) return `${meta.with} below ${edgeText(meta, b)}`;
  if (i === nBins - 1) return `${meta.with} of ${edgeText(meta, a)} or more`;
  const upper = meta.decimals === 0 ? b - 1 : b;
  return `${meta.with} from ${edgeText(meta, a)} to ${edgeText(meta, upper)}`;
}
