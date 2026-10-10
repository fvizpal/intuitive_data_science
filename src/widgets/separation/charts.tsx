/** SVG pieces shared by the widgets on the KS / AUC / Gini page. Colors come from CSS tokens. */
import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { SCORE_HI, SCORE_LO, separationReading } from './model';
import { pageActions, usePage } from './store';

export const W = 600;
export const PAD = { l: 16, r: 16 };

export const scoreToX = (s: number): number =>
  PAD.l + ((s - SCORE_LO) / (SCORE_HI - SCORE_LO)) * (W - PAD.l - PAD.r);
export const xToScore = (x: number): number =>
  SCORE_LO + ((x - PAD.l) / (W - PAD.l - PAD.r)) * (SCORE_HI - SCORE_LO);

/** Goods: solid teal-grey. Bads: coral with diagonal stripes. Never colour alone. */
export const GOOD_FILL = 'color-mix(in srgb, var(--color-pos) 55%, var(--color-muted))';

export function BadHatch({ id }: { id: string }) {
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
        fill="color-mix(in srgb, var(--color-neg) 18%, transparent)"
      />
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-neg)" strokeWidth="2.5" />
    </pattern>
  );
}

export function Legend({ goods = 'Goods (repaid)', bads = 'Bads (defaulted)' }) {
  return (
    <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ background: GOOD_FILL }}
        />
        {goods}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-5 rounded-sm border border-neg"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent 0 3px, var(--color-neg) 3px 5px)',
          }}
        />
        {bads}
      </li>
    </ul>
  );
}

/** Score-axis ticks and baseline. */
export function ScoreAxis({ y, label = true }: { y: number; label?: boolean }) {
  return (
    <>
      <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--color-grid)" />
      {[400, 500, 600, 700, 800].map((t) => (
        <g key={t}>
          <line
            x1={scoreToX(t)}
            x2={scoreToX(t)}
            y1={y}
            y2={y + 4}
            stroke="var(--color-grid)"
          />
          <text
            x={scoreToX(t)}
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
          x={W - PAD.r}
          y={y + 44}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          score (higher = safer)
        </text>
      )}
    </>
  );
}

interface CutoffLineProps {
  svgRef: RefObject<SVGSVGElement | null>;
  cut: number;
  top: number;
  bottom: number;
  onChange: (cutoff: number) => void;
  label?: string;
}

/** A vertical cutoff with a draggable handle (pointer, touch and arrow keys). */
export function CutoffLine({
  svgRef,
  cut,
  top,
  bottom,
  onChange,
  label,
}: CutoffLineProps) {
  const cx = scoreToX(Math.min(SCORE_HI, Math.max(SCORE_LO, cut)));
  const fromPointer = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(xToScore(((clientX - r.left) / r.width) * W));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -step
          : 0;
    if (delta) {
      e.preventDefault();
      onChange(cut + delta);
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
        aria-label={label ?? 'Cutoff score'}
        aria-valuemin={SCORE_LO}
        aria-valuemax={SCORE_HI}
        aria-valuenow={Math.round(cut)}
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

interface HistProps {
  /** Bar heights, 0 to 1 of `max`. */
  goods: readonly number[];
  bads: readonly number[];
  max: number;
  height: number;
  ariaLabel: string;
  cut?: number | undefined;
  onCut?: ((cutoff: number) => void) | undefined;
  /** Shade the rejected side (below the cutoff). */
  shade?: boolean;
  axis?: boolean;
  children?: ReactNode;
}

/** Overlaid histograms of the two crowds over the fixed score axis. */
export function CrowdHistogram({
  goods,
  bads,
  max,
  height,
  ariaLabel,
  cut,
  onCut,
  shade = false,
  axis = true,
  children,
}: HistProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hatch = useId();
  const top = 14;
  const base = height - (axis ? 48 : 6);
  const n = goods.length;
  const barW = (W - PAD.l - PAD.r) / n;
  const y = (v: number) => base - (v / Math.max(max, 1e-9)) * (base - top - 10);
  const cx = cut === undefined ? null : scoreToX(cut);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${height}`}
      className="block w-full select-none"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <BadHatch id={hatch} />
      </defs>
      {shade && cx !== null && (
        <rect
          x={PAD.l}
          y={top}
          width={Math.max(0, cx - PAD.l)}
          height={base - top}
          fill="var(--color-muted)"
          opacity="0.12"
        />
      )}
      {goods.map((v, i) => (
        <rect
          key={`g${i}`}
          x={PAD.l + i * barW + 0.5}
          y={y(v)}
          width={Math.max(0, barW - 1)}
          height={Math.max(0, base - y(v))}
          fill={GOOD_FILL}
          opacity="0.75"
        />
      ))}
      {bads.map((v, i) => (
        <rect
          key={`b${i}`}
          x={PAD.l + i * barW + 0.5}
          y={y(v)}
          width={Math.max(0, barW - 1)}
          height={Math.max(0, base - y(v))}
          fill={`url(#${hatch})`}
          stroke="var(--color-neg)"
          strokeWidth="1"
        />
      ))}
      {axis ? (
        <ScoreAxis y={base} />
      ) : (
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="var(--color-grid)" />
      )}
      {children}
      {cut !== undefined && onCut && (
        <CutoffLine svgRef={svgRef} cut={cut} top={top} bottom={base} onChange={onCut} />
      )}
    </svg>
  );
}

/** The separation knob, bound to the page store, with its plain reading and presets. */
export function SeparationControl({ compact = false }: { compact?: boolean }) {
  const { separation } = usePage();
  const presets = [
    { label: 'Coin flip', value: 0 },
    { label: 'Typical', value: 1 },
    { label: 'Strong', value: 2 },
  ];
  return (
    <div>
      <Slider
        label="How different are goods and bads"
        value={separation}
        min={0}
        max={3}
        step={0.1}
        onChange={pageActions.setSeparation}
        format={(v) => v.toFixed(1)}
      />
      <p className="m-0 mt-1 text-sm font-semibold" role="status">
        {separationReading(separation)}
      </p>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              aria-pressed={separation === p.value}
              variant={separation === p.value ? 'primary' : 'secondary'}
              onClick={() => pageActions.setSeparation(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export const pct = (v: number): string =>
  Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—';
export const two = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2);
export const whole = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : '—';
