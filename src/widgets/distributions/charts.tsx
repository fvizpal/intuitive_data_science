/** SVG pieces shared by the widgets on the distributions page. Colours come from CSS tokens. */
import type { KeyboardEvent, RefObject } from 'react';

export const W = 600;

/** Plain-number formatting. Nothing here ever prints NaN or Infinity. */
export const f0 = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : '—';
export const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '—');
export const signed1 = (v: number): string =>
  !Number.isFinite(v)
    ? '—'
    : Math.abs(v) < 0.05
      ? '0.0'
      : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;

/** Percentages: integers from 10% up, one decimal below, and "<0.1%" for tiny shares. */
export function pct(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v === 0) return '0%';
  if (v < 0.1) return '<0.1%';
  if (v > 99.9 && v < 100) return '>99.9%';
  return `${Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)}%`;
}

/** Like pct, but one decimal near both ends (2.3%, 97.7%) where the detail matters. */
export function pct1(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v < 0.1 && v > 0) return '<0.1%';
  if (v > 99.9 && v < 100) return '>99.9%';
  return v < 10 || v > 90 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

/** A tinted fill with diagonal stripes, for the parts of a picture that are "out in the tails". */
export function Hatch({
  id,
  color = 'var(--color-neg)',
}: {
  id: string;
  color?: string;
}) {
  return (
    <pattern
      id={id}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="6" height="6" fill={`color-mix(in srgb, ${color} 16%, transparent)`} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" />
    </pattern>
  );
}

interface HandleProps {
  svgRef: RefObject<SVGSVGElement | null>;
  /** Handle position in viewBox units. */
  x: number;
  y: number;
  value: number;
  min: number;
  max: number;
  step: number;
  /** viewBox x to value. */
  fromX: (vx: number) => number;
  onChange: (value: number) => void;
  label: string;
  valueText: string;
  /** Draw the handle as a square so two handles are not told apart by position alone. */
  shape?: 'circle' | 'square';
}

/** A draggable handle on an axis: pointer, touch, and arrow keys (Shift = 5 steps). */
export function Handle({
  svgRef,
  x,
  y,
  value,
  min,
  max,
  step,
  fromX,
  onChange,
  label,
  valueText,
  shape = 'circle',
}: HandleProps) {
  const fromPointer = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(fromX(((clientX - r.left) / r.width) * W));
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.shiftKey ? step * 5 : step;
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? k
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -k
          : 0;
    if (d) {
      e.preventDefault();
      onChange(value + d);
    }
  };
  return (
    <g>
      {shape === 'circle' ? (
        <circle
          cx={x}
          cy={y}
          r="10"
          fill="var(--color-ink)"
          stroke="var(--color-bg)"
          strokeWidth="2"
        />
      ) : (
        <rect
          x={x - 9}
          y={y - 9}
          width="18"
          height="18"
          fill="var(--color-ink)"
          stroke="var(--color-bg)"
          strokeWidth="2"
        />
      )}
      {/* a 52px target, well over the 24px minimum */}
      <circle
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        aria-valuetext={valueText}
        cx={x}
        cy={y}
        r="26"
        fill="transparent"
        style={{ cursor: 'ew-resize', touchAction: 'none' }}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
        }}
      />
    </g>
  );
}
