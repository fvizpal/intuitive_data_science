import { mulberry32, normal } from './random';

/** Column names of the synthetic small-business-loan dataset. */
export const FEATURE_KEYS = [
  'bureau_score',
  'max_dpd_6m',
  'years_in_business',
  'monthly_turnover_lakh',
  'noise_feature',
  'post_default_collection_calls',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface Loans {
  n: number;
  seed: number;
  /** 1 = defaulted ("bad"), 0 = repaid ("good"). */
  defaulted: number[];
  /** Feature columns; missing values are NaN. */
  columns: Record<FeatureKey, number[]>;
}

export const TARGET_DEFAULT_RATE = 0.04;
/** The seed readers see first; chosen so the IV ordering on the page is clean. */
export const DEFAULT_SEED = 9;

/** Coefficients of the latent logistic model (the intercept is calibrated, not set). */
export const COEF = {
  bureau: -0.7,
  dpd: 0.45,
  years: -0.42,
  turnover: -0.2,
  thinFile: 0.9,
} as const;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Synthetic small-business-loan applicants. Deterministic for a seed.
 * The overall default rate is calibrated to 4% by bisecting the intercept on the
 * realized flags, so it never drifts with the seed.
 */
export function generateLoans(seed: number, n = 5000): Loans {
  const rng = mulberry32(seed);
  const bureau: number[] = [];
  const dpd: number[] = [];
  const years: number[] = [];
  const turnover: number[] = [];
  const noise: number[] = [];
  const score: number[] = [];
  const draws: number[] = [];

  for (let i = 0; i < n; i++) {
    const zb = normal(rng);
    const thin = rng() < 0.06;
    bureau.push(thin ? NaN : Math.round(Math.min(900, Math.max(300, 650 + 85 * zb))));

    const d =
      rng() < 0.55 ? 0 : Math.min(120, Math.round(Math.exp(normal(rng, 1.6, 1.0))));
    dpd.push(d);

    const y = Math.min(30, Math.round(Math.exp(normal(rng, 1.7, 0.75))));
    years.push(y);

    const zt = normal(rng);
    const t = Math.exp(2.2 + 0.9 * zt);
    turnover.push(rng() < 0.03 ? NaN : Math.round(t * 100) / 100);

    noise.push(Math.round(rng() * 10_000) / 10_000);

    score.push(
      (thin ? COEF.thinFile : COEF.bureau * zb) +
        COEF.dpd * (Math.log1p(d) - 1.6) +
        COEF.years * ((Math.log1p(y) - 1.9) / 0.75) +
        COEF.turnover * zt,
    );
    draws.push(rng());
  }

  // Calibrate the intercept so the realized default count hits the target.
  const target = Math.round(TARGET_DEFAULT_RATE * n);
  const countAt = (b0: number) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (draws[i]! < sigmoid(b0 + score[i]!)) c++;
    return c;
  };
  let lo = -12;
  let hi = 4;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (countAt(mid) < target) lo = mid;
    else hi = mid;
  }
  const b0 = hi;

  const defaulted: number[] = [];
  const calls: number[] = [];
  for (let i = 0; i < n; i++) {
    const bad = draws[i]! < sigmoid(b0 + score[i]!) ? 1 : 0;
    defaulted.push(bad);
    // Leakage: collection calls only start after a default.
    calls.push(
      bad
        ? rng() < 0.9
          ? 1 + Math.floor(-Math.log(1 - rng()) * 2)
          : 0
        : rng() < 0.01
          ? 1
          : 0,
    );
  }

  return {
    n,
    seed,
    defaulted,
    columns: {
      bureau_score: bureau,
      max_dpd_6m: dpd,
      years_in_business: years,
      monthly_turnover_lakh: turnover,
      noise_feature: noise,
      post_default_collection_calls: calls,
    },
  };
}
