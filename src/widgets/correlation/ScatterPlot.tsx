import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import type { Pair } from './corr';

export const VB_W = 400;
export const VB_H = 300;
const PAD = { l: 30, r: 10, t: 10, b: 30 };
/** Minimum touch target, in CSS pixels. */
const HIT_PX = 24;

export type Shape = 'circle' | 'square' | 'triangle';
export interface MarkStyle {
  /** A CSS color, normally `var(--color-…)`. */
  color: string;
  shape?: Shape;
  hollow?: boolean;
}

export interface PixelScale {
  (v: number): number;
  invert: (px: number) => number;
}
export type Scales = { sx: PixelScale; sy: PixelScale };

/**
 * Linear scale whose output is rounded to 0.01 px. Node and browsers can differ in the
 * last bits of Math.log/cos, so unrounded SVG coordinates break React hydration.
 */
export function pixelScale(
  domain: readonly [number, number],
  range: [number, number],
): PixelScale {
  const s = scaleLinear()
    .domain(domain as [number, number])
    .range(range);
  return Object.assign((v: number) => Math.round(s(v) * 100) / 100, { invert: s.invert });
}

interface Props {
  points: readonly Pair[];
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
  xLabel: string;
  yLabel: string;
  label: string;
  style?: (i: number) => MarkStyle;
  radius?: number;
  /** Drawn beneath the points (rectangles, mean lines, ...). */
  under?: (s: Scales) => ReactNode;
  /** Enables pointer and keyboard dragging; called with data coordinates. */
  onDrag?: ((i: number, x: number, y: number) => void) | undefined;
}

export function Mark({ x, y, r, s }: { x: number; y: number; r: number; s: MarkStyle }) {
  const fill = s.hollow ? 'none' : s.color;
  const common = { fill, stroke: s.color, strokeWidth: 1.5 };
  if (s.shape === 'square') {
    const h = r * 0.9;
    return <rect x={x - h} y={y - h} width={2 * h} height={2 * h} {...common} />;
  }
  if (s.shape === 'triangle') {
    const h = r * 1.15;
    return (
      <polygon
        points={`${x},${y - h} ${x + h},${y + h * 0.8} ${x - h},${y + h * 0.8}`}
        {...common}
      />
    );
  }
  return <circle cx={x} cy={y} r={r} {...common} />;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const defaultStyle = (): MarkStyle => ({ color: 'var(--color-accent)' });

/**
 * Responsive SVG scatter with a fixed aspect ratio (no layout shift on hydrate).
 * Dragging picks the nearest point within a 24 px hit area; keyboard users press
 * [ and ] to pick a point and arrow keys to move it.
 */
export function ScatterPlot({
  points,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  label,
  style = defaultStyle,
  radius = 5,
  under,
  onDrag,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [selected, setSelected] = useState(points.length - 1);
  const [focused, setFocused] = useState(false);

  const sx = pixelScale(xDomain, [PAD.l, VB_W - PAD.r]);
  const sy = pixelScale(yDomain, [VB_H - PAD.b, PAD.t]);

  const toViewBox = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = VB_W / rect.width;
    return { vx: (e.clientX - rect.left) * k, vy: (e.clientY - rect.top) * k, k };
  };

  const moveTo = (i: number, vx: number, vy: number) => {
    onDrag?.(
      i,
      clamp(sx.invert(vx), xDomain[0], xDomain[1]),
      clamp(sy.invert(vy), yDomain[0], yDomain[1]),
    );
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!onDrag) return;
    const { vx, vy, k } = toViewBox(e);
    let best = -1;
    let bestD = HIT_PX * k;
    points.forEach((p, i) => {
      const d = Math.hypot(sx(p.x) - vx, sy(p.y) - vy);
      if (d <= bestD) [best, bestD] = [i, d];
    });
    if (best < 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIdx(best);
    setSelected(best);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragIdx === null) return;
    const { vx, vy } = toViewBox(e);
    moveTo(dragIdx, vx, vy);
  };

  const endDrag = () => setDragIdx(null);

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!onDrag || points.length === 0) return;
    const n = points.length;
    if (e.key === ']' || e.key === '[') {
      e.preventDefault();
      setSelected((s) => (s + (e.key === ']' ? 1 : n - 1)) % n);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dirs[e.key];
    const p = points[selected];
    if (!d || !p) return;
    e.preventDefault();
    const step = e.shiftKey ? 30 : 8;
    moveTo(selected, sx(p.x) + d[0] * step, sy(p.y) + d[1] * step);
  };

  const sel = onDrag && focused ? points[selected] : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role={onDrag ? 'application' : 'img'}
      aria-label={
        onDrag
          ? `${label}. Drag a point, or press [ and ] to pick a point and arrow keys to move it.`
          : label
      }
      tabIndex={onDrag ? 0 : undefined}
      className="block h-auto w-full select-none"
      style={{
        aspectRatio: `${VB_W} / ${VB_H}`,
        touchAction: onDrag ? 'none' : 'auto',
        cursor: onDrag ? (dragIdx !== null ? 'grabbing' : 'grab') : 'default',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <rect
        x={PAD.l}
        y={PAD.t}
        width={VB_W - PAD.l - PAD.r}
        height={VB_H - PAD.t - PAD.b}
        fill="none"
        stroke="var(--color-grid)"
      />
      <text
        x={(PAD.l + VB_W - PAD.r) / 2}
        y={VB_H - 9}
        textAnchor="middle"
        fontSize="13"
        fill="var(--color-muted)"
      >
        {xLabel} →
      </text>
      <text
        transform={`translate(14 ${(PAD.t + VB_H - PAD.b) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize="13"
        fill="var(--color-muted)"
      >
        {yLabel} →
      </text>
      {under?.({ sx, sy })}
      {points.map((p, i) => (
        <Mark key={i} x={sx(p.x)} y={sy(p.y)} r={radius} s={style(i)} />
      ))}
      {sel && (
        <circle
          cx={sx(sel.x)}
          cy={sy(sel.y)}
          r={radius + 6}
          fill="none"
          stroke="var(--color-ink)"
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
}
