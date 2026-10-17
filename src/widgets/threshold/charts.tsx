/** Shared SVG pieces and controls for the threshold page. Colours come from CSS tokens. */
import type { KeyboardEvent, RefObject } from 'react';
import { Slider } from '../../components/ui/Slider';
import { FLAG_NOTHING, pageActions, usePage } from './store';

export const W = 600;
export const PAD = { l: 48, r: 16 };
const DOMAIN_HI = FLAG_NOTHING; // the x axis runs 0 to 101 so "flag nothing" has a place

export const xOf = (t: number, w = W, pad = PAD): number =>
  pad.l + (t / DOMAIN_HI) * (w - pad.l - pad.r);
export const tOf = (x: number, w = W, pad = PAD): number =>
  ((x - pad.l) / (w - pad.l - pad.r)) * DOMAIN_HI;

/** Good mail: grey fill. Spam: accent outline with hatching. Never colour alone. */
export const GOOD_FILL = 'color-mix(in srgb, var(--color-muted) 55%, transparent)';
export const BAND_FILL = 'color-mix(in srgb, var(--color-accent) 11%, transparent)';

export function SpamHatch({ id }: { id: string }) {
  return (
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
        fill="color-mix(in srgb, var(--color-accent) 14%, transparent)"
      />
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-accent)" strokeWidth="2.2" />
    </pattern>
  );
}

export function MailLegend() {
  return (
    <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ background: GOOD_FILL }}
        />
        Good mail
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm border border-accent"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent 0 3px, var(--color-accent) 3px 5px)',
          }}
        />
        Spam
      </li>
    </ul>
  );
}

/** Cutoff axis ticks and baseline. */
export function CutoffAxis({
  y,
  w = W,
  pad = PAD,
  label = 'cutoff (email score, higher = more spammy)',
}: {
  y: number;
  w?: number;
  pad?: typeof PAD;
  label?: string | null;
}) {
  return (
    <>
      <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--color-grid)" />
      {[0, 20, 40, 60, 80, 100].map((t) => (
        <g key={t}>
          <line
            x1={xOf(t, w, pad)}
            x2={xOf(t, w, pad)}
            y1={y}
            y2={y + 4}
            stroke="var(--color-grid)"
          />
          <text
            x={xOf(t, w, pad)}
            y={y + 22}
            fontSize="18"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      {label && (
        <text
          x={w - pad.r}
          y={y + 44}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {label}
        </text>
      )}
    </>
  );
}

interface HandleProps {
  svgRef: RefObject<SVGSVGElement | null>;
  cutoff: number;
  top: number;
  bottom: number;
  w?: number;
  pad?: typeof PAD;
  onChange: (cutoff: number) => void;
  label?: string;
}

/** A vertical cutoff line with a draggable handle (pointer, touch and arrow keys). */
export function CutoffHandle({
  svgRef,
  cutoff,
  top,
  bottom,
  w = W,
  pad = PAD,
  onChange,
  label = 'Cutoff',
}: HandleProps) {
  const cx = xOf(cutoff, w, pad);
  const fromPointer = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(tOf(((clientX - r.left) / r.width) * w, w, pad));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -step
          : e.key === 'Home'
            ? -999
            : e.key === 'End'
              ? 999
              : 0;
    if (delta) {
      e.preventDefault();
      onChange(cutoff + delta);
    }
  };
  return (
    <g>
      <line
        x1={cx}
        x2={cx}
        y1={top}
        y2={bottom}
        stroke="var(--color-ink)"
        strokeWidth="2"
      />
      <circle cx={cx} cy={top} r="11" fill="var(--color-ink)" />
      <circle
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={FLAG_NOTHING}
        aria-valuenow={Math.round(cutoff)}
        aria-valuetext={cutoffText(cutoff)}
        cx={cx}
        cy={top}
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

/** The tinted "Flagged" band to the right of the cutoff. */
export function FlaggedBand({
  cutoff,
  top,
  bottom,
  labelY,
}: {
  cutoff: number;
  top: number;
  bottom: number;
  labelY: number;
}) {
  const x0 = xOf(cutoff);
  const x1 = W - PAD.r;
  return (
    <>
      <rect
        x={x0}
        y={top}
        width={Math.max(0, x1 - x0)}
        height={bottom - top}
        fill={BAND_FILL}
      />
      {x1 - x0 >= 70 && (
        <text
          x={x1 - 6}
          y={labelY}
          textAnchor="end"
          fontSize="18"
          fontWeight="600"
          fill="var(--color-accent)"
        >
          Flagged
        </text>
      )}
    </>
  );
}

// ------------------------------------------------------------------ formatting

/** Whole percent; one decimal below 10% (trailing .0 dropped). "—" for undefined. */
export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const p = v * 100;
  if (p > 0 && p < 10) return `${Number(p.toFixed(1))}%`;
  return `${Math.round(p)}%`;
}
export const whole = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : '—';
export const two = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2);
export const count = (v: number): string =>
  Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
/** Miss units: integers, or one decimal below 10. */
export function units(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v));
}

export function cutoffText(t: number): string {
  const c = Math.round(t);
  return c >= FLAG_NOTHING
    ? 'Flag nothing'
    : c <= 0
      ? 'Flag everything'
      : `Flag emails scoring ${c} or more`;
}

// ------------------------------------------------------------------ shared controls

export function CutoffSlider({ label = 'Cutoff' }: { label?: string }) {
  const { cutoff } = usePage();
  return (
    <Slider
      label={label}
      value={cutoff}
      min={0}
      max={FLAG_NOTHING}
      step={1}
      onChange={pageActions.setCutoff}
      format={cutoffText}
    />
  );
}

export function ShareSlider() {
  const { share } = usePage();
  return (
    <Slider
      label="Share of mail that is spam"
      value={share}
      min={0.01}
      max={0.5}
      step={0.01}
      onChange={pageActions.setShare}
      format={pct}
    />
  );
}

/** One fill pattern per outcome, for table cells (never colour alone). */
export const CELL_STYLE = {
  caught: {
    backgroundImage:
      'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-accent) 22%, transparent) 0 3px, transparent 3px 7px)',
    borderColor: 'var(--color-accent)',
    borderStyle: 'solid',
  },
  missed: {
    backgroundImage: 'none',
    borderColor: 'var(--color-accent)',
    borderStyle: 'dashed',
  },
  falseAlarm: {
    backgroundImage:
      'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-neg) 24%, transparent) 0 3px, transparent 3px 7px), repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-neg) 24%, transparent) 0 3px, transparent 3px 7px)',
    borderColor: 'var(--color-neg)',
    borderStyle: 'solid',
  },
  passed: {
    backgroundImage:
      'radial-gradient(color-mix(in srgb, var(--color-muted) 45%, transparent) 1.2px, transparent 1.4px)',
    backgroundSize: '8px 8px',
    borderColor: 'var(--color-grid)',
    borderStyle: 'solid',
  },
} as const;
