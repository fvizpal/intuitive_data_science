/** Pure glue: loan book -> fixed bins -> WoE-encoded matrix -> fitted logistic model. */
import { generateLoans } from '../../lib/loanData';
import type { Loans } from '../../lib/loanData';
import { binFeature, computeBins } from '../woe-iv/woe';
import { BIN_SPECS } from './bins';
import { fitLogistic, woeEncode } from './scorecard';
import type { FeatureBins, LogisticModel } from './scorecard';

/** The seed the fixed bins were picked on, and the page's default. */
export const SCORECARD_SEED = 42;

export function buildFeatureBins(loans: Loans): FeatureBins[] {
  return BIN_SPECS.map((spec) => {
    const idx = binFeature(loans.columns[spec.key], spec.edges);
    const stats = computeBins(idx, loans.defaulted, {
      nBins: spec.edges.length,
      missingIndex: spec.edges.length - 1,
    });
    return {
      key: spec.key,
      label: spec.label,
      edges: spec.edges,
      labels: [...spec.labels, spec.missingLabel ?? 'Missing'],
      stats,
    };
  });
}

export interface Fitted {
  loans: Loans;
  bins: FeatureBins[];
  /** WoE-encoded features, rows × 4. */
  X: number[][];
  /** 1 = good (repaid), 0 = bad. */
  y: number[];
  model: LogisticModel;
  /** Overall good : bad odds of the book (24 : 1 at a 4% default rate). */
  portfolioOdds: number;
}

export function fitScorecard(loans: Loans): Fitted {
  const bins = buildFeatureBins(loans);
  const X = woeEncode(loans.columns, bins);
  const y = loans.defaulted.map((d) => 1 - d);
  const bads = loans.defaulted.reduce((s, d) => s + d, 0);
  return {
    loans,
    bins,
    X,
    y,
    model: fitLogistic(X, y),
    portfolioOdds: (loans.n - bads) / Math.max(1, bads),
  };
}

/** Fits are pure functions of the seed; keep the last few. */
const cache = new Map<number, Fitted>();
export function getFitted(seed: number): Fitted {
  let f = cache.get(seed);
  if (!f) {
    if (cache.size >= 4) cache.clear();
    f = fitScorecard(generateLoans(seed));
    cache.set(seed, f);
  }
  return f;
}
