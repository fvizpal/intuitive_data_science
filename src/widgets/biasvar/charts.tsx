/** SVG and text pieces shared by the widgets on the bias-variance page. Colours come from CSS tokens. */
import { useId, type ReactNode } from 'react';
import { LegendItem } from '../sampling/charts';
import { defaultGrid } from './fit';

export { Reading, Skeleton } from '../sampling/charts';

/** An error in degrees C (or squared degrees) with one decimal; 1000 or more reads "1000+". */
export const fmtErr = (v: number): string =>
  !Number.isFinite(v) || Math.abs(v) >= 1000 ? '1000+' : v.toFixed(1);

export const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- hour chart (temperature through the day) ----------

export const CH = {
  W: 600,
  H: 312,
  L: 46,
  R: 12,
  T: 24,
  B: 38,
  YLO: 10,
  YHI: 40,
} as const;
const PW = CH.W - CH.L - CH.R;
const PH = CH.H - CH.T - CH.B;
export const px = (h: number): number => CH.L + (h / 24) * PW;
export const py = (v: number): number => CH.T + ((CH.YHI - v) / (CH.YHI - CH.YLO)) * PH;
const r1 = (v: number): number => Math.round(v * 10) / 10;

const HOUR_TICKS = [0, 6, 12, 18, 24];
const TEMP_TICKS = [10, 20, 30, 40];

export function HourChart({
  label,
  children,
  overlay,
}: {
  label: string;
  /** Drawn inside the plot area and clipped to it. */
  children: ReactNode;
  /** Drawn on top, not clipped (arrows, labels). */
  overlay?: ReactNode;
}) {
  const clip = `hc${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox={`0 0 ${CH.W} ${CH.H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${CH.W} / ${CH.H}` }}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={CH.L} y={CH.T} width={PW} height={PH} />
        </clipPath>
      </defs>
      {TEMP_TICKS.map((t) => (
        <g key={t}>
          <line
            x1={CH.L}
            x2={CH.W - CH.R}
            y1={py(t)}
            y2={py(t)}
            stroke="var(--color-grid)"
          />
          <text
            x={CH.L - 6}
            y={py(t) + 5}
            fontSize="15"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text
        x={CH.L - 6}
        y={CH.T - 9}
        fontSize="14"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        °C
      </text>
      {HOUR_TICKS.map((h) => (
        <g key={h}>
          <line
            x1={px(h)}
            x2={px(h)}
            y1={CH.T + PH}
            y2={CH.T + PH + 4}
            stroke="var(--color-grid)"
          />
          <text
            x={px(h)}
            y={CH.T + PH + 20}
            fontSize="15"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {h}
          </text>
        </g>
      ))}
      <text
        x={CH.W - CH.R}
        y={CH.H - 3}
        fontSize="14"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        hour of day
      </text>
      <g clipPath={`url(#${clip})`}>{children}</g>
      {overlay}
    </svg>
  );
}

/** Polyline through a grid of predictions. Out-of-range heights are kept finite and clipped by the chart. */
export function curvePath(values: ArrayLike<number>, step = 2): string {
  const { g } = defaultGrid();
  let d = '';
  for (let i = 0; i < g.length; i += step) {
    const y = Math.max(-300, Math.min(CH.H + 300, py(values[i]!)));
    d += `${i === 0 ? 'M' : 'L'}${r1(px(g[i]!))} ${r1(y)}`;
  }
  return d;
}

export function Curve({
  values,
  stroke = 'var(--color-accent)',
  width = 3,
  dash,
  opacity = 1,
}: {
  values: ArrayLike<number>;
  stroke?: string;
  width?: number;
  dash?: string;
  opacity?: number;
}) {
  return (
    <path
      d={curvePath(values)}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={dash}
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

/** The truth: a dashed grey line. */
export function TruthLine({ label = true }: { label?: boolean }) {
  const { f } = defaultGrid();
  return (
    <g>
      <path
        d={curvePath(f)}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth="2.5"
        strokeDasharray="7 5"
      />
      {label && (
        <text
          x={px(0.6)}
          y={py(14.2)}
          fontSize="14"
          fill="var(--color-muted)"
          stroke="var(--color-surface)"
          strokeWidth="4"
          paintOrder="stroke"
        >
          Truth: what the world really does
        </text>
      )}
    </g>
  );
}

export interface Exit {
  h: number;
  side: 'top' | 'bottom';
}

/** Where a curve leaves the chart (one entry per exit), at most `max`. */
export function exitsOf(values: ArrayLike<number>, max = 4): Exit[] {
  const { g } = defaultGrid();
  const out: Exit[] = [];
  let outside = false;
  for (let i = 0; i < g.length && out.length < max; i += 2) {
    const v = values[i]!;
    const off = v > CH.YHI || v < CH.YLO;
    if (off && !outside) out.push({ h: g[i]!, side: v > CH.YHI ? 'top' : 'bottom' });
    outside = off;
  }
  return out;
}

/** Small arrows at the chart edge where a curve leaves, with one "off the chart" label per edge. */
export function OffChart({ exits }: { exits: Exit[] }) {
  const labelled = new Set<string>();
  return (
    <g>
      {exits.map((e, i) => {
        const x = Math.max(CH.L + 8, Math.min(CH.W - CH.R - 8, px(e.h)));
        const top = e.side === 'top';
        const y = top ? CH.T + 1 : CH.T + PH - 1;
        const tri = top
          ? `${x},${y} ${x + 6},${y + 11} ${x - 6},${y + 11}`
          : `${x},${y} ${x + 6},${y - 11} ${x - 6},${y - 11}`;
        const showLabel = !labelled.has(e.side);
        labelled.add(e.side);
        const left = x > CH.L + PW * 0.6;
        return (
          <g key={i}>
            <polygon
              points={tri}
              fill="var(--color-neg)"
              stroke="var(--color-bg)"
              strokeWidth="1"
            />
            {showLabel && (
              <text
                x={left ? x - 10 : x + 10}
                y={top ? y + 12 : y - 3}
                fontSize="14"
                textAnchor={left ? 'end' : 'start'}
                fill="var(--color-neg)"
                stroke="var(--color-surface)"
                strokeWidth="4"
                paintOrder="stroke"
              >
                off the chart
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Filled dots (training points) or hollow circles (new points). */
export function Dots({
  xs,
  ys,
  hollow = false,
  r = 3.6,
}: {
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  hollow?: boolean;
  r?: number;
}) {
  const out: ReactNode[] = [];
  for (let i = 0; i < xs.length; i++)
    out.push(
      <circle
        key={i}
        cx={r1(px(xs[i]!))}
        cy={r1(py(ys[i]!))}
        r={hollow ? r + 0.4 : r}
        fill={hollow ? 'var(--color-surface)' : 'var(--color-ink)'}
        fillOpacity={hollow ? 0.0 : 0.85}
        stroke={hollow ? 'var(--color-ink)' : 'var(--color-surface)'}
        strokeWidth={hollow ? 1.6 : 0.8}
      />,
    );
  return <g>{out}</g>;
}

// ---------- legend ----------

const SW = {
  truth: (
    <line
      x1="1"
      x2="17"
      y1="8"
      y2="8"
      stroke="var(--color-muted)"
      strokeWidth="2.5"
      strokeDasharray="4 3"
    />
  ),
  fit: <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-accent)" strokeWidth="3" />,
  train: <circle cx="9" cy="8" r="4" fill="var(--color-ink)" fillOpacity="0.85" />,
  fresh: (
    <circle cx="9" cy="8" r="4" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" />
  ),
  faint: (
    <line
      x1="1"
      x2="17"
      y1="8"
      y2="8"
      stroke="var(--color-accent)"
      strokeWidth="1.2"
      opacity="0.4"
    />
  ),
  avg: <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-accent)" strokeWidth="5" />,
  byTrain: (
    <line
      x1="1"
      x2="17"
      y1="8"
      y2="8"
      stroke="var(--color-neg)"
      strokeWidth="3"
      strokeDasharray="1 3.5"
      strokeLinecap="round"
    />
  ),
  byValid: (
    <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-accent)" strokeWidth="3" />
  ),
} as const;

export type SwatchKind = keyof typeof SW;

export function Legend({ items }: { items: [SwatchKind, string][] }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {items.map(([k, label]) => (
        <LegendItem key={k} shape={SW[k]}>
          {label}
        </LegendItem>
      ))}
    </ul>
  );
}

// ---------- cards and notes ----------

/** A boxed note with an icon and text; the coral border is never the only signal. */
export function Note({ icon = '⚠', children }: { icon?: string; children: ReactNode }) {
  return (
    <div
      role="status"
      className="mt-3 flex gap-2 rounded-md border-2 border-neg bg-bg px-3 py-2 text-sm"
    >
      <span aria-hidden="true" className="text-neg">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

const GAUGE_MAX = 10;

/** One error number with a small bar and a dashed noise-floor tick. */
export function ErrorCard({
  label,
  tech,
  value,
  noise,
  plain,
  filled = true,
}: {
  label: string;
  tech: string;
  value: number;
  noise: number;
  plain: string;
  filled?: boolean;
}) {
  const w = 200;
  const clipped = !(value <= GAUGE_MAX);
  const bar = Math.max(1, (Math.min(value, GAUGE_MAX) / GAUGE_MAX) * w);
  const nx = (noise / GAUGE_MAX) * w;
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">
        {label} <span className="opacity-80">({tech})</span>
      </div>
      <div className="font-mono text-xl font-semibold tabular-nums">
        {fmtErr(value)} °C
      </div>
      <svg
        viewBox={`0 0 ${w} 30`}
        className="mt-1 block h-auto w-full"
        aria-hidden="true"
      >
        <rect x="0" y="14" width={w} height="10" fill="var(--color-grid)" opacity="0.5" />
        <rect
          x="0"
          y="14"
          width={bar}
          height="10"
          fill={filled ? 'var(--color-accent)' : 'none'}
          stroke="var(--color-accent)"
          strokeWidth="2"
        />
        {clipped && (
          <polygon points={`${w},19 ${w - 8},14 ${w - 8},24`} fill="var(--color-neg)" />
        )}
        <line
          x1={nx}
          x2={nx}
          y1="10"
          y2="28"
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeDasharray="3 2"
        />
        <text x={nx + 3} y="9" fontSize="9" fill="var(--color-ink)">
          Noise floor {noise.toFixed(1)}
        </text>
      </svg>
      <div className="text-xs leading-tight text-muted">{plain}</div>
    </div>
  );
}

/** Hatch patterns that differ by shape, not colour (bias: diagonal, variance: dots, noise: grid). */
export function Patterns({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern
        id={`${prefix}-bias`}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect
          width="7"
          height="7"
          fill="color-mix(in srgb, var(--color-accent) 14%, transparent)"
        />
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-accent)" strokeWidth="3" />
      </pattern>
      <pattern id={`${prefix}-var`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect
          width="8"
          height="8"
          fill="color-mix(in srgb, var(--color-neg) 14%, transparent)"
        />
        <circle cx="4" cy="4" r="2" fill="var(--color-neg)" />
      </pattern>
      <pattern id={`${prefix}-noise`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect
          width="8"
          height="8"
          fill="color-mix(in srgb, var(--color-muted) 14%, transparent)"
        />
        <path d="M0 0H8M0 0V8" stroke="var(--color-muted)" strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}
