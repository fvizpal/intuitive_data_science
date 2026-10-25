import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Toggle } from '../../components/ui/Toggle';
import { Dot, type DotShape } from '../validation/charts';
import { Label, LegendRow, Reading, r1 } from './charts';
import { DELIVERY_N, fitDelivery, makeDelivery } from './units';

const DEFAULT_SEED = 4;

interface Row {
  key: 'km' | 'm' | 'items';
  name: string;
  /** Short unit text for the weight, e.g. "per km". */
  per: string;
  shape: DotShape;
  values: number[];
  mean: number;
  sd: number;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const sdOf = (v: number[], m: number) =>
  Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length || 1));
const grouped = (v: number) => Math.round(v).toLocaleString('en-US');
/** A spread or range value: 1 decimal below 100, whole numbers (with commas) above. */
const num = (v: number) => (Math.abs(v) >= 100 ? grouped(v) : v.toFixed(1));
/** A penalty cost: "about 0" when tiny. */
const cost = (v: number) =>
  v < 0.005 ? 'about 0' : v >= 100 ? grouped(v) : v.toFixed(2);
/** A weight: 2 decimals, or 2 significant digits when it is under 0.01 (0.0025 per metre). */
const weightText = (w: number) =>
  Math.abs(w) < 0.01 ? String(Number(w.toPrecision(2))) : w.toFixed(2);

// ---------- part 1: the features on number lines ----------

const W = 600;
const L = 150;
const R = 16;
const PW = W - L - R;
const ROW_H = 58;
const TOP = 10;
const AXIS_Y = TOP + 3 * ROW_H + 6;
const H = AXIS_Y + 44;
const BEFORE_MAX = 20;
const xBefore = (v: number) =>
  L + (Math.min(Math.max(v, 0), BEFORE_MAX) / BEFORE_MAX) * PW;
const xAfter = (z: number) => L + ((Math.min(Math.max(z, -3), 3) + 3) / 6) * PW;

function Strips({ rows, std }: { rows: Row[]; std: boolean }) {
  const x = (row: Row, v: number) => (std ? xAfter((v - row.mean) / row.sd) : xBefore(v));
  const ticks = std ? [-2, -1, 0, 1, 2] : [0, 5, 10, 15, 20];
  const tx = (t: number) => (std ? xAfter(t) : xBefore(t));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={
        std
          ? 'Three features after standardizing: every row is centred on 0 with the same spread.'
          : 'Three features as measured: distance in km, items, and distance in metres, whose values run off the chart.'
      }
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={tx(t)}
            x2={tx(t)}
            y1={TOP}
            y2={AXIS_Y}
            stroke="var(--color-grid)"
            strokeWidth={std && t === 0 ? 1.8 : 1}
          />
          <text
            x={tx(t)}
            y={AXIS_Y + 18}
            fontSize="14"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text x={W - R} y={H - 6} fontSize="14" textAnchor="end" fill="var(--color-muted)">
        {std ? 'spreads away from the average →' : 'value as measured →'}
      </text>
      {rows.map((row, ri) => {
        const cy = TOP + ri * ROW_H + ROW_H / 2;
        const off = !std && row.key === 'm';
        const bandLo = std ? -1 : row.mean - row.sd;
        const bandHi = std ? 1 : row.mean + row.sd;
        const bx0 = std ? xAfter(bandLo) : xBefore(bandLo);
        const bx1 = std ? xAfter(bandHi) : xBefore(bandHi);
        const bandVisible = std || bandLo < BEFORE_MAX;
        return (
          <g key={row.key}>
            <line
              x1={L}
              x2={W - R}
              y1={cy + 24}
              y2={cy + 24}
              stroke="var(--color-grid)"
              opacity="0.6"
            />
            {bandVisible && (
              <rect
                x={r1(bx0)}
                y={cy - 21}
                width={r1(Math.max(2, bx1 - bx0))}
                height="42"
                fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
                stroke="var(--color-accent)"
                strokeWidth="1.4"
                strokeDasharray="4 3"
              />
            )}
            {row.values.map((v, i) => (
              <Dot
                key={i}
                shape={row.shape}
                x={x(row, v)}
                y={cy + (((i * 7) % 5) - 2) * 6}
                r={3}
              />
            ))}
            {off && (
              <g>
                <polygon
                  points={`${W - R},${cy - 6} ${W - R - 11},${cy - 12} ${W - R - 11},${cy}`}
                  fill="var(--color-neg)"
                />
                <Label
                  x={W - R - 16}
                  y={cy - 20}
                  anchor="end"
                  size={13}
                  fill="var(--color-neg)"
                >
                  off the chart: {grouped(Math.min(...row.values))} to{' '}
                  {grouped(Math.max(...row.values))}
                </Label>
              </g>
            )}
            <text
              x={L - 10}
              y={cy - 2}
              fontSize="14"
              fontWeight="600"
              textAnchor="end"
              fill="var(--color-ink)"
            >
              {row.name}
            </text>
            <text
              x={L - 10}
              y={cy + 16}
              fontSize="13"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              {std ? 'spread 1.0' : `spread ${num(row.sd)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- part 2: what the penalty charges ----------

function Bars({ rows, std, weights }: { rows: Row[]; std: boolean; weights: number[] }) {
  const costs = weights.map((w) => w * w);
  const max = Math.max(...costs, 1e-9);
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {rows.map((row, i) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <svg width="14" height="14" aria-hidden="true" className="shrink-0">
                <Dot shape={row.shape} x={7} y={7} r={4.5} />
              </svg>
              {row.name}
            </span>
            <span className="font-mono tabular-nums">{cost(costs[i]!)}</span>
          </div>
          <div className="mt-1 h-4 w-full rounded-sm bg-grid/50">
            <div
              className="h-4 rounded-sm bg-accent"
              style={{ width: `${Math.max(0.6, (costs[i]! / max) * 100)}%` }}
            />
          </div>
          <div className="mt-0.5 text-xs text-muted">
            weight it needs: {weightText(weights[i]!)} {std ? 'per spread' : row.per}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Inner() {
  const [std, setStd] = useState(false);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const m = useMemo(() => {
    const d = makeDelivery(seed, DELIVERY_N);
    const km = Array.from(d.km);
    const metres = km.map((v) => v * 1000);
    const items = Array.from(d.items);
    const mk = (
      key: Row['key'],
      name: string,
      per: string,
      shape: DotShape,
      values: number[],
    ): Row => {
      const mu = mean(values);
      return { key, name, per, shape, values, mean: mu, sd: sdOf(values, mu) };
    };
    const rows: Row[] = [
      mk('km', 'Distance in km', 'per km', 'hollow-circle', km),
      mk('items', 'Items', 'per item', 'triangle', items),
      mk('m', 'Distance in metres', 'per metre', 'filled-square', metres),
    ];
    // The weights a fit with no penalty needs, in each unit, then per spread.
    const ls = fitDelivery(d, { unit: 'km', standardize: false, lambda: 0 }, null);
    const raw = [ls.perKm, ls.perItem, ls.perKm / 1000];
    const perSpread = [
      ls.perKm * rows[0]!.sd,
      ls.perItem * rows[1]!.sd,
      ls.perKm * rows[0]!.sd,
    ];
    return { rows, raw, perSpread };
  }, [seed]);

  const [rKm, rItems, rM] = m.rows as [Row, Row, Row];
  const weights = std ? m.perSpread : m.raw;
  const costs = weights.map((w) => w * w);

  const readA = std
    ? 'Standardized: every feature now has average 0 and spread 1. Distance in km and in metres became the same numbers, and items sits beside them.'
    : `Not standardized: distance runs from ${num(Math.min(...rKm.values))} to ${num(Math.max(...rKm.values))} km (spread ${num(rKm.sd)}), items from ${num(Math.min(...rItems.values))} to ${num(Math.max(...rItems.values))} (spread ${num(rItems.sd)}), and the same distance in metres runs to ${grouped(Math.max(...rM.values))} (spread ${grouped(rM.sd)}). The numbers differ hugely in size.`;
  const readC = std
    ? `Now km and metres pay the same (${cost(costs[0]!)}). Items pays ${cost(costs[1]!)}. Each feature is charged for how much it matters, not for its unit.`
    : `Same feature, different unit: km pays ${cost(costs[0]!)}, metres pays ${cost(costs[2]!)}. Only the unit changed. The penalty will squeeze the km weight and barely touch the metres weight.`;
  const summary = `${std ? 'Standardized' : 'Not standardized'}. Penalty cost: distance in km ${cost(costs[0]!)}, items ${cost(costs[1]!)}, distance in metres ${cost(costs[2]!)}.`;

  const legend: [ReactNode, string][] = [
    ...m.rows.map(
      (r) =>
        [<Dot key={r.key} shape={r.shape} x={9} y={8} r={4.5} />, r.name] as [
          ReactNode,
          string,
        ],
    ),
    [
      <rect
        key="band"
        x="1"
        y="3"
        width="16"
        height="10"
        fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
        stroke="var(--color-accent)"
        strokeDasharray="3 2"
      />,
      'Average ± one spread',
    ],
  ];

  return (
    <>
      <Toggle label="Standardize features" checked={std} onChange={setStd} />

      <h4 className="mb-1 mt-3 text-sm font-semibold">1. The features</h4>
      <p className="m-0 mb-1 text-xs text-muted">
        60 orders. Each shape is one order. The shaded band is the average, give or take
        one spread.
      </p>
      <Strips rows={m.rows} std={std} />
      <LegendRow items={legend} />
      <Reading>{readA}</Reading>

      <h4 className="mb-1 mt-6 text-sm font-semibold">
        2. What the penalty charges each feature
      </h4>
      <p className="m-0 mb-2 text-xs text-muted">
        The penalty charges the square of a feature&rsquo;s weight. These are the weights
        a fit with no penalty needs, and what each costs. Longer bar, bigger charge.
      </p>
      <Bars rows={m.rows} std={std} weights={weights} />
      <Reading>{readC}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setSeed((s) => s + 1000)}>New data</Button>
        <Button
          onClick={() => {
            setStd(false);
            setSeed(DEFAULT_SEED);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function UnitsMatter() {
  return (
    <ClientOnly
      minHeight={1050}
      minHeightWide={960}
      label="Units matter: what standardizing does to the features and to the penalty each one pays"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
