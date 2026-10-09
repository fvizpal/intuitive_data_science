import { useId } from 'react';
import type { KeyboardEvent } from 'react';
import { READING_TEXT, binLabel, signed, woeReading } from './features';
import type { FeatureMeta } from './features';
import type { BinStat } from './woe';

interface Props {
  bins: readonly BinStat[];
  edges: readonly number[];
  meta: FeatureMeta;
  selected?: number;
  onSelect?: (index: number) => void;
  /** Bin indexes that break the size rule; drawn with a dashed outline and a warning mark. */
  flagged?: ReadonlySet<number>;
  label: string;
}

const W = 400;
const H = 220;
const PAD = { t: 30, b: 40, l: 6, r: 6 };

/**
 * Diverging WoE bars: teal up (safer, "+"), coral down and hatched (riskier, "−").
 * Empty bins are skipped. Colour is always paired with a sign, a glyph and a label.
 */
export function WoeBars({
  bins,
  edges,
  meta,
  selected,
  onSelect,
  flagged,
  label,
}: Props) {
  const hatch = useId().replace(/:/g, '');
  const shown = bins.filter((b) => b.count > 0);
  const maxAbs = Math.max(
    1,
    Math.ceil(Math.max(0, ...shown.map((b) => Math.abs(b.woe))) * 2) / 2,
  );
  const plotH = H - PAD.t - PAD.b;
  const zeroY = PAD.t + plotH / 2;
  const scale = plotH / 2 / maxAbs;
  const slot = (W - PAD.l - PAD.r) / Math.max(1, shown.length);
  const tilt = shown.length > 6;

  const onKey = (e: KeyboardEvent, i: number) => {
    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect(i);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="group"
      aria-label={label}
    >
      <defs>
        <pattern
          id={hatch}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="var(--color-neg)" fillOpacity="0.28" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-neg)" strokeWidth="2.5" />
        </pattern>
      </defs>
      <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} stroke="var(--color-ink)" />
      <text x={W - PAD.r} y={10} textAnchor="end" fontSize="10" fill="var(--color-muted)">
        ▲ safer · WoE 0 = average · ▼ riskier
      </text>
      {shown.map((b, i) => {
        const r = woeReading(b.woe);
        const x0 = PAD.l + i * slot;
        const bw = Math.min(46, slot * 0.62);
        const bx = x0 + (slot - bw) / 2;
        const h = Math.abs(b.woe) * scale;
        const up = b.woe >= 0;
        const on = b.index === selected;
        const warn = flagged?.has(b.index);
        const lab = binLabel(meta, edges, b.index);
        return (
          <g
            key={b.index}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? on : undefined}
            aria-label={`${lab}: WoE ${signed(b.woe)}, ${READING_TEXT[r].toLowerCase()}${warn ? ', too few defaulters, noisy' : ''}`}
            onClick={onSelect ? () => onSelect(b.index) : undefined}
            onKeyDown={onSelect ? (e) => onKey(e, b.index) : undefined}
            style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
          >
            <rect
              x={x0 + 1}
              y={PAD.t - 2}
              width={slot - 2}
              height={plotH + PAD.b - 2}
              rx="4"
              fill={on ? 'var(--color-ink)' : 'transparent'}
              fillOpacity="0.07"
              stroke={warn ? 'var(--color-neg)' : on ? 'var(--color-ink)' : 'none'}
              strokeWidth={warn ? 1.5 : 1}
              strokeDasharray={warn ? '4 3' : undefined}
              strokeOpacity={on || warn ? 0.8 : 0}
            />
            <rect
              x={bx}
              y={up ? zeroY - h : zeroY}
              width={bw}
              height={Math.max(h, 1)}
              fill={up ? 'var(--color-pos)' : `url(#${hatch})`}
              stroke={up ? 'none' : 'var(--color-neg)'}
              strokeWidth="1.5"
            />
            <text
              x={x0 + slot / 2}
              y={up ? zeroY - h - 4 : zeroY + h + 13}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="var(--color-ink)"
            >
              {signed(b.woe)}
            </text>
            {warn && (
              <text
                x={x0 + slot / 2}
                y={PAD.t + 9}
                textAnchor="middle"
                fontSize="12"
                fill="var(--color-neg)"
              >
                ⚠
              </text>
            )}
            <text
              x={x0 + slot / 2}
              y={H - 22}
              textAnchor={tilt ? 'end' : 'middle'}
              fontSize={tilt ? 10 : 11}
              fill="var(--color-ink)"
              transform={tilt ? `rotate(-30 ${x0 + slot / 2} ${H - 22})` : undefined}
            >
              {lab}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
