/** SVG and text pieces shared by the widgets on the regularization page. Colours come from CSS tokens. */
import type { ReactNode } from 'react';
import { Reading, Skeleton, fmtErr, sentence } from '../biasvar/charts';
import { LegendItem, niceTicks } from '../sampling/charts';

export { Reading, Skeleton, fmtErr, sentence, LegendItem, niceTicks };

export const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Penalty strength with 3 significant digits; 1000 or more reads "1000+". */
export function fmtLam(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return '1000+';
  const s = Number(v.toPrecision(3));
  if (Math.abs(s) < 1e-3)
    return String(
      Number(s.toFixed(Math.min(12, 2 - Math.floor(Math.log10(Math.abs(s)))))),
    );
  return String(s);
}

/** A coefficient with 2 decimals. */
export function fmtCoef(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return '1000+';
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

export const pct0 = (p: number): string => `${Math.round(p * 100)}%`;

// ---------- a chart whose x axis is the penalty-strength grid ----------

export interface PenaltyFrame {
  W: number;
  H: number;
  L: number;
  R: number;
  T: number;
  B: number;
  count: number;
  x: (i: number) => number;
  /** x of a (possibly fractional) grid position. */
  pw: number;
  ph: number;
}

export function penaltyFrame(
  count: number,
  size: { W?: number; H?: number; L?: number; R?: number; T?: number; B?: number } = {},
): PenaltyFrame {
  const { W = 600, H = 330, L = 46, R = 14, T = 30, B = 48 } = size;
  const pw = W - L - R;
  const ph = H - T - B;
  return {
    W,
    H,
    L,
    R,
    T,
    B,
    count,
    pw,
    ph,
    x: (i) => L + (Math.max(0, Math.min(count - 1, i)) / Math.max(1, count - 1)) * pw,
  };
}

/** Tick positions (fractional grid index) and labels for a grid with 0 first, then log-spaced values. */
export function penaltyTicks(lambdas: number[]): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = [{ i: 0, label: 'No penalty' }];
  if (lambdas.length < 3) return out;
  const lo = lambdas[1]!;
  const hi = lambdas[lambdas.length - 1]!;
  if (!(lo > 0 && hi > lo)) return out;
  const span = Math.log(hi / lo);
  const at = (v: number) =>
    1 + ((Math.log(v) - Math.log(lo)) / span) * (lambdas.length - 2);
  const cands: number[] = [];
  const k0 = Math.floor(Math.log10(lo));
  const k1 = Math.ceil(Math.log10(hi));
  for (let k = k0; k <= k1; k++) cands.push(10 ** k);
  let use = cands.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
  if (use.length < 3) {
    use = [];
    for (let k = k0; k <= k1; k++)
      for (const m of [1, 3]) {
        const v = m * 10 ** k;
        if (v >= lo * 0.999 && v <= hi * 1.001) use.push(v);
      }
  }
  while (use.length > 5) use = use.filter((_, j) => j % 2 === 0);
  for (const v of use) {
    const i = at(v);
    if (i > 3) out.push({ i, label: fmtLam(v) });
  }
  return out;
}

export function PenaltyXAxis({
  f,
  ticks,
  label = 'penalty strength',
}: {
  f: PenaltyFrame;
  ticks: { i: number; label: string }[];
  label?: string;
}) {
  const y = f.T + f.ph;
  return (
    <g>
      <line x1={f.L} x2={f.W - f.R} y1={y} y2={y} stroke="var(--color-grid)" />
      {ticks.map((t, k) => (
        <g key={k}>
          <line
            x1={f.x(t.i)}
            x2={f.x(t.i)}
            y1={y}
            y2={y + 4}
            stroke="var(--color-muted)"
          />
          <text
            x={f.x(t.i)}
            y={y + 19}
            fontSize="14"
            textAnchor={t.i === 0 ? 'start' : 'middle'}
            fill="var(--color-muted)"
          >
            {t.label}
          </text>
        </g>
      ))}
      <text
        x={f.W - f.R}
        y={f.H - 4}
        fontSize="14"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        {label} (log scale) →
      </text>
    </g>
  );
}

/** Text with a halo so it stays readable over lines. */
export function Label({
  x,
  y,
  children,
  anchor = 'start',
  size = 14,
  fill = 'var(--color-ink)',
  weight,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  fill?: string;
  weight?: number | string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      fill={fill}
      stroke="var(--color-surface)"
      strokeWidth="4"
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

// ---------- legend swatches ----------

export const SwTrain = (
  <g>
    <line x1="1" x2="17" y1="8" y2="8" stroke="var(--color-ink)" strokeWidth="2.4" />
    <circle cx="9" cy="8" r="3.8" fill="var(--color-ink)" />
  </g>
);
export const SwExact = (
  <g>
    <line
      x1="1"
      x2="17"
      y1="8"
      y2="8"
      stroke="var(--color-accent)"
      strokeWidth="2.6"
      strokeDasharray="4 3"
    />
    <rect
      x="5"
      y="4"
      width="8"
      height="8"
      fill="var(--color-surface)"
      stroke="var(--color-accent)"
      strokeWidth="2"
    />
  </g>
);
export const SwFloor = (
  <line
    x1="1"
    x2="17"
    y1="8"
    y2="8"
    stroke="var(--color-ink)"
    strokeWidth="1.6"
    strokeDasharray="2 4"
  />
);
export const SwSweet = (
  <polygon
    points="9,1 16,8 9,15 2,8"
    fill="var(--color-surface)"
    stroke="var(--color-good)"
    strokeWidth="2"
  />
);
export const SwMarker = (
  <g>
    <line x1="9" x2="9" y1="1" y2="15" stroke="var(--color-ink)" strokeWidth="1.6" />
    <polygon points="9,15 5,10 13,10" fill="var(--color-ink)" />
  </g>
);

export function LegendRow({ items }: { items: [ReactNode, string][] }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {items.map(([shape, label]) => (
        <LegendItem key={label} shape={shape}>
          {label}
        </LegendItem>
      ))}
    </ul>
  );
}

/** Small clipped-value arrow with its label. */
export function ClipArrow({
  x,
  y,
  label,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  label?: string | undefined;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <g>
      <polygon
        points={`${r1(x)},${r1(y)} ${r1(x + 6)},${r1(y + 11)} ${r1(x - 6)},${r1(y + 11)}`}
        fill="var(--color-neg)"
        stroke="var(--color-surface)"
        strokeWidth="1"
      />
      {label && (
        <Label x={x} y={y + 26} anchor={anchor} size={13} fill="var(--color-neg)">
          {label}
        </Label>
      )}
    </g>
  );
}

/** A card with a label, a big value and a plain reading. */
export function Card({
  label,
  value,
  plain,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  plain?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      {children}
      {plain && <div className="text-xs leading-tight text-muted">{plain}</div>}
    </div>
  );
}

export function TryThis({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 text-sm">
      <span className="font-semibold">Try this: </span>
      {children}
    </p>
  );
}

/** An error (RMSE) with a bar, a dashed noise-floor tick and a hollow "no penalty" marker. */
export function WideErrorCard({
  label,
  value,
  base,
  floor,
  gaugeMax = 5,
  plain,
}: {
  label: ReactNode;
  value: number;
  /** Error with no penalty, shown as a hollow marker. */
  base: number;
  floor: number;
  gaugeMax?: number;
  plain: ReactNode;
}) {
  const w = 200;
  const x = (v: number) => (Math.min(Math.max(v, 0), gaugeMax) / gaugeMax) * w;
  const clipped = !(value <= gaugeMax);
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{fmtErr(value)}</div>
      <svg
        viewBox={`0 0 ${w} 34`}
        className="mt-1 block h-auto w-full"
        aria-hidden="true"
      >
        <rect x="0" y="14" width={w} height="10" fill="var(--color-grid)" opacity="0.5" />
        <rect
          x="0"
          y="14"
          width={Math.max(1, x(value))}
          height="10"
          fill="var(--color-accent)"
        />
        {clipped && (
          <polygon points={`${w},19 ${w - 8},14 ${w - 8},24`} fill="var(--color-neg)" />
        )}
        <line
          x1={x(floor)}
          x2={x(floor)}
          y1="10"
          y2="28"
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeDasharray="3 2"
        />
        <text x={x(floor) + 3} y="9" fontSize="9" fill="var(--color-ink)">
          Noise floor {floor.toFixed(1)}
        </text>
        <rect
          x={x(base) - 4}
          y="15"
          width="8"
          height="8"
          transform={`rotate(45 ${x(base)} 19)`}
          fill="var(--color-surface)"
          stroke="var(--color-ink)"
          strokeWidth="1.6"
        />
        <text
          x={Math.min(x(base) + 8, w - 52)}
          y="33"
          fontSize="9"
          fill="var(--color-muted)"
        >
          ◇ No penalty {fmtErr(base)}
        </text>
      </svg>
      <div className="text-xs leading-tight text-muted">{plain}</div>
    </div>
  );
}
