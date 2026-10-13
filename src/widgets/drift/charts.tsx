/** SVG pieces shared by the widgets on the PSI page. Colors come from CSS tokens. */
import type { ReactNode } from 'react';
import { bandInfo, fmtPsi } from './format';

export const W = 600;
export const PAD = { l: 14, r: 14 };

export interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
}
export const xOf = (axis: Axis, v: number): number =>
  PAD.l +
  ((Math.min(axis.hi, Math.max(axis.lo, v)) - axis.lo) / (axis.hi - axis.lo)) *
    (W - PAD.l - PAD.r);

/** Build time = outlined bars. Today = solid bars. Never colour alone. */
export const TODAY_FILL = 'color-mix(in srgb, var(--color-accent) 70%, transparent)';
export const BUILD_STROKE = 'var(--color-ink)';

export function Legend({
  build = 'Build time',
  today = 'Today',
}: {
  build?: string;
  today?: string;
}) {
  return (
    <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm border-2"
          style={{ borderColor: BUILD_STROKE }}
        />
        {build} <span className="text-muted">(expected)</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ background: TODAY_FILL }}
        />
        {today} <span className="text-muted">(actual)</span>
      </li>
    </ul>
  );
}

/** A PSI value with its band: an icon plus words, never colour alone. */
export function BandChip({
  value,
  large = false,
}: {
  value: number | null;
  large?: boolean;
}) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-xs text-muted">no data</span>;
  const b = bandInfo(value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${large ? 'text-sm' : 'text-xs'}`}
      style={{ borderColor: b.color, color: b.color }}
    >
      <span aria-hidden="true">{b.icon}</span>
      {b.label}
    </span>
  );
}

export function BigPsi({
  value,
  label = 'PSI',
}: {
  value: number | null;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-mono text-3xl font-semibold tabular-nums">
          {fmtPsi(value)}
        </div>
      </div>
      <BandChip value={value} large />
    </div>
  );
}

export function AxisTicks({
  axis,
  y,
  label,
}: {
  axis: Axis;
  y: number;
  label?: string | undefined;
}) {
  return (
    <>
      <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--color-grid)" />
      {axis.ticks.map((t) => (
        <g key={t}>
          <line
            x1={xOf(axis, t)}
            x2={xOf(axis, t)}
            y1={y}
            y2={y + 4}
            stroke="var(--color-grid)"
          />
          <text
            x={xOf(axis, t)}
            y={y + 20}
            fontSize="16"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      {label && (
        <text
          x={W - PAD.r}
          y={y + 40}
          fontSize="15"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {label}
        </text>
      )}
    </>
  );
}

/** A triangle marking a mean: filled for today, outlined for build time. */
export function MeanMarker({
  x,
  y,
  filled,
  label,
}: {
  x: number;
  y: number;
  filled: boolean;
  label: string;
}) {
  return (
    <g>
      <path
        d={`M${x - 8} ${y + 16} L${x + 8} ${y + 16} L${x} ${y + 2} Z`}
        fill={filled ? 'var(--color-accent)' : 'var(--color-bg)'}
        stroke={filled ? 'var(--color-accent)' : BUILD_STROKE}
        strokeWidth="2"
      />
      <title>{label}</title>
    </g>
  );
}

interface PairProps {
  base: readonly number[];
  today: readonly number[];
  axis: Axis;
  /** The count that fills the full height. */
  yMax: number;
  height: number;
  ariaLabel: string;
  baseMean?: number;
  todayMean?: number;
  /** Slice edges to draw as dashed lines. */
  edges?: readonly number[];
  /** One value per slice, drawn as bars under the histogram. */
  contributions?: readonly number[];
  /** Slices under 1% of build time. */
  tiny?: readonly boolean[];
  axisLabel?: string;
}

/**
 * Build time (outlined) and today (solid) bars on one score axis. With `edges` it also
 * draws the slice boundaries, and with `contributions` a row of PSI bars aligned under
 * each slice.
 */
export function PairHistogram({
  base,
  today,
  axis,
  yMax,
  height,
  ariaLabel,
  baseMean,
  todayMean,
  edges,
  contributions,
  tiny,
  axisLabel = 'score (higher = safer)',
}: PairProps) {
  const n = base.length;
  const top = 12;
  const contribH = contributions ? 80 : 0;
  const baseY = height - 48 - contribH;
  const barW = (W - PAD.l - PAD.r) / n;
  const y = (v: number) => baseY - Math.min(1, v / Math.max(yMax, 1e-9)) * (baseY - top);
  const cMax = contributions ? Math.max(0.01, ...contributions) : 1;
  const inside = edges ? edges.filter((e) => e > axis.lo && e < axis.hi) : [];
  const bounds = [axis.lo, ...inside, axis.hi];
  const cBase = baseY + 26 + contribH;
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="block w-full select-none"
      role="img"
      aria-label={ariaLabel}
    >
      {today.map((v, i) => (
        <rect
          key={`t${i}`}
          x={PAD.l + i * barW + 1}
          y={y(v)}
          width={Math.max(0, barW - 2)}
          height={Math.max(0, baseY - y(v))}
          fill={TODAY_FILL}
        />
      ))}
      {base.map((v, i) => (
        <rect
          key={`b${i}`}
          x={PAD.l + i * barW + 1}
          y={y(v)}
          width={Math.max(0, barW - 2)}
          height={Math.max(0, baseY - y(v))}
          fill="none"
          stroke={BUILD_STROKE}
          strokeWidth="1.5"
        />
      ))}
      <AxisTicks axis={axis} y={baseY} label={contributions ? undefined : axisLabel} />
      {baseMean !== undefined && (
        <MeanMarker
          x={xOf(axis, baseMean)}
          y={baseY + 24}
          filled={false}
          label={`Build time average ${Math.round(baseMean)}`}
        />
      )}
      {todayMean !== undefined && (
        <MeanMarker
          x={xOf(axis, todayMean)}
          y={baseY + 24}
          filled
          label={`Today's average ${Math.round(todayMean)}`}
        />
      )}
      {inside.map((e) => (
        <line
          key={e}
          x1={xOf(axis, e)}
          x2={xOf(axis, e)}
          y1={top}
          y2={cBase}
          stroke="var(--color-muted)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ))}
      {contributions && (
        <g>
          <text x={PAD.l} y={baseY + 62} fontSize="15" fill="var(--color-muted)">
            what each slice adds to PSI
          </text>
          {contributions.map((c, i) => {
            const x0 = xOf(axis, bounds[i] ?? axis.lo);
            const x1 = xOf(axis, bounds[i + 1] ?? axis.hi);
            const h = (c / cMax) * (contribH - 24);
            return (
              <g key={i}>
                <rect
                  x={x0 + 1}
                  y={cBase - h}
                  width={Math.max(0, x1 - x0 - 2)}
                  height={Math.max(0, h)}
                  fill="var(--color-neg)"
                  opacity="0.8"
                />
                {tiny?.[i] && (
                  <text
                    x={(x0 + x1) / 2}
                    y={cBase - h - 3}
                    fontSize="14"
                    textAnchor="middle"
                    fill="var(--color-ink)"
                  >
                    ▲
                  </text>
                )}
              </g>
            );
          })}
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={cBase}
            y2={cBase}
            stroke="var(--color-grid)"
          />
        </g>
      )}
    </svg>
  );
}

/** The live plain-language reading under a widget. */
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
