/** SVG pieces shared by the widgets on the gradient descent page. Colours come from CSS tokens. */
import { useId, type ReactNode } from 'react';
import { Label, LegendRow, Reading, TryThis, r1, Card } from '../regularization/charts';
import { Slider, fromPosition, toPosition } from '../../components/ui/Slider';
import { Skeleton } from '../sampling/charts';
import type { Pt } from './bowl';

export { Label, LegendRow, Reading, TryThis, r1, Card, Skeleton };

// ---------- the bowl frame (equal pixel scale in x and y) ----------

export const X_LO = -12;
export const X_HI = 12;
export const Y_LO = -5;
export const Y_HI = 5;
export const BW = 600;
const BL = 34;
const BR = 12;
const BT = 10;
const BB = 34;
/** Pixels per data unit, the same in x and y. */
export const U = (BW - BL - BR) / (X_HI - X_LO);
const BPH = (Y_HI - Y_LO) * U;
export const BH = Math.round(BT + BPH + BB);

export const sx = (x: number): number => BL + (x - X_LO) * U;
export const sy = (y: number): number => BT + (Y_HI - y) * U;
export const dx = (px: number): number => X_LO + (px - BL) / U;
export const dy = (py: number): number => Y_HI - (py - BT) / U;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** A data point kept inside a generous box so huge values still make valid SVG. */
export const safeX = (x: number): number => sx(clampN(x, -1000, 1000));
export const safeY = (y: number): number => sy(clampN(y, -1000, 1000));

const RINGS = [2, 4, 6, 8, 10, 12];

/** Contours of f = 0.5 (x^2 + kappa y^2): ellipses with x-radius r and y-radius r / sqrt(kappa). */
export function Rings({ kappa, shade = false }: { kappa: number; shade?: boolean }) {
  const k = Math.max(1, kappa);
  // Outer ring first, so each inner ring paints over it: deeper shade means higher ground.
  const order = [...RINGS].reverse();
  return (
    <g fill="none" stroke="var(--color-grid)" strokeWidth="1.4">
      {order.map((r, i) => (
        <ellipse
          key={r}
          cx={sx(0)}
          cy={sy(0)}
          rx={r * U}
          ry={(r / Math.sqrt(k)) * U}
          fill={
            shade
              ? `color-mix(in srgb, var(--color-accent) ${Math.round(24 - i * 3.6)}%, var(--color-bg))`
              : 'none'
          }
        />
      ))}
    </g>
  );
}

/** Heights printed on the rings along the left of the map, like a hiking map. */
export function RingHeights({ rings = [2, 4, 6, 8] }: { rings?: number[] }) {
  return (
    <g>
      {rings.map((r, i) => (
        <Label
          key={r}
          x={sx(-r)}
          y={sy(0) - 5}
          anchor="middle"
          size={11}
          fill="var(--color-muted)"
        >
          {i === 0 ? `loss ${(r * r) / 2}` : String((r * r) / 2)}
        </Label>
      ))}
    </g>
  );
}

export function BowlSvg({
  kappa,
  label,
  children,
  overlay,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  shade = false,
  xLabel = 'knob 1: gentle direction →',
  yLabel = 'knob 2: steep direction ↑',
}: {
  kappa: number;
  label: string;
  /** Shade the map by height (deeper = higher). */
  shade?: boolean;
  xLabel?: string;
  yLabel?: string;
  /** Drawn inside the frame and clipped to it. */
  children?: ReactNode;
  /** Drawn on top, not clipped. */
  overlay?: ReactNode;
  svgRef?: React.Ref<SVGSVGElement>;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const clip = `bw${useId().replace(/:/g, '')}`;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${BW} ${BH}`}
      className="block h-auto w-full select-none"
      style={{
        aspectRatio: `${BW} / ${BH}`,
        touchAction: onPointerDown ? 'none' : undefined,
      }}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={BL} y={BT} width={BW - BL - BR} height={BPH} />
        </clipPath>
      </defs>
      <rect
        x={BL}
        y={BT}
        width={BW - BL - BR}
        height={BPH}
        fill={
          shade
            ? 'color-mix(in srgb, var(--color-accent) 27%, var(--color-bg))'
            : 'var(--color-bg)'
        }
        stroke="var(--color-grid)"
      />
      <g clipPath={`url(#${clip})`}>
        <line
          x1={sx(X_LO)}
          x2={sx(X_HI)}
          y1={sy(0)}
          y2={sy(0)}
          stroke="var(--color-grid)"
        />
        <line
          x1={sx(0)}
          x2={sx(0)}
          y1={sy(Y_HI)}
          y2={sy(Y_LO)}
          stroke="var(--color-grid)"
        />
        <Rings kappa={kappa} shade={shade} />
        {children}
      </g>
      {[-12, -8, -4, 0, 4, 8, 12].map((t) => (
        <text
          key={t}
          x={sx(t)}
          y={BT + BPH + 16}
          fontSize="13"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {t}
        </text>
      ))}
      {[-4, 0, 4].map((t) => (
        <text
          key={t}
          x={BL - 6}
          y={sy(t) + 4}
          fontSize="13"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {t}
        </text>
      ))}
      <text
        x={BW - BR}
        y={BH - 3}
        fontSize="12"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        {xLabel}
      </text>
      <text x={BL + 4} y={BH - 3} fontSize="12" fill="var(--color-muted)">
        {yLabel}
      </text>
      {overlay}
    </svg>
  );
}

// ---------- markers ----------

export function StarMark({
  x,
  y,
  label = 'Bottom',
}: {
  x: number;
  y: number;
  label?: string | null;
}) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9 : 4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${r1(x + r * Math.cos(a))},${r1(y + r * Math.sin(a))}`);
  }
  return (
    <g>
      <polygon
        points={pts.join(' ')}
        fill="var(--color-good)"
        stroke="var(--color-surface)"
        strokeWidth="1"
      />
      {label && (
        <Label x={x + 12} y={y - 10} size={13}>
          {label}
        </Label>
      )}
    </g>
  );
}

export function StartMark({
  x,
  y,
  label = 'Start',
}: {
  x: number;
  y: number;
  label?: string | null;
}) {
  return (
    <g>
      <circle
        cx={r1(x)}
        cy={r1(y)}
        r="6.5"
        fill="var(--color-surface)"
        stroke="var(--color-ink)"
        strokeWidth="2.2"
      />
      {label && (
        <Label x={x + 10} y={y - 9} size={13}>
          {label}
        </Label>
      )}
    </g>
  );
}

/** A line with an arrowhead from (x1, y1) to (x2, y2), in pixels. */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  dashed = false,
  stroke = 'var(--color-ink)',
  width = 2.6,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed?: boolean;
  stroke?: string;
  width?: number;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!(len > 1)) return null;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const h = Math.min(11, len * 0.6);
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  return (
    <g>
      <line
        x1={r1(x1)}
        y1={r1(y1)}
        x2={r1(bx)}
        y2={r1(by)}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dashed ? '6 4' : undefined}
        strokeLinecap="round"
      />
      <polygon
        points={`${r1(x2)},${r1(y2)} ${r1(bx - uy * h * 0.5)},${r1(by + ux * h * 0.5)} ${r1(bx + uy * h * 0.5)},${r1(by - ux * h * 0.5)}`}
        fill={stroke}
      />
    </g>
  );
}

export type TrailShape = 'circle' | 'diamond';

export function TrailMark({
  x,
  y,
  shape,
  r,
}: {
  x: number;
  y: number;
  shape: TrailShape;
  r: number;
}) {
  return shape === 'circle' ? (
    <circle cx={r1(x)} cy={r1(y)} r={r} fill="var(--color-ink)" />
  ) : (
    <polygon
      points={`${r1(x)},${r1(y - r)} ${r1(x + r)},${r1(y)} ${r1(x)},${r1(y + r)} ${r1(x - r)},${r1(y)}`}
      fill="var(--color-accent)"
    />
  );
}

/** A polyline through bowl points with a dot every step up to 60 steps, then thinned. */
export function Trail({
  path,
  steps,
  shown,
  thick = false,
  shape = 'circle',
}: {
  path: readonly Pt[];
  steps: readonly number[];
  /** Draw only the points with step number up to this. */
  shown: number;
  thick?: boolean;
  shape?: TrailShape;
}) {
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) if (steps[i]! <= shown) idx.push(i);
  if (idx.length === 0) return null;
  const d = idx
    .map(
      (i, k) =>
        `${k === 0 ? 'M' : 'L'}${r1(safeX(path[i]![0]))} ${r1(safeY(path[i]![1]))}`,
    )
    .join('');
  const dotIdx = idx.filter((i) => steps[i]! <= 60);
  const rest = idx.filter((i) => steps[i]! > 60);
  const every = Math.max(1, Math.ceil(rest.length / 25));
  for (let k = 0; k < rest.length; k += every) dotIdx.push(rest[k]!);
  const color = shape === 'circle' ? 'var(--color-ink)' : 'var(--color-accent)';
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={thick ? 3.4 : 1.6}
        strokeLinejoin="round"
        opacity={thick ? 0.9 : 0.85}
      />
      {dotIdx.map((i) => (
        <TrailMark
          key={i}
          x={safeX(path[i]![0])}
          y={safeY(path[i]![1])}
          shape={shape}
          r={thick ? 4.4 : 2.8}
        />
      ))}
    </g>
  );
}

// ---------- legend swatches ----------

export const SwCircleTrail = (
  <g>
    <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-ink)" strokeWidth="1.6" />
    <circle cx="9" cy="8" r="3" fill="var(--color-ink)" />
  </g>
);
export const SwDiamondTrail = (
  <g>
    <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-accent)" strokeWidth="3.2" />
    <polygon points="9,2.5 14.5,8 9,13.5 3.5,8" fill="var(--color-accent)" />
  </g>
);
export const SwSolidArrow = (
  <g>
    <line x1="1" x2="12" y1="8" y2="8" stroke="var(--color-ink)" strokeWidth="2.6" />
    <polygon points="17,8 11,4 11,12" fill="var(--color-ink)" />
  </g>
);
export const SwDashArrow = (
  <g>
    <line
      x1="1"
      x2="12"
      y1="8"
      y2="8"
      stroke="var(--color-ink)"
      strokeWidth="2.6"
      strokeDasharray="4 3"
    />
    <polygon points="17,8 11,4 11,12" fill="var(--color-ink)" />
  </g>
);
export const SwStart = (
  <circle
    cx="9"
    cy="8"
    r="5"
    fill="var(--color-surface)"
    stroke="var(--color-ink)"
    strokeWidth="2"
  />
);
export const SwStar = (
  <polygon
    points="9,1 11,6 16.5,6.2 12.2,9.6 13.8,15 9,12 4.2,15 5.8,9.6 1.5,6.2 7,6"
    fill="var(--color-good)"
  />
);
export const SwRing = (
  <ellipse
    cx="9"
    cy="8"
    rx="8"
    ry="5"
    fill="none"
    stroke="var(--color-grid)"
    strokeWidth="2"
  />
);

// ---------- loss-gap chart on a log axis ----------

const LW = 600;
const LH = 250;
const LL = 50;
const LR = 14;
const LT = 14;
const LB = 40;

export interface GapSeries {
  gaps: readonly number[];
  label: string;
  dashed: boolean;
  shape: TrailShape;
  /** Step where it first reaches 99%, to mark. */
  crossing: number | null;
}

/** Loss gap (share of the start) against step, log y axis from 1 down to 10^-minExp. */
export function GapChart({
  series,
  minExp,
  xMax,
  label,
}: {
  series: GapSeries[];
  minExp: number;
  xMax: number;
  label: string;
}) {
  const pw = LW - LL - LR;
  const ph = LH - LT - LB;
  const x = (t: number) => LL + (t / xMax) * pw;
  const lo = 10 ** -minExp;
  const y = (g: number) => {
    const v = Math.log10(Math.min(1, Math.max(lo, Number.isFinite(g) ? g : 1)));
    return LT + (-v / minExp) * ph;
  };
  const xTicks: number[] = [];
  const step = xMax <= 30 ? 5 : xMax <= 60 ? 10 : xMax <= 150 ? 25 : 50;
  for (let t = 0; t <= xMax; t += step) xTicks.push(t);
  const exps: number[] = [];
  for (let e = 0; e <= minExp; e += minExp > 4 ? 2 : 1) exps.push(e);
  return (
    <svg
      viewBox={`0 0 ${LW} ${LH}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${LW} / ${LH}` }}
      role="img"
      aria-label={label}
    >
      {exps.map((e) => (
        <g key={e}>
          <line
            x1={LL}
            x2={LW - LR}
            y1={y(10 ** -e)}
            y2={y(10 ** -e)}
            stroke="var(--color-grid)"
          />
          <text
            x={LL - 6}
            y={y(10 ** -e) + 4}
            fontSize="13"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {e === 0 ? '1' : `1e-${e}`}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text
          key={t}
          x={x(t)}
          y={LT + ph + 16}
          fontSize="13"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {t}
        </text>
      ))}
      <text
        x={LW - LR}
        y={LH - 4}
        fontSize="12"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        steps →
      </text>
      <text x={LL} y={LT - 3} fontSize="12" fill="var(--color-muted)">
        loss still to go (share of the start, log scale)
      </text>
      <line
        x1={LL}
        x2={LW - LR}
        y1={y(0.01)}
        y2={y(0.01)}
        stroke="var(--color-good)"
        strokeWidth="1.8"
        strokeDasharray="6 4"
      />
      <Label
        x={LW - LR - 4}
        y={y(0.01) - 6}
        anchor="end"
        size={12}
        fill="var(--color-good)"
      >
        99% of the way down
      </Label>
      {series.map((s, si) => {
        const n = Math.min(s.gaps.length - 1, xMax);
        let d = '';
        for (let t = 0; t <= n; t++)
          d += `${t === 0 ? 'M' : 'L'}${r1(x(t))} ${r1(y(s.gaps[t]!))}`;
        const every = Math.max(1, Math.ceil(n / 24));
        const marks: number[] = [];
        for (let t = 0; t <= n; t += every) marks.push(t);
        const color = s.shape === 'circle' ? 'var(--color-ink)' : 'var(--color-accent)';
        return (
          <g key={si}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={s.shape === 'circle' ? 2 : 2.8}
              strokeDasharray={s.dashed ? '8 5' : undefined}
              strokeLinejoin="round"
            />
            {marks.map((t) => (
              <TrailMark
                key={t}
                x={x(t)}
                y={y(s.gaps[t]!)}
                shape={s.shape}
                r={s.shape === 'circle' ? 2.6 : 3.8}
              />
            ))}
            {s.crossing !== null && s.crossing <= xMax && (
              <g>
                <line
                  x1={x(s.crossing)}
                  x2={x(s.crossing)}
                  y1={y(0.01)}
                  y2={LT + ph}
                  stroke={color}
                  strokeWidth="1.4"
                  strokeDasharray="2 3"
                />
                <Label
                  x={x(s.crossing)}
                  y={LT + ph - 6 - si * 15}
                  anchor="middle"
                  size={12}
                >
                  {`step ${s.crossing}`}
                </Label>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- a log slider with labelled marks on its track ----------

export interface SliderMark {
  value: number;
  label: string;
  /** 'above' or 'below' the track, so close marks do not collide. */
  row: 'above' | 'below';
}

const THUMB = 16;

/** The shared Slider plus tick marks and labels positioned along its track. */
export function MarkedSlider({
  label,
  value,
  min,
  max,
  onChange,
  marks,
  format,
  step,
  log = true,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  marks: SliderMark[];
  format?: (v: number) => string;
  step?: number;
  log?: boolean;
}) {
  const frac = (v: number) => {
    const p = toPosition(Math.min(max, Math.max(min, v)), min, max, log);
    return log ? p / 1000 : (p - min) / (max - min);
  };
  const place = (v: number) => `calc(${frac(v)} * (100% - ${THUMB}px) + ${THUMB / 2}px)`;
  const inRange = (m: SliderMark) => m.value >= min * 0.999 && m.value <= max * 1.001;
  const rows = (r: 'above' | 'below') => marks.filter((m) => m.row === r && inRange(m));
  const sliderProps = {
    label,
    value,
    min,
    max,
    onChange,
    log,
    ...(format ? { format } : {}),
    ...(step ? { step } : {}),
  };
  return (
    <div>
      <div className="relative h-5" aria-hidden="true">
        {rows('above').map((m) => (
          <span
            key={m.label}
            className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-muted"
            style={{ left: place(m.value) }}
          >
            {m.label} ▾
          </span>
        ))}
      </div>
      <Slider {...sliderProps} />
      <div className="relative h-5" aria-hidden="true">
        {rows('below').map((m) => (
          <span
            key={m.label}
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-muted"
            style={{ left: place(m.value) }}
          >
            ▴ {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export { fromPosition };

// ---------- a status chip with an icon ----------

export function Chip({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'bad';
  children: ReactNode;
}) {
  const color =
    tone === 'good'
      ? 'var(--color-good)'
      : tone === 'warn'
        ? 'var(--color-neg)'
        : 'var(--color-bad)';
  const icon = tone === 'good' ? '✓' : tone === 'warn' ? '≈' : '✕';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-semibold"
      style={{ borderColor: color, color }}
      role="status"
    >
      <span aria-hidden="true">{icon}</span>
      <span className="text-ink">{children}</span>
    </span>
  );
}

export { Slider };
