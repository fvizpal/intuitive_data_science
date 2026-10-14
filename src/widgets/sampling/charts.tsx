/** SVG and text pieces shared by the widgets on the sampling page. Colours come from CSS tokens. */
import type { ReactNode } from 'react';
import { normalPdf } from '../distributions/dist';

export { W, f0, f1, pct } from '../distributions/charts';

export const PAD_L = 14;
export const PAD_R = 14;
const WIDTH = 600;

export interface Scale {
  lo: number;
  hi: number;
  /** viewBox x of a value (clamped to the axis). */
  x: (v: number) => number;
}

export function makeScale(lo: number, hi: number): Scale {
  const span = hi > lo ? hi - lo : 1;
  return {
    lo,
    hi,
    x: (v) =>
      PAD_L + ((Math.min(hi, Math.max(lo, v)) - lo) / span) * (WIDTH - PAD_L - PAD_R),
  };
}

/** Grey outline: the population. Accent fill: sample averages. Never colour alone. */
export const POP_STROKE = 'var(--color-muted)';
export const POP_FILL = 'color-mix(in srgb, var(--color-muted) 14%, transparent)';
export const AVG_FILL = 'color-mix(in srgb, var(--color-accent) 70%, transparent)';
export const AVG_STROKE = 'var(--color-accent)';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** "Everyone": the population average, an outlined triangle. Tip at (x, y). */
export function EveryoneMark({ x, y }: { x: number; y: number }) {
  return (
    <polygon
      points={`${r2(x)},${r2(y)} ${r2(x + 8)},${r2(y + 14)} ${r2(x - 8)},${r2(y + 14)}`}
      fill="var(--color-bg)"
      stroke="var(--color-ink)"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}

/** "Your sample": a sample's average, a filled triangle. Tip at (x, y). */
export function SampleMark({ x, y }: { x: number; y: number }) {
  return (
    <polygon
      points={`${r2(x)},${r2(y)} ${r2(x + 8)},${r2(y + 14)} ${r2(x - 8)},${r2(y + 14)}`}
      fill={AVG_STROKE}
      stroke={AVG_STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}

export function XAxis({
  scale,
  y,
  ticks,
  label,
  fmt = String,
}: {
  scale: Scale;
  y: number;
  ticks: number[];
  label?: string;
  fmt?: (v: number) => string;
}) {
  return (
    <g>
      <line x1={PAD_L} x2={WIDTH - PAD_R} y1={y} y2={y} stroke="var(--color-grid)" />
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={scale.x(t)}
            x2={scale.x(t)}
            y1={y}
            y2={y + 4}
            stroke="var(--color-grid)"
          />
          <text
            x={scale.x(t)}
            y={y + 20}
            fontSize="16"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {fmt(t)}
          </text>
        </g>
      ))}
      {label && (
        <text
          x={WIDTH - PAD_R}
          y={y + 40}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** Dashed vertical line for the population average. */
export function EveryoneLine({
  x,
  top,
  bottom,
}: {
  x: number;
  top: number;
  bottom: number;
}) {
  return (
    <line
      x1={x}
      x2={x}
      y1={top}
      y2={bottom}
      stroke="var(--color-ink)"
      strokeWidth="1.5"
      strokeDasharray="5 4"
    />
  );
}

/** Dashed theory bell curve. `height(x)` gives its height in y units; label sits by the peak. */
export function TheoryCurve({
  scale,
  mu,
  sd,
  binWidth,
  base,
  plotH,
  yMax,
  label,
  labelSide = 'right',
  scaleBy = 1,
}: {
  scale: Scale;
  mu: number;
  sd: number;
  binWidth: number;
  base: number;
  plotH: number;
  /** Top of the y axis, in share per bin. */
  yMax: number;
  label: string;
  labelSide?: 'left' | 'right';
  /** Extra multiplier (for example 1 / n when bars sit at k / n). */
  scaleBy?: number;
}) {
  if (!(sd > 0) || !(yMax > 0)) return null;
  const pts: string[] = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const v = scale.lo + ((scale.hi - scale.lo) * i) / steps;
    const h = Math.min(1.2, (normalPdf(v, mu, sd) * binWidth * scaleBy) / yMax);
    pts.push(`${r2(scale.x(v))},${r2(base - h * plotH)}`);
  }
  const peakY =
    base - Math.min(1.2, (normalPdf(mu, mu, sd) * binWidth * scaleBy) / yMax) * plotH;
  const px = scale.x(mu);
  const side = labelSide === 'right' ? 1 : -1;
  return (
    <g>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <text
        x={px + side * 10}
        y={Math.max(14, peakY + 4)}
        fontSize="16"
        textAnchor={side === 1 ? 'start' : 'end'}
        fill="var(--color-ink)"
      >
        {label}
      </text>
    </g>
  );
}

/** A y-axis with two light gridlines labelled as percentages of samples. */
export function ShareGrid({
  base,
  plotH,
  yMax,
  fmt,
}: {
  base: number;
  plotH: number;
  yMax: number;
  fmt: (p: number) => string;
}) {
  const marks = [0.5, 1].map((f) => ({ f, v: yMax * f }));
  return (
    <g>
      {marks.map(({ f, v }) => (
        <g key={f}>
          <line
            x1={PAD_L}
            x2={WIDTH - PAD_R}
            y1={base - f * plotH}
            y2={base - f * plotH}
            stroke="var(--color-grid)"
            strokeDasharray="2 4"
          />
          <text
            x={PAD_L + 2}
            y={base - f * plotH - 4}
            fontSize="14"
            fill="var(--color-muted)"
          >
            {fmt(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Rounds a share up to a tidy axis top (1, 2, 2.5, 5 times a power of ten). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 0.01;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * e;
}

export function Reading({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-3 rounded-md border-l-4 border-accent bg-bg px-3 py-2 text-sm"
      role="status"
    >
      <span className="font-semibold">What you&rsquo;re seeing. </span>
      {children}
    </div>
  );
}

/** Light placeholder while the sample matrix is built in slices. */
export function Skeleton({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-grid text-sm text-muted"
      style={{ height }}
      aria-busy="true"
    >
      Preparing the samples…
    </div>
  );
}

export function LegendItem({
  shape,
  children,
}: {
  shape: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <svg width="18" height="16" aria-hidden="true" className="shrink-0">
        {shape}
      </svg>
      {children}
    </li>
  );
}

export const TriangleOutline = (
  <polygon
    points="9,2 16,14 2,14"
    fill="var(--color-bg)"
    stroke="var(--color-ink)"
    strokeWidth="2"
    strokeLinejoin="round"
  />
);
export const TriangleFilled = (
  <polygon
    points="9,2 16,14 2,14"
    fill={AVG_STROKE}
    stroke={AVG_STROKE}
    strokeWidth="2"
    strokeLinejoin="round"
  />
);
export const DashSwatch = (
  <line
    x1="1"
    x2="17"
    y1="8"
    y2="8"
    stroke="var(--color-ink)"
    strokeWidth="2"
    strokeDasharray="4 3"
  />
);
export const GreyBox = (
  <rect
    x="2"
    y="3"
    width="14"
    height="10"
    fill={POP_FILL}
    stroke={POP_STROKE}
    strokeWidth="1.5"
  />
);
export const AccentBox = (
  <rect
    x="2"
    y="3"
    width="14"
    height="10"
    fill={AVG_FILL}
    stroke={AVG_STROKE}
    strokeWidth="1.5"
  />
);

/** About `count` round-numbered ticks inside [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / e;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step)
    out.push(Math.round(t / step) * step);
  return out;
}

/** Tick label without floating-point dust (0.30000000000000004 -> 0.3). */
export const tickLabel = (v: number): string => String(Number(v.toFixed(3)));

/** Plain-words key to the axes, so nobody has to guess what across and up mean. */
export function ChartKey({ across, up }: { across: string; up: string }) {
  return (
    <p className="m-0 mt-2 text-xs text-muted">
      <span className="font-semibold text-ink">Across:</span> {across}.{' '}
      <span className="font-semibold text-ink">Up:</span> {up}.
    </p>
  );
}
