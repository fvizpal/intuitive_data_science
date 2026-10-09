import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { stackLevels, tallestStack, ticks } from './stacking';
import { MeanMark, MedianMark, ModeStar } from './Markers';

export const DP_W = 400;
const L = 14;
const R = DP_W - 14;
const HIT = 14;

export interface DotGeometry {
  /** Value to x, rounded to 0.01 so server and browser agree. */
  x: (v: number) => number;
  axisY: number;
  top: number;
  height: number;
}

export interface DotStyle {
  hollow?: boolean;
  /** CSS colour; defaults to the ink colour. */
  color?: string;
}

interface Props {
  values: readonly number[];
  domain: readonly [number, number];
  tickStep: number;
  /** viewBox height; the width is always 400. */
  height?: number;
  radius?: number;
  label: string;
  formatTick?: (v: number) => string;
  mean?: number | null;
  median?: number | null;
  modes?: readonly number[];
  /** Which dots can be dragged and nudged with the arrow keys. */
  draggable?: (index: number) => boolean;
  onMove?: (index: number, value: number) => void;
  /** Called when a drag ends or a key nudges a dot. */
  onCommit?: (index: number, value: number) => void;
  keyStep?: number;
  dotLabel?: (index: number, value: number) => string;
  dotStyle?: (index: number) => DotStyle;
  /** Drawn behind the dots. */
  under?: (g: DotGeometry) => ReactNode;
  /** Drawn in front of the dots. */
  over?: (g: DotGeometry) => ReactNode;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Dot plot on a number line: one dot per value, equal values stacked. Optional mean,
 * median and mode markers use the same shapes on every widget. Draggable dots work with
 * mouse, touch (24 px+ hit area) and the keyboard.
 */
export function DotPlot({
  values,
  domain,
  tickStep,
  height = 150,
  radius = 6,
  label,
  formatTick = (v) => String(v),
  mean,
  median,
  modes = [],
  draggable,
  onMove,
  onCommit,
  keyStep = 1,
  dotLabel,
  dotStyle,
  under,
  over,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [lo, hi] = domain;
  const axisY = height - 34;
  const top = 16;
  const x = (v: number) => r2(L + ((v - lo) / (hi - lo)) * (R - L));
  const geo: DotGeometry = { x, axisY, top, height };

  const pxPerUnit = (R - L) / (hi - lo);
  const levels = stackLevels(values, (2 * radius) / pxPerUnit);
  const tall = tallestStack(levels);
  const avail = axisY - 34 - radius;
  const step = Math.min(2 * radius * 0.95, tall > 1 ? avail / (tall - 1) : Infinity);
  const dotY = (level: number) => r2(axisY - radius - 2 - level * step);
  const binSize = (2 * radius) / pxPerUnit;

  const canDrag = (i: number) => Boolean(draggable?.(i));
  const anyDrag = values.some((_, i) => canDrag(i));

  const valueAt = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = (clientX - rect.left) * (DP_W / rect.width);
    return clamp(lo + ((vx - L) / (R - L)) * (hi - lo), lo, hi);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    onMove?.(drag, valueAt(e.clientX));
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    onCommit?.(drag, Math.round(valueAt(e.clientX)));
    setDrag(null);
  };

  const onKey = (e: KeyboardEvent, i: number, v: number) => {
    const dir =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? -1
        : e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? 1
          : 0;
    if (!dir) return;
    e.preventDefault();
    onCommit?.(i, clamp(Math.round(v) + dir * keyStep * (e.shiftKey ? 5 : 1), lo, hi));
  };

  const modeY = (m: number) => {
    const bin = Math.round(m / binSize);
    let best = 0;
    values.forEach((v, i) => {
      if (Math.round(v / binSize) === bin) best = Math.max(best, levels[i] as number);
    });
    return dotY(best) - radius - 10;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${DP_W} ${height}`}
      className="block h-auto w-full select-none"
      style={{
        aspectRatio: `${DP_W} / ${height}`,
        touchAction: anyDrag ? 'pan-y' : 'auto',
      }}
      role={anyDrag ? 'group' : 'img'}
      aria-label={label}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {under?.(geo)}
      <line x1={L} x2={R} y1={axisY} y2={axisY} stroke="var(--color-ink)" />
      {ticks(lo, hi, tickStep).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} stroke="var(--color-ink)" />
          <text
            x={x(t)}
            y={axisY + 28}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-muted)"
          >
            {formatTick(t)}
          </text>
        </g>
      ))}

      {median != null && Number.isFinite(median) && (
        <MedianMark x={x(median)} top={top} bottom={axisY} />
      )}

      {values.map((v, i) => {
        const style = dotStyle?.(i) ?? {};
        const color = style.color ?? 'var(--color-ink)';
        const cx = x(v);
        const cy = dotY(levels[i] as number);
        const live = canDrag(i);
        return (
          <g
            key={i}
            role={live ? 'slider' : undefined}
            tabIndex={live ? 0 : undefined}
            aria-label={live ? (dotLabel?.(i, v) ?? `Dot ${i + 1}`) : undefined}
            aria-valuemin={live ? lo : undefined}
            aria-valuemax={live ? hi : undefined}
            aria-valuenow={live ? Math.round(v) : undefined}
            onKeyDown={live ? (e) => onKey(e, i, v) : undefined}
            onFocus={live ? () => setFocused(i) : undefined}
            onBlur={live ? () => setFocused((f) => (f === i ? null : f)) : undefined}
            style={{ outline: 'none' }}
          >
            {live && (
              <circle
                cx={cx}
                cy={cy}
                r={HIT}
                fill="transparent"
                style={{ cursor: drag === i ? 'grabbing' : 'grab', touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  svgRef.current?.setPointerCapture(e.pointerId);
                  setDrag(i);
                }}
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={style.hollow ? 'var(--color-bg)' : color}
              stroke={color}
              strokeWidth="2"
              fillOpacity={style.hollow ? 1 : 0.85}
              pointerEvents="none"
            />
            {live && (focused === i || drag === i) && (
              <circle
                cx={cx}
                cy={cy}
                r={radius + 4}
                fill="none"
                stroke="var(--color-ink)"
                strokeDasharray="3 2"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}

      {modes.map((m) => (
        <ModeStar key={m} x={x(m)} y={modeY(m)} />
      ))}
      {mean != null && Number.isFinite(mean) && <MeanMark x={x(mean)} y={axisY + 3} />}
      {over?.(geo)}
    </svg>
  );
}
