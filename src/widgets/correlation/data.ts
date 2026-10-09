import { mulberry32, normal } from '../../lib/random';
import { genCorrelated, spearman } from './corr';
import type { Pair } from './corr';

export interface Preset {
  id: string;
  label: string;
  rho: number;
  xLabel: string;
  yLabel: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'drinks',
    label: 'Temperature vs cold-drink sales',
    rho: 0.8,
    xLabel: 'Temperature',
    yLabel: 'Cold-drink sales',
  },
  {
    id: 'sweaters',
    label: 'Temperature vs sweater sales',
    rho: -0.7,
    xLabel: 'Temperature',
    yLabel: 'Sweater sales',
  },
  {
    id: 'shoes',
    label: 'Shoe size vs exam marks',
    rho: 0,
    xLabel: 'Shoe size',
    yLabel: 'Exam marks',
  },
];

export type DatasetId = 'linear' | 'curved' | 'ushape' | 'outlier';

export const DATASETS: { id: DatasetId; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'curved', label: 'Curved but always rising' },
  { id: 'ushape', label: 'U-shape' },
  { id: 'outlier', label: 'No pattern + one outlier' },
];

export const PVS_N = 30;

/** The four Pearson-vs-Spearman datasets, in value coordinates. */
export function pvsDataset(id: DatasetId, seed: number): Pair[] {
  const rng = mulberry32(seed);
  switch (id) {
    case 'linear':
      return genCorrelated(seed, PVS_N, 0.85);
    case 'curved':
      return Array.from({ length: PVS_N }, () => {
        const x = rng();
        return { x, y: Math.exp(6 * x) };
      });
    case 'ushape':
      // Symmetric x grid, so the linear part cancels and Pearson ≈ 0.
      return Array.from({ length: PVS_N }, (_, i) => {
        const x = -1 + (2 * i) / (PVS_N - 1);
        return { x, y: x * x + normal(rng, 0, 0.06) };
      });
    case 'outlier':
      return outlierDataset(seed);
  }
}

/**
 * 29 noise points plus one extreme point. The outlier alone adds about +0.1 of rank
 * correlation, so we take the first seeded noise sample whose total Spearman is near 0.
 */
function outlierDataset(seed: number): Pair[] {
  let best: Pair[] = [];
  let bestAbs = Infinity;
  for (let k = 0; k < 40; k++) {
    const pts = [
      ...genCorrelated(seed + k * 7919, PVS_N - 1, 0, { exact: true }),
      OUTLIER,
    ];
    const s = Math.abs(
      spearman(
        pts.map((p) => p.x),
        pts.map((p) => p.y),
      ),
    );
    if (s < bestAbs) [best, bestAbs] = [pts, s];
    if (s < 0.08) break;
  }
  return best;
}

const OUTLIER: Pair = { x: 9, y: 9 };

export const TWIN_N = 120;

/** x1 ~ N(0,1); x2 has correlation `similarity` with x1; y = x1 + noise. */
export function twinData(seed: number, similarity: number) {
  const pairs = genCorrelated(seed, TWIN_N, similarity, { exact: true });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const x1 = pairs.map((p) => p.x);
  const x2 = pairs.map((p) => p.y);
  const y = x1.map((v) => v + normal(rng, 0, 1));
  return { x1, x2, y };
}

export const INCOME_N = 300;
/** Policy maximum ticket size (₹15 lakh); the richest few hit it. */
export const LOAN_CAP = 1_500_000;

/**
 * Lognormal monthly income (₹, long right tail) and a loan of about 6× income,
 * capped at the policy maximum, with multiplicative noise.
 */
export function incomeLoan(seed: number): { income: number[]; loan: number[] } {
  const rng = mulberry32(seed);
  const income: number[] = [];
  const loan: number[] = [];
  for (let i = 0; i < INCOME_N; i++) {
    const inc = Math.exp(normal(rng, Math.log(50_000), 1));
    income.push(inc);
    loan.push(Math.min(LOAN_CAP, 6 * inc) * Math.exp(normal(rng, 0, 0.4)));
  }
  return { income, loan };
}

/** Indian-style rupee shorthand: k, L (lakh), Cr (crore). */
export function rupees(v: number): string {
  if (v >= 1e7) return `₹${+(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${Math.round(v)}`;
}
