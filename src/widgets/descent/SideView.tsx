import { useId } from 'react';
import { bowlLoss } from './bowl';
import { Label, r1 } from './charts';
import { fmtLoss } from './format';

const W = 300;
const H = 175;
const L = 40;
const R = 10;
const T = 12;
const B = 30;
const YMAX = 100;

interface PanelProps {
  title: string;
  axis: string;
  /** Knob range shown. */
  lo: number;
  hi: number;
  /** Where the dot is on this knob. */
  at: number;
  /** Loss as this knob slides, the other held still. */
  f: (v: number) => number;
  /** Slope at the dot along this knob (signed). */
  slope: number;
  /** Half-width of the slope segment, in knob units. */
  half: number;
}

function Panel({ title, axis, lo, hi, at, f, slope, half }: PanelProps) {
  const clip = `sv${useId().replace(/:/g, '')}`;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const y = (v: number) =>
    T + (1 - Math.min(YMAX * 1.5, Math.max(0, v)) / YMAX) * (H - T - B);
  let d = '';
  for (let k = 0; k <= 60; k++) {
    const v = lo + ((hi - lo) * k) / 60;
    d += `${k === 0 ? 'M' : 'L'}${r1(x(v))} ${r1(y(f(v)))}`;
  }
  const f0 = f(at);
  const ticks = [lo, (lo + hi) / 2, hi];
  const rises = slope >= 0;
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-1 text-xs font-semibold">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`${title}. The loss is ${fmtLoss(f0)} at the dot and ${
          Math.abs(slope) < 0.005
            ? 'flat'
            : `${rises ? 'rises' : 'falls'} to the right at ${fmtLoss(Math.abs(slope))} per unit`
        }.`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={L} y={T} width={W - L - R} height={H - T - B} />
          </clipPath>
        </defs>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" />
            <text
              x={L - 5}
              y={y(v) + 4}
              fontSize="11"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              {v}
            </text>
          </g>
        ))}
        {ticks.map((v, i) => (
          <text
            key={i}
            x={x(v)}
            y={H - B + 14}
            fontSize="11"
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fill="var(--color-muted)"
          >
            {Number(v.toFixed(1))}
          </text>
        ))}
        <text
          x={W - R}
          y={H - 3}
          fontSize="11"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {axis} →
        </text>
        <text x={L + 3} y={T + 9} fontSize="11" fill="var(--color-muted)">
          loss ↑
        </text>
        <g clipPath={`url(#${clip})`}>
          <path
            d={d}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <line
            x1={r1(x(at - half))}
            y1={r1(y(f0 - slope * half))}
            x2={r1(x(at + half))}
            y2={r1(y(f0 + slope * half))}
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx={r1(x(at))}
            cy={r1(y(f0))}
            r="5.5"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
        </g>
        <Label x={W - R - 2} y={T + 22} anchor="end" size={11} fill="var(--color-accent)">
          {Math.abs(slope) < 0.005
            ? 'flat here'
            : `${rises ? 'rises' : 'falls'} ${fmtLoss(Math.abs(slope))} per unit`}
        </Label>
      </svg>
    </figure>
  );
}

/**
 * Two side views of the hill through the dot: height as you slide one knob with the other
 * held still. They share one height scale, so the more sensitive knob looks steeper.
 */
export function SideView({ x, y, kappa }: { x: number; y: number; kappa: number }) {
  return (
    <div className="mt-3">
      <h4 className="m-0 text-sm font-semibold">
        Side view: the hill’s height as you slide each knob
      </h4>
      <p className="m-0 mb-2 text-xs text-muted">
        The dot stays put on the other knob. The thick blue line is the slope at the dot.
        Both panels use the same height scale.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel
          title="Slide knob 1 (knob 2 stays put)"
          axis="knob 1"
          lo={-12}
          hi={12}
          at={x}
          f={(v) => bowlLoss(v, y, kappa)}
          slope={x}
          half={1.9}
        />
        <Panel
          title="Slide knob 2 (knob 1 stays put)"
          axis="knob 2"
          lo={-5}
          hi={5}
          at={y}
          f={(v) => bowlLoss(x, v, kappa)}
          slope={kappa * y}
          half={0.8}
        />
      </div>
    </div>
  );
}
