/** SVG and text pieces shared by the widgets on the confidence-intervals page. Colours come from CSS tokens. */
import type { ReactNode } from 'react';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { LEVELS, type Level } from './intervals';
import { LegendItem, PAD_L, type Scale } from '../sampling/charts';

export {
  AVG_FILL,
  AVG_STROKE,
  ChartKey,
  EveryoneLine,
  EveryoneMark,
  GreyBox,
  LegendItem,
  PAD_L,
  POP_FILL,
  POP_STROKE,
  Reading,
  SampleMark,
  Skeleton,
  TriangleFilled,
  TriangleOutline,
  W,
  XAxis,
  f0,
  f1,
  makeScale,
  niceMax,
  niceTicks,
  pct,
  tickLabel,
} from '../sampling/charts';
export { pct1 } from '../distributions/charts';
export type { Scale } from '../sampling/charts';

export const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
/** Rate as a percentage with one decimal: 0.04 -> "4.0%". */
export const rate1 = (v: number): string =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';

export const levelText = (l: number) => `${Math.round(l * 100)}%`;

const LEVEL_OPTIONS = LEVELS.map((l) => ({ value: String(l), label: levelText(l) }));

/** The shared confidence-level pills (arrow keys move between them). */
export function LevelPills({
  level,
  onChange,
  label = 'Confidence level (how sure you want to be)',
}: {
  level: Level;
  onChange: (l: Level) => void;
  label?: string;
}) {
  return (
    <SegmentedControl
      label={label}
      options={LEVEL_OPTIONS}
      value={String(level)}
      onChange={(v) => onChange(Number(v) as Level)}
    />
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * One interval as a horizontal bar with end caps, centred on y. Caught: solid accent.
 * Missed: dashed coral with an x just past the end that fell short of the truth.
 */
export function IntervalBar({
  x1,
  x2,
  y,
  caught,
  cap = 3,
  width = 2.4,
  neutral = false,
  towards,
}: {
  x1: number;
  x2: number;
  y: number;
  caught: boolean;
  cap?: number;
  width?: number;
  /** Draw as a plain accent bar, whether or not it caught (truth still hidden). */
  neutral?: boolean;
  /** x of the truth, to place the x mark on the side nearest it. */
  towards?: number;
}) {
  const a = r1(Math.min(x1, x2));
  const b = r1(Math.max(x1, x2));
  const ok = caught || neutral;
  const color = ok ? 'var(--color-accent)' : 'var(--color-neg)';
  const t = towards ?? b;
  const mx = t >= b ? b + 7 : t <= a ? a - 7 : (a + b) / 2;
  return (
    <g>
      <path
        d={`M${a} ${r1(y - cap)}V${r1(y + cap)}M${a} ${r1(y)}H${b}M${b} ${r1(y - cap)}V${r1(y + cap)}`}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={ok ? undefined : '5 3'}
      />
      {!ok && (
        <path
          d={`M${r1(mx - 3)} ${r1(y - 3)}l6 6M${r1(mx - 3)} ${r1(y + 3)}l6 -6`}
          stroke="var(--color-neg)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

export interface StackRow {
  lo: number;
  hi: number;
  caught: boolean;
  /** The lower end was cut off at the left edge ("below 0"). */
  below?: boolean;
  /** Zero width: draw a dot instead of a bar. */
  dot?: boolean;
}

/** A vertical stack of intervals, newest first, over a dashed truth line. */
export function IntervalStack({
  rows,
  scale,
  truth,
  top,
  pitch,
  truthLabel,
}: {
  rows: StackRow[];
  scale: Scale;
  truth: number;
  top: number;
  pitch: number;
  truthLabel?: string;
}) {
  const tx = scale.x(truth);
  const bottom = top + Math.max(rows.length, 1) * pitch;
  return (
    <g>
      <line
        x1={tx}
        x2={tx}
        y1={top - 6}
        y2={bottom + 4}
        stroke="var(--color-ink)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      {truthLabel && (
        <text
          x={tx}
          y={top - 12}
          fontSize="16"
          fontWeight="600"
          textAnchor="middle"
          fill="var(--color-ink)"
        >
          {truthLabel}
        </text>
      )}
      {rows.map((r, i) => {
        const y = top + i * pitch + pitch / 2;
        if (r.dot) {
          const cx = scale.x(r.lo);
          return (
            <g key={i}>
              <circle
                cx={r1(cx)}
                cy={y}
                r="2.6"
                fill="var(--color-neg)"
                stroke="var(--color-neg)"
              />
              {!r.caught && (
                <path
                  d={`M${r1(cx + 5)} ${r1(y - 2.5)}l5 5M${r1(cx + 5)} ${r1(y + 2.5)}l5 -5`}
                  stroke="var(--color-neg)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        }
        const x1 = scale.x(r.lo);
        const x2 = scale.x(r.hi);
        return (
          <g key={i}>
            {r.below && (
              <rect
                x={r1(x1 - 1.5)}
                y={r1(y - pitch / 2 + 0.5)}
                width={r1(x2 - x1 + 3)}
                height={pitch - 1}
                fill="none"
                stroke="var(--color-neg)"
                strokeWidth="1"
              />
            )}
            <IntervalBar
              x1={x1}
              x2={x2}
              y={y}
              caught={r.caught}
              cap={Math.min(3, pitch / 2 - 0.5)}
              width={pitch >= 6 ? 2.2 : 1.8}
              towards={tx}
            />
            {r.below && (
              <text x={PAD_L + 1} y={r1(y + 2.5)} fontSize="7" fill="var(--color-neg)">
                ◂
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

const CaughtSwatch = (
  <path
    d="M2 8H16M2 4V12M16 4V12"
    fill="none"
    stroke="var(--color-accent)"
    strokeWidth="2.2"
  />
);
const MissedSwatch = (
  <g>
    <path
      d="M1 8H11M1 4V12M11 4V12"
      fill="none"
      stroke="var(--color-neg)"
      strokeWidth="2.2"
      strokeDasharray="3 2"
    />
    <path
      d="M13 5l4 6M13 11l4 -6"
      stroke="var(--color-neg)"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </g>
);
const TruthDash = (
  <line
    x1="9"
    x2="9"
    y1="1"
    y2="15"
    stroke="var(--color-ink)"
    strokeWidth="2"
    strokeDasharray="3 2.5"
  />
);

/** Legend for stacked intervals. Shape and dash carry the meaning, not just colour. */
export function StackLegend({ extra }: { extra?: ReactNode }) {
  return (
    <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      <LegendItem shape={CaughtSwatch}>solid bar: caught the truth</LegendItem>
      <LegendItem shape={MissedSwatch}>dashed bar with ×: missed it</LegendItem>
      <LegendItem shape={TruthDash}>dashed line: the truth</LegendItem>
      {extra}
    </ul>
  );
}

/** Whole-number sample sizes evenly spaced on a log scale, always including the ticks. */
export function makeNList(min: number, max: number, ticks: number[]): number[] {
  const s = new Set<number>(ticks);
  for (let i = 0; i <= 100; i++) s.add(Math.round(min * Math.pow(max / min, i / 100)));
  return [...s].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

export function nearestIndex(list: number[], n: number): number {
  let best = 0;
  for (let i = 0; i < list.length; i++)
    if (Math.abs(list[i]! - n) < Math.abs(list[best]! - n)) best = i;
  return best;
}

/** A log-spaced sample-size slider's tick row. */
export function TickRow({ list, ticks }: { list: number[]; ticks: number[] }) {
  return (
    <div className="relative mx-[6px] h-4 text-[11px] text-muted" aria-hidden="true">
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute -translate-x-1/2"
          style={{ left: `${(nearestIndex(list, t) / (list.length - 1)) * 100}%` }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}
