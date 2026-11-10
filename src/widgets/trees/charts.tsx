/** SVG and text pieces shared by the widgets on the decision-tree page. Colours come from CSS tokens. */
import { useId, type ReactNode, type Ref } from 'react';
import { LegendItem } from '../sampling/charts';
import type { Bounds, CutSegment, Region, Split } from './tree';

export { Reading, Skeleton } from '../sampling/charts';
export { Note } from '../biasvar/charts';

// ---------- formatting (never NaN or Infinity) ----------

export const pct0 = (p: number): string =>
  Number.isFinite(p) ? `${Math.round(p * 100)}%` : '—';
export const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
export const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '—');
export const f0 = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : '—';
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** A plain reading for a mix value (0 = one kind, 0.5 = even mix). */
export function mixWord(g: number): string {
  if (!Number.isFinite(g)) return 'no fruit';
  if (g < 0.005) return 'all one kind';
  if (g < 0.1) return 'almost all one kind';
  if (g < 0.3) return 'mostly one kind';
  if (g < 0.45) return 'quite mixed';
  return 'even mix';
}

// ---------- worlds ----------

export interface World {
  kind: 'fruit' | 'checker';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  xLabel: string;
  yLabel: string;
  xTicks: number[];
  yTicks: number[];
  xFmt: (v: number) => string;
  yFmt: (v: number) => string;
  /** Name of feature 0 / 1 in a question, and its value text. */
  name: [string, string];
  value: [(v: number) => string, (v: number) => string];
}

export function fruitWorld(kg = false): World {
  return {
    kind: 'fruit',
    x0: 60,
    x1: 300,
    y0: 0,
    y1: 10,
    xLabel: kg ? 'Weight (kg)' : 'Weight (g)',
    yLabel: 'Skin shade (0 = green, 10 = orange)',
    xTicks: [60, 120, 180, 240, 300],
    yTicks: [0, 2, 4, 6, 8, 10],
    xFmt: kg ? (v) => (v / 1000).toFixed(2) : (v) => String(v),
    yFmt: (v) => String(v),
    name: ['weight', 'skin shade'],
    value: [
      kg ? (v) => `${(v / 1000).toFixed(3)} kg` : (v) => `${Math.round(v)} g`,
      (v) => v.toFixed(1),
    ],
  };
}

export const CHECKER_WORLD: World = {
  kind: 'checker',
  x0: 0,
  x1: 1,
  y0: 0,
  y1: 1,
  xLabel: 'x',
  yLabel: 'y',
  xTicks: [0, 0.5, 1],
  yTicks: [0, 0.5, 1],
  xFmt: (v) => String(v),
  yFmt: (v) => String(v),
  name: ['x', 'y'],
  value: [(v) => v.toFixed(2), (v) => v.toFixed(2)],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Skin shade < 4.8?" */
export const questionText = (w: World, s: Split, capital = true): string => {
  const t = `${w.name[s.feature]} < ${w.value[s.feature as 0 | 1](s.threshold)}`;
  return capital ? `${cap(t)}?` : t;
};

/** "shade < 4.8" for a label on a cut. */
export const cutLabel = (w: World, s: Split): string =>
  `${s.feature === 0 ? w.name[0] : w.kind === 'fruit' ? 'shade' : w.name[1]} < ${w.value[s.feature as 0 | 1](s.threshold)}`;

// ---------- chart frame ----------

export const CH = { W: 600, H: 340, L: 50, R: 12, T: 14, B: 46 } as const;
const PW = CH.W - CH.L - CH.R;
const PH = CH.H - CH.T - CH.B;

export interface Scale {
  px: (v: number) => number;
  py: (v: number) => number;
  /** Data value from a viewBox x / y. */
  vx: (px: number) => number;
  vy: (py: number) => number;
}

export function scaleOf(w: World): Scale {
  return {
    px: (v) => CH.L + ((v - w.x0) / (w.x1 - w.x0)) * PW,
    py: (v) => CH.T + ((w.y1 - v) / (w.y1 - w.y0)) * PH,
    vx: (p) => w.x0 + ((p - CH.L) / PW) * (w.x1 - w.x0),
    vy: (p) => w.y1 - ((p - CH.T) / PH) * (w.y1 - w.y0),
  };
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Patterns: apple boxes get a plain tint, orange boxes diagonal hatching. */
export function Patterns({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-apple`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect
          width="8"
          height="8"
          fill="color-mix(in srgb, var(--color-pos) 16%, transparent)"
        />
      </pattern>
      <pattern
        id={`${prefix}-orange`}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect
          width="7"
          height="7"
          fill="color-mix(in srgb, var(--color-neg) 10%, transparent)"
        />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="7"
          stroke="var(--color-neg)"
          strokeWidth="2"
          opacity="0.55"
        />
      </pattern>
    </defs>
  );
}

export const fillFor = (prefix: string, prediction: 0 | 1): string =>
  `url(#${prefix}-${prediction === 1 ? 'orange' : 'apple'})`;

export function MapChart({
  world,
  label,
  children,
  overlay,
  svgRef,
  handlers,
  noAxes = false,
}: {
  world: World;
  label: string;
  /** Drawn inside the plot area and clipped to it. */
  children: ReactNode;
  overlay?: ReactNode;
  svgRef?: Ref<SVGSVGElement>;
  handlers?: React.SVGProps<SVGSVGElement>;
  noAxes?: boolean;
}) {
  const clip = `mc${useId().replace(/:/g, '')}`;
  const s = scaleOf(world);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CH.W} ${CH.H}`}
      className="block h-auto w-full touch-pan-y select-none"
      style={{ aspectRatio: `${CH.W} / ${CH.H}` }}
      role="img"
      aria-label={label}
      {...handlers}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={CH.L} y={CH.T} width={PW} height={PH} />
        </clipPath>
      </defs>
      <rect
        x={CH.L}
        y={CH.T}
        width={PW}
        height={PH}
        fill="var(--color-surface)"
        stroke="var(--color-grid)"
      />
      {!noAxes && (
        <g fill="var(--color-muted)" fontSize="15">
          {world.xTicks.map((t) => (
            <text key={`x${t}`} x={s.px(t)} y={CH.T + PH + 20} textAnchor="middle">
              {world.xFmt(t)}
            </text>
          ))}
          {world.yTicks.map((t) => (
            <text key={`y${t}`} x={CH.L - 6} y={s.py(t) + 5} textAnchor="end">
              {world.yFmt(t)}
            </text>
          ))}
          <text x={CH.L + PW} y={CH.H - 4} textAnchor="end" fontSize="14">
            {world.xLabel}
          </text>
        </g>
      )}
      <g clipPath={`url(#${clip})`}>{children}</g>
      {overlay}
    </svg>
  );
}

/** The y-axis name sits above the chart, as plain text (keeps the plot area large). */
export function YAxisName({ children }: { children: ReactNode }) {
  return <p className="m-0 mb-1 text-xs text-muted">↑ {children}</p>;
}

/** Apples: filled circles. Oranges: hollow triangles. */
export function ClassPoints({
  X,
  y,
  scale,
  r = 4.2,
}: {
  X: number[][];
  y: readonly number[];
  scale: Scale;
  r?: number;
}) {
  const out: ReactNode[] = [];
  for (let i = 0; i < X.length; i++) {
    const cx = r1(scale.px(X[i]![0]!));
    const cy = r1(scale.py(X[i]![1]!));
    if (y[i] === 1) {
      const t = r * 1.25;
      out.push(
        <polygon
          key={i}
          points={`${cx},${r1(cy - t)} ${r1(cx + t)},${r1(cy + t * 0.8)} ${r1(cx - t)},${r1(cy + t * 0.8)}`}
          fill="var(--color-surface)"
          fillOpacity="0.55"
          stroke="var(--color-neg)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />,
      );
    } else {
      out.push(
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--color-pos)"
          stroke="var(--color-surface)"
          strokeWidth="0.8"
        />,
      );
    }
  }
  return <g>{out}</g>;
}

/** Boxes shaded by predicted class; the selected box gets a thick dashed outline. */
export function Regions({
  regions,
  scale,
  prefix,
  selected,
  onSelect,
  names = ['Apple', 'Orange'],
  describe,
}: {
  regions: Region[];
  scale: Scale;
  prefix: string;
  selected?: number | null;
  onSelect?: (nodeId: number) => void;
  names?: [string, string];
  describe?: (r: Region) => string;
}) {
  return (
    <g>
      {regions.map((r) => {
        const x = scale.px(r.x0);
        const y = scale.py(r.y1);
        const w = scale.px(r.x1) - x;
        const h = scale.py(r.y0) - y;
        if (!(w > 0) || !(h > 0)) return null;
        const on = selected === r.nodeId;
        const act = onSelect ? () => onSelect(r.nodeId) : undefined;
        return (
          <g key={r.nodeId}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={fillFor(prefix, r.prediction)}
              stroke="var(--color-muted)"
              strokeWidth="0.6"
              style={act ? { cursor: 'pointer' } : undefined}
              onClick={act}
              role={act ? 'button' : undefined}
              tabIndex={act ? 0 : undefined}
              aria-label={
                act
                  ? `Box ${r.nodeId}: ${describe ? describe(r) : names[r.prediction]}`
                  : undefined
              }
              aria-pressed={act ? on : undefined}
              onKeyDown={
                act
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        act();
                      }
                    }
                  : undefined
              }
            />
            {w > 64 && h > 34 && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 5}
                textAnchor="middle"
                fontSize="15"
                fontWeight="600"
                fill="var(--color-ink)"
                stroke="var(--color-surface)"
                strokeWidth="4"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {names[r.prediction]}
              </text>
            )}
            {on && (
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={Math.max(0, w - 3)}
                height={Math.max(0, h - 3)}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="3"
                strokeDasharray="7 5"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Solid cut lines with small labels. */
export function Cuts({
  cuts,
  scale,
  world,
  labels = true,
}: {
  cuts: CutSegment[];
  scale: Scale;
  world: World;
  labels?: boolean;
}) {
  return (
    <g>
      {cuts.map((c) => {
        const x0 = scale.px(c.x0);
        const x1 = scale.px(c.x1);
        const y0 = scale.py(c.y0);
        const y1 = scale.py(c.y1);
        const vertical = c.feature === 0;
        return (
          <g key={c.nodeId}>
            <line
              x1={x0}
              x2={x1}
              y1={y0}
              y2={y1}
              stroke="var(--color-ink)"
              strokeWidth="2.2"
            />
            {labels && (
              <text
                x={vertical ? x0 + 3 : x0 + 4}
                y={vertical ? Math.min(y0, y1) + 13 : y0 - 4}
                fontSize="12"
                fill="var(--color-ink)"
                stroke="var(--color-surface)"
                strokeWidth="3.5"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {cutLabel(world, { feature: c.feature, threshold: c.threshold })}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------- legend ----------

const SW = {
  apple: <circle cx="9" cy="8" r="4.5" fill="var(--color-pos)" />,
  orange: (
    <polygon
      points="9,2.5 14.5,12 3.5,12"
      fill="none"
      stroke="var(--color-neg)"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  appleBox: (
    <rect
      x="1"
      y="2"
      width="16"
      height="12"
      fill="color-mix(in srgb, var(--color-pos) 22%, transparent)"
      stroke="var(--color-muted)"
    />
  ),
  orangeBox: (
    <g>
      <rect
        x="1"
        y="2"
        width="16"
        height="12"
        fill="color-mix(in srgb, var(--color-neg) 10%, transparent)"
        stroke="var(--color-muted)"
      />
      <path
        d="M3 14L11 2M8 14L16 2M1 9L6 2"
        stroke="var(--color-neg)"
        strokeWidth="1.5"
        opacity="0.7"
      />
    </g>
  ),
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
  line: <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-pos)" strokeWidth="1.8" />,
  dot: <circle cx="9" cy="8" r="4" fill="var(--color-ink)" fillOpacity="0.85" />,
  train: (
    <g>
      <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-neg)" strokeWidth="2.5" />
      <circle cx="9" cy="8" r="3.5" fill="var(--color-neg)" />
    </g>
  ),
  fresh: (
    <g>
      <line
        x1="1"
        x2="17"
        y1="8"
        y2="8"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeDasharray="4 3"
      />
      <rect
        x="6"
        y="5"
        width="6"
        height="6"
        fill="var(--color-surface)"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
      />
    </g>
  ),
  best: (
    <line
      x1="1"
      x2="17"
      y1="8"
      y2="8"
      stroke="var(--color-good)"
      strokeWidth="2"
      strokeDasharray="2 3"
    />
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

export const CLASS_LEGEND: [SwatchKind, string][] = [
  ['apple', 'Apple (filled circle)'],
  ['orange', 'Orange (hollow triangle)'],
];
export const BOX_LEGEND: [SwatchKind, string][] = [
  ['appleBox', 'Box says apple (plain tint)'],
  ['orangeBox', 'Box says orange (hatched)'],
];

// ---------- stacked count bar ----------

/** Apples and oranges in one box as a bar: solid for apples, hatched for oranges. */
export function StackBar({
  apples,
  oranges,
  label,
}: {
  apples: number;
  oranges: number;
  label: string;
}) {
  const total = apples + oranges;
  const id = `sb${useId().replace(/:/g, '')}`;
  const wA = total > 0 ? (apples / total) * 200 : 0;
  return (
    <svg
      viewBox="0 0 200 14"
      className="block h-3.5 w-full"
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern
          id={id}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect
            width="6"
            height="6"
            fill="color-mix(in srgb, var(--color-neg) 12%, transparent)"
          />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-neg)" strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="200" height="14" fill="var(--color-grid)" opacity="0.5" />
      {total > 0 && <rect x="0" y="0" width={wA} height="14" fill="var(--color-pos)" />}
      {total > 0 && (
        <rect x={wA} y="0" width={200 - wA} height="14" fill={`url(#${id})`} />
      )}
      <rect
        x="0.5"
        y="0.5"
        width="199"
        height="13"
        fill="none"
        stroke="var(--color-muted)"
      />
    </svg>
  );
}

// ---------- small maps (panel C) ----------

export function MiniMap({
  regions,
  X,
  y,
  world,
  label,
}: {
  regions: Region[];
  X: number[][];
  y: readonly number[];
  world: World;
  label: string;
}) {
  const id = `mm${useId().replace(/:/g, '')}`;
  const W = 200;
  const H = 120;
  const sx = (v: number) => ((v - world.x0) / (world.x1 - world.x0)) * W;
  const sy = (v: number) => ((world.y1 - v) / (world.y1 - world.y0)) * H;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={label}
    >
      <Patterns prefix={id} />
      {regions.map((r) => (
        <rect
          key={r.nodeId}
          x={sx(r.x0)}
          y={sy(r.y1)}
          width={Math.max(0, sx(r.x1) - sx(r.x0))}
          height={Math.max(0, sy(r.y0) - sy(r.y1))}
          fill={fillFor(id, r.prediction)}
          stroke="var(--color-muted)"
          strokeWidth="0.5"
        />
      ))}
      {X.map((p, i) =>
        y[i] === 1 ? (
          <polygon
            key={i}
            points={`${sx(p[0]!)},${sy(p[1]!) - 2.6} ${sx(p[0]!) + 2.6},${sy(p[1]!) + 2} ${sx(p[0]!) - 2.6},${sy(p[1]!) + 2}`}
            fill="none"
            stroke="var(--color-neg)"
            strokeWidth="0.9"
          />
        ) : (
          <circle key={i} cx={sx(p[0]!)} cy={sy(p[1]!)} r="1.9" fill="var(--color-pos)" />
        ),
      )}
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        fill="none"
        stroke="var(--color-grid)"
      />
    </svg>
  );
}

// ---------- sticky controls ----------

/** Controls that move the chart stay in view while the reader scrolls through the widget. */
export function StickyControls({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-3 mb-3 border-b border-grid bg-surface px-3 pb-2 pt-2 sm:-mx-4 sm:px-4">
      {children}
    </div>
  );
}

// ---------- chips ----------

export function Chip({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0 mt-2 inline-block rounded-full border border-grid px-3 py-0.5 text-sm font-semibold"
      role="status"
    >
      {children}
    </p>
  );
}

export const FIT_CHIP = {
  'too simple': '▬ Too simple',
  'a fair fit': '● A fair fit',
  memorizing: '▲ Memorizing',
} as const;

export const FULL_BOUNDS = (w: World): Bounds => ({
  x0: w.x0,
  x1: w.x1,
  y0: w.y0,
  y1: w.y1,
});

/** A labelled card for one figure with a plain reading underneath. */
export function Card({
  label,
  value,
  plain,
  tone,
}: {
  label: string;
  value: string;
  plain?: ReactNode;
  tone?: 'good' | 'ink';
}) {
  return (
    <div
      className={`min-w-0 rounded-md border bg-bg px-3 py-2 ${tone === 'good' ? 'border-good' : 'border-grid'}`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      {plain && <div className="text-xs leading-tight text-muted">{plain}</div>}
    </div>
  );
}
