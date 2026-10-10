import type { FeatureKey } from '../../lib/loanData';

/**
 * Hand-picked bins for the four scorecard features, chosen on the seed-42 loan book.
 * Auto-binning is intentionally not built: the WoE page covers choosing bins by hand,
 * and this page is about what happens after the bins are fixed.
 *
 * Rules the picks satisfy (asserted in scorecard.test.ts): WoE moves one way across the
 * numeric bins, every numeric bin holds at least 5% of people and at least 30 defaulters.
 * The Missing bins are exempt: they are small by nature.
 */
export const SCORECARD_KEYS = [
  'bureau_score',
  'max_dpd_6m',
  'years_in_business',
  'monthly_turnover_lakh',
] as const satisfies readonly FeatureKey[];
export type ScorecardKey = (typeof SCORECARD_KEYS)[number];

export interface BinSpec {
  key: ScorecardKey;
  label: string;
  /** Numeric bin edges, outer edges included (values outside fall in the end bins). */
  edges: number[];
  /** One label per numeric bin, low to high. */
  labels: string[];
  /** Label of the Missing bin, or null when the feature is never missing. */
  missingLabel: string | null;
  /** Which way a higher value points: more bureau score is safer, more days late is riskier. */
  direction: 'higher-safer' | 'higher-riskier';
}

export const BIN_SPECS: readonly BinSpec[] = [
  {
    key: 'bureau_score',
    label: 'Bureau score',
    edges: [300, 540, 620, 680, 901],
    labels: ['Below 540', '540–619', '620–679', '680 or more'],
    missingLabel: 'No bureau file',
    direction: 'higher-safer',
  },
  {
    key: 'max_dpd_6m',
    label: 'Days past due',
    edges: [0, 2, 5, 10, 121],
    labels: ['0–1 days', '2–4 days', '5–9 days', '10+ days'],
    missingLabel: null,
    direction: 'higher-riskier',
  },
  {
    key: 'years_in_business',
    label: 'Years in business',
    edges: [0, 5, 7, 10, 31],
    labels: ['Under 5 years', '5–6 years', '7–9 years', '10+ years'],
    missingLabel: null,
    direction: 'higher-safer',
  },
  {
    key: 'monthly_turnover_lakh',
    label: 'Monthly turnover',
    edges: [0, 6, 9, 15, 1000],
    labels: ['Under ₹6 lakh', '₹6–9 lakh', '₹9–15 lakh', '₹15+ lakh'],
    missingLabel: 'Not reported',
    direction: 'higher-safer',
  },
];
