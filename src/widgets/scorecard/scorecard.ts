/**
 * Pure scorecard math. No React. Conventions: good = repaid (y = 1), bad = defaulted,
 * WoE = ln(%good / %bad) so positive = safer, a higher score = safer, approve when
 * score >= cutoff.
 */
import { binFeature } from '../woe-iv/woe';
import type { BinStat } from '../woe-iv/woe';

/** One feature with its fixed bins and their statistics (Missing bin, if any, is last). */
export interface FeatureBins {
  key: string;
  label: string;
  edges: number[];
  /** One label per bin in `stats`, Missing last. */
  labels: string[];
  stats: BinStat[];
}

export type Columns = Readonly<Record<string, readonly number[]>>;

/** Bin index of every row for one feature (NaN goes to the Missing bin, the last one). */
export const binIndexes = (column: readonly number[], fb: FeatureBins): number[] =>
  binFeature(column, fb.edges);

/** Replace each feature value with the WoE of its bin. Returns rows × features. */
export function woeEncode(columns: Columns, bins: readonly FeatureBins[]): number[][] {
  const n = columns[bins[0]?.key ?? '']?.length ?? 0;
  const X: number[][] = Array.from({ length: n }, () => []);
  for (const fb of bins) {
    const idx = binIndexes(columns[fb.key] ?? [], fb);
    for (let i = 0; i < n; i++) X[i]!.push(fb.stats[idx[i]!]?.woe ?? 0);
  }
  return X;
}

// ---------- logistic regression ----------

export interface LogisticModel {
  intercept: number;
  coefs: number[];
  converged: boolean;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Solve A x = b by Gaussian elimination with partial pivoting; null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const d = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < d; c++) {
    let piv = c;
    for (let r = c + 1; r < d; r++) {
      if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    }
    if (Math.abs(M[piv]![c]!) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = c + 1; r < d; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= d; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(d).fill(0);
  for (let r = d - 1; r >= 0; r--) {
    let s = M[r]![d]!;
    for (let k = r + 1; k < d; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

/**
 * Logistic regression by Newton / IRLS with an intercept. y = 1 means GOOD, so
 * coefficients on WoE come out positive. A tiny ridge on the coefficients (not the
 * intercept) keeps near-duplicate features and perfect separation finite, and the
 * iteration count is capped.
 */
export function fitLogistic(
  X: readonly (readonly number[])[],
  y: readonly number[],
  { ridge = 1e-6, maxIter = 50 }: { ridge?: number; maxIter?: number } = {},
): LogisticModel {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const d = p + 1;
  const beta = new Array<number>(d).fill(0);
  if (n === 0)
    return { intercept: 0, coefs: new Array<number>(p).fill(0), converged: true };
  const ybar = Math.min(0.999, Math.max(0.001, y.reduce((s, v) => s + v, 0) / n));
  beta[0] = Math.log(ybar / (1 - ybar));

  let converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array<number>(d).fill(0);
    const H = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < n; i++) {
      const xi = X[i]!;
      let z = beta[0]!;
      for (let j = 0; j < p; j++) z += beta[j + 1]! * xi[j]!;
      const mu = sigmoid(z);
      const w = Math.max(mu * (1 - mu), 1e-9);
      const r = y[i]! - mu;
      grad[0]! += r;
      H[0]![0]! += w;
      for (let a = 0; a < p; a++) {
        const xa = xi[a]!;
        grad[a + 1]! += r * xa;
        H[0]![a + 1]! += w * xa;
        for (let b = 0; b <= a; b++) H[b + 1]![a + 1]! += w * xa * xi[b]!;
      }
    }
    for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) H[a]![b] = H[b]![a]!;
    for (let j = 1; j < d; j++) {
      grad[j]! -= ridge * beta[j]!;
      H[j]![j]! += ridge;
    }
    const step = solve(H, grad);
    if (!step || step.some((s) => !Number.isFinite(s))) break;
    // Damp huge steps (near-separation) so a single update cannot overflow.
    const big = Math.max(...step.map(Math.abs));
    const scale = big > 5 ? 5 / big : 1;
    for (let j = 0; j < d; j++) beta[j]! += scale * step[j]!;
    if (big * scale < 1e-9) {
      converged = true;
      break;
    }
  }
  const finite = beta.every(Number.isFinite);
  return {
    intercept: finite ? beta[0]! : 0,
    coefs: beta.slice(1).map((b) => (Number.isFinite(b) ? b : 0)),
    converged: converged && finite,
  };
}

// ---------- score scale ----------

export interface ScaleInput {
  baseScore: number;
  /** Good : bad odds at the base score, e.g. 50 for 50:1. */
  baseOdds: number;
  /** Points to double the odds. */
  pdo: number;
}
export interface Scaling extends ScaleInput {
  factor: number;
  offset: number;
}

export const DEFAULT_SCALE: ScaleInput = { baseScore: 600, baseOdds: 50, pdo: 20 };

export function scaling({ baseScore, baseOdds, pdo }: ScaleInput): Scaling {
  const factor = pdo / Math.LN2;
  return {
    baseScore,
    baseOdds,
    pdo,
    factor,
    offset: baseScore - factor * Math.log(baseOdds),
  };
}

export const scoreFromLogOdds = (logOdds: number, s: Scaling): number =>
  s.offset + s.factor * logOdds;

export const logOddsFromScore = (score: number, s: Scaling): number =>
  (score - s.offset) / s.factor;

/** Probability of default (bad) = 1 / (1 + good odds). */
export const pdFromScore = (score: number, s: Scaling): number =>
  1 / (1 + Math.exp(logOddsFromScore(score, s)));

export const pdFromOdds = (goodOdds: number): number => 1 / (1 + goodOdds);

// ---------- points per bin ----------

export interface FeaturePoints {
  key: string;
  label: string;
  binLabels: string[];
  /** False for empty bins (e.g. the Missing bin of a feature that is never missing). */
  available: boolean[];
  /** Unrounded points per bin. */
  exact: number[];
  /** Integer points per bin, as printed on a scorecard. */
  points: number[];
}
export interface PointsTable {
  features: FeaturePoints[];
  scaling: Scaling;
}

/** Points per bin = (beta_j * WoE + intercept / n) * factor + offset / n. */
export function binPoints(
  model: LogisticModel,
  bins: readonly FeatureBins[],
  s: Scaling,
): PointsTable {
  const n = bins.length;
  const features = bins.map((fb, j) => {
    const exact = fb.stats.map(
      (st) =>
        ((model.coefs[j] ?? 0) * st.woe + model.intercept / n) * s.factor + s.offset / n,
    );
    return {
      key: fb.key,
      label: fb.label,
      binLabels: fb.labels,
      available: fb.stats.map((st) => st.count > 0),
      exact,
      points: exact.map((e) => Math.round(e)),
    };
  });
  return { features, scaling: s };
}

export interface ApplicantScore {
  total: number;
  perFeature: number[];
}

/** Sum of the ROUNDED integer points, which is what a printed scorecard does. */
export function applicantScore(
  table: PointsTable,
  picks: readonly number[],
): ApplicantScore {
  const perFeature = table.features.map((f, j) => f.points[picks[j] ?? 0] ?? 0);
  return { total: perFeature.reduce((s, v) => s + v, 0), perFeature };
}

/** Exact (unrounded) score of an applicant. */
export const applicantScoreExact = (
  table: PointsTable,
  picks: readonly number[],
): number => table.features.reduce((s, f, j) => s + (f.exact[picks[j] ?? 0] ?? 0), 0);

export interface ReasonCode {
  key: string;
  feature: string;
  bin: string;
  /** Points lost versus the best bin of this feature (always > 0). */
  gap: number;
  text: string;
}

/** The k features where the applicant is furthest below the best bin of that feature. */
export function reasonCodes(
  table: PointsTable,
  picks: readonly number[],
  k = 3,
): ReasonCode[] {
  const out: ReasonCode[] = [];
  table.features.forEach((f, j) => {
    const mine = f.points[picks[j] ?? 0] ?? 0;
    let best = -Infinity;
    f.points.forEach((p, i) => {
      if (f.available[i] && p > best) best = p;
    });
    const gap = best - mine;
    if (gap > 0) {
      const bin = f.binLabels[picks[j] ?? 0] ?? '';
      out.push({
        key: f.key,
        feature: f.label,
        bin,
        gap,
        text: `${f.label}: ${bin} costs ${gap} ${gap === 1 ? 'point' : 'points'} versus the best bin.`,
      });
    }
  });
  return out.sort((a, b) => b.gap - a.gap).slice(0, k);
}

// ---------- evidence stack (widget 1) ----------

export interface EvidenceStep {
  woe: number;
  /** exp(woe): by how much this bin multiplies the good:bad odds. */
  oddsFactor: number;
  logOdds: number;
  odds: number;
}
export interface EvidenceResult {
  startLogOdds: number;
  startOdds: number;
  steps: EvidenceStep[];
  finalLogOdds: number;
  finalOdds: number;
  finalPd: number;
}

/** The naive "just add the evidence" version: every weight is 1. */
export function evidenceStack(baseOdds: number, woes: readonly number[]): EvidenceResult {
  const startLogOdds = Math.log(baseOdds);
  let run = startLogOdds;
  const steps = woes.map((woe) => {
    run += woe;
    return { woe, oddsFactor: Math.exp(woe), logOdds: run, odds: Math.exp(run) };
  });
  const finalOdds = Math.exp(run);
  return {
    startLogOdds,
    startOdds: baseOdds,
    steps,
    finalLogOdds: run,
    finalOdds,
    finalPd: pdFromOdds(finalOdds),
  };
}

// ---------- scoring a whole book ----------

/** Integer score for every row (sum of rounded points). */
export function scoreAll(
  columns: Columns,
  table: PointsTable,
  bins: readonly FeatureBins[],
): number[] {
  const n = columns[bins[0]?.key ?? '']?.length ?? 0;
  const scores = new Array<number>(n).fill(0);
  bins.forEach((fb, j) => {
    const idx = binIndexes(columns[fb.key] ?? [], fb);
    const pts = table.features[j]!.points;
    for (let i = 0; i < n; i++) scores[i]! += pts[idx[i]!] ?? 0;
  });
  return scores;
}

export interface CutoffStats {
  /** Share of all applicants with score >= cutoff. */
  approvalRate: number;
  /** Share of approved applicants who default (0 when nobody is approved). */
  badRateApproved: number;
  /** Share of all defaulters who are turned away. */
  badsRejectedShare: number;
  /** Share of all repaying customers who are turned away. */
  goodsRejectedShare: number;
}

export function cutoffStats(
  scores: readonly number[],
  flags: readonly number[],
  cutoff: number,
): CutoffStats {
  let approved = 0;
  let approvedBad = 0;
  let bad = 0;
  let good = 0;
  let rejBad = 0;
  let rejGood = 0;
  for (let i = 0; i < scores.length; i++) {
    const isBad = flags[i] ? 1 : 0;
    if (isBad) bad++;
    else good++;
    if (scores[i]! >= cutoff) {
      approved++;
      approvedBad += isBad;
    } else if (isBad) rejBad++;
    else rejGood++;
  }
  return {
    approvalRate: scores.length ? approved / scores.length : 0,
    badRateApproved: approved ? approvedBad / approved : 0,
    badsRejectedShare: bad ? rejBad / bad : 0,
    goodsRejectedShare: good ? rejGood / good : 0,
  };
}

export interface ScoreHistogram {
  min: number;
  step: number;
  /** Share of all goods in each bin (sums to 1). */
  goods: number[];
  /** Share of all bads in each bin (sums to 1). */
  bads: number[];
}

/** Histogram of scores for goods and bads, each normalised to its own total. */
export function scoreHistogram(
  scores: readonly number[],
  flags: readonly number[],
  binCount: number,
): ScoreHistogram {
  const k = Math.max(1, Math.floor(binCount));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of scores) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  if (!Number.isFinite(lo))
    return { min: 0, step: 1, goods: new Array(k).fill(0), bads: new Array(k).fill(0) };
  const step = Math.max(1e-9, (hi - lo) / k) || 1;
  const goods = new Array<number>(k).fill(0);
  const bads = new Array<number>(k).fill(0);
  let g = 0;
  let b = 0;
  for (let i = 0; i < scores.length; i++) {
    const idx = Math.min(k - 1, Math.floor((scores[i]! - lo) / step));
    if (flags[i]) {
      bads[idx]!++;
      b++;
    } else {
      goods[idx]!++;
      g++;
    }
  }
  return {
    min: lo,
    step,
    goods: goods.map((v) => (g ? v / g : 0)),
    bads: bads.map((v) => (b ? v / b : 0)),
  };
}
