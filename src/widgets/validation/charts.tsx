/** SVG and text pieces shared by the widgets on the validation page. Colours come from CSS tokens. */
import type { ReactNode } from 'react';
import { LegendItem } from '../sampling/charts';

export { Reading } from '../sampling/charts';
export { Note, fmtErr } from '../biasvar/charts';

/** Rupees as whole numbers; 100000 or more reads "100000+". Never NaN. */
export const fmtRupee = (v: number): string =>
  !Number.isFinite(v) || v >= 100000 ? '₹100000+' : `₹${Math.round(v)}`;

export const pct0 = (p: number): string => `${Math.round(p * 100)}%`;
export const pct1 = (p: number): string => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;

const r1 = (v: number): number => Math.round(v * 10) / 10;

// ---------- the three roles ----------
// Training: filled dot. Validation: hollow circle. Test: dashed hollow square.

export type Role = 'train' | 'val' | 'test';

export const ROLE_PLAIN: Record<Role, { name: string; tech: string; job: string }> = {
  train: {
    name: 'Practice problems',
    tech: 'training',
    job: 'the model learns from these',
  },
  val: { name: 'Mock test', tech: 'validation', job: 'you compare models on these' },
  test: { name: 'Final exam', tech: 'test', job: 'you look once, at the end' },
};

export function RoleMark({
  role,
  x,
  y,
  r = 3.8,
}: {
  role: Role;
  x: number;
  y: number;
  r?: number;
}) {
  if (role === 'train')
    return (
      <circle
        cx={r1(x)}
        cy={r1(y)}
        r={r}
        fill="var(--color-ink)"
        fillOpacity="0.85"
        stroke="var(--color-surface)"
        strokeWidth="0.8"
      />
    );
  if (role === 'val')
    return (
      <circle
        cx={r1(x)}
        cy={r1(y)}
        r={r + 0.6}
        fill="var(--color-surface)"
        stroke="var(--color-ink)"
        strokeWidth="1.8"
      />
    );
  const s = r + 0.8;
  return (
    <rect
      x={r1(x - s)}
      y={r1(y - s)}
      width={r1(2 * s)}
      height={r1(2 * s)}
      fill="var(--color-surface)"
      stroke="var(--color-ink)"
      strokeWidth="1.8"
      strokeDasharray="3 2"
    />
  );
}

const SW: Record<Role, ReactNode> = {
  train: <RoleMark role="train" x={9} y={8} />,
  val: <RoleMark role="val" x={9} y={8} />,
  test: <RoleMark role="test" x={9} y={8} r={3.4} />,
};

export function RoleLegend({
  roles = ['train', 'val', 'test'],
  extra,
}: {
  roles?: Role[];
  extra?: [ReactNode, string][];
}) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {roles.map((r) => (
        <LegendItem key={r} shape={SW[r]}>
          <span>
            <strong className="font-semibold text-ink">{ROLE_PLAIN[r].name}</strong> (
            {ROLE_PLAIN[r].tech}): {ROLE_PLAIN[r].job}
          </span>
        </LegendItem>
      ))}
      {extra?.map(([shape, label]) => (
        <LegendItem key={label} shape={shape}>
          {label}
        </LegendItem>
      ))}
    </ul>
  );
}

export const FitSwatch = (
  <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-accent)" strokeWidth="3" />
);
export const TruthSwatch = (
  <line
    x1="1"
    x2="17"
    y1="8"
    y2="8"
    stroke="var(--color-muted)"
    strokeWidth="2.5"
    strokeDasharray="4 3"
  />
);

// ---------- marker shapes for dot histograms ----------

export type DotShape =
  'hollow-circle' | 'filled-square' | 'filled-circle' | 'triangle' | 'diamond';

export function Dot({
  shape,
  x,
  y,
  r,
}: {
  shape: DotShape;
  x: number;
  y: number;
  r: number;
}) {
  const ink = 'var(--color-ink)';
  const acc = 'var(--color-accent)';
  switch (shape) {
    case 'hollow-circle':
      return (
        <circle
          cx={r1(x)}
          cy={r1(y)}
          r={r}
          fill="var(--color-surface)"
          stroke={ink}
          strokeWidth="1.5"
        />
      );
    case 'filled-circle':
      return <circle cx={r1(x)} cy={r1(y)} r={r} fill={acc} />;
    case 'filled-square':
      return (
        <rect
          x={r1(x - r)}
          y={r1(y - r)}
          width={r1(2 * r)}
          height={r1(2 * r)}
          fill={acc}
        />
      );
    case 'triangle':
      return (
        <polygon
          points={`${r1(x)},${r1(y - r)} ${r1(x + r)},${r1(y + r)} ${r1(x - r)},${r1(y + r)}`}
          fill="var(--color-surface)"
          stroke={ink}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${r1(x)},${r1(y - r)} ${r1(x + r)},${r1(y)} ${r1(x)},${r1(y + r)} ${r1(x - r)},${r1(y)}`}
          fill={acc}
        />
      );
  }
}

/** Marker plus a few words, for legends and card labels. */
export function ShapeSwatch({ shape }: { shape: DotShape }) {
  return (
    <svg
      width="14"
      height="14"
      aria-hidden="true"
      className="inline-block shrink-0 align-middle"
    >
      <Dot shape={shape} x={7} y={7} r={4.5} />
    </svg>
  );
}

/**
 * A dot histogram. `counts[i]` stacks above x position `xs[i]`; one dot stands for `perDot`
 * items. Rows are capped at `maxRows` by raising `perDot`, so tall stacks stay readable.
 */
export function dotsPerStack(counts: number[], maxRows: number): number {
  const top = counts.reduce((a, b) => Math.max(a, b), 0);
  return Math.max(1, Math.ceil(top / maxRows));
}

export function DotStacks({
  counts,
  xs,
  base,
  r,
  perDot,
  shape,
}: {
  counts: number[];
  xs: number[];
  base: number;
  r: number;
  perDot: number;
  shape: DotShape;
}) {
  const out: ReactNode[] = [];
  for (let i = 0; i < counts.length; i++) {
    const n = Math.ceil((counts[i] ?? 0) / perDot);
    for (let j = 0; j < n; j++)
      out.push(
        <Dot
          key={`${i}-${j}`}
          shape={shape}
          x={xs[i]!}
          y={base - r - j * (2 * r + 1)}
          r={r}
        />,
      );
  }
  return <g>{out}</g>;
}

// ---------- cards, skeletons, buttons rows ----------

export function StatCard({
  label,
  value,
  plain,
  tone,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  plain?: ReactNode;
  tone?: 'plain' | 'hidden';
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={
          tone === 'hidden'
            ? 'py-0.5 text-base font-semibold text-muted'
            : 'font-mono text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </div>
      {children}
      {plain && <div className="text-xs leading-tight text-muted">{plain}</div>}
    </div>
  );
}

export function JobSkeleton({
  height,
  children,
}: {
  height: number;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-grid px-3 text-center text-sm text-muted"
      style={{ height }}
      aria-busy="true"
    >
      {children ?? 'Working it out…'}
    </div>
  );
}

/** Accessible, always-finite number for the live text. */
export const safe = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits) : '—';

/** Dot histogram of picked degrees 1..maxValue, one shape per dataset (or per `perDot` datasets). */
export function PickHist({
  picks,
  maxValue,
  label,
  shape,
  last,
  unit = 'degree picked',
}: {
  picks: number[];
  maxValue: number;
  label: string;
  shape: DotShape;
  last?: boolean;
  unit?: string;
}) {
  const W = 600;
  const L = 14;
  const R = 14;
  const slot = (W - L - R) / maxValue;
  const ROWS = 8;
  const r = Math.min(5.2, slot / 2 - 1);
  const head = 22;
  const base = head + ROWS * (2 * r + 1) + 2;
  const H = base + (last ? 40 : 8);
  const counts = new Array<number>(maxValue).fill(0);
  for (const p of picks) if (p >= 1 && p <= maxValue) counts[p - 1]!++;
  const xs = counts.map((_, i) => L + (i + 0.5) * slot);
  const perDot = dotsPerStack(counts, ROWS);
  const lo = picks.length ? Math.min(...picks) : 0;
  const hi = picks.length ? Math.max(...picks) : 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`${label}: picked degrees ${lo} to ${hi}`}
    >
      <text x={L} y="14" fontSize="14" fontWeight="600" fill="var(--color-ink)">
        {label}
      </text>
      <text x={W - R} y="14" fontSize="12" textAnchor="end" fill="var(--color-muted)">
        {perDot > 1 ? `1 shape = ${perDot} datasets` : '1 shape = 1 dataset'}
      </text>
      {xs.map((x, i) => (
        <line key={i} x1={x} x2={x} y1={head} y2={base} stroke="var(--color-grid)" />
      ))}
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--color-grid)" />
      <DotStacks
        counts={counts}
        xs={xs}
        base={base}
        r={r}
        perDot={perDot}
        shape={shape}
      />
      {last &&
        xs.map((x, i) => (
          <text
            key={i}
            x={x}
            y={base + 18}
            fontSize="14"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {i + 1}
          </text>
        ))}
      {last && (
        <text
          x={W - R}
          y={base + 35}
          fontSize="13"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {unit}
        </text>
      )}
    </svg>
  );
}
