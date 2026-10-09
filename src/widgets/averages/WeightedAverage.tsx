import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { BIG_BUY_DEFAULT, BIG_BUY_MAX, BIG_BUY_MIN, PURCHASES, f0 } from './data';
import { MeanMark } from './Markers';
import { ticks } from './stacking';
import { mean, weightedMean } from './stats';

const W = 400;
const H = 200;
const L = 20;
const R = W - 20;
const AXIS_Y = 120;
const LO = 0;
const HI = 200;
const r2 = (v: number) => Math.round(v * 100) / 100;
const x = (price: number) => r2(L + ((price - LO) / (HI - LO)) * (R - L));
const radius = (kg: number) => 3 + 1.5 * Math.sqrt(kg);

function Inner() {
  const [bigKg, setBigKg] = useState(BIG_BUY_DEFAULT);
  const buys = PURCHASES.map((p, i) =>
    i === PURCHASES.length - 1 ? { ...p, kg: bigKg } : p,
  );
  const prices = buys.map((b) => b.price);
  const kgs = buys.map((b) => b.kg);
  const simple = mean(prices);
  const weighted = weightedMean(prices, kgs);
  const totalKg = kgs.reduce((a, b) => a + b, 0);
  const totalPaid = buys.reduce((a, b) => a + b.price * b.kg, 0);
  const diff = simple - weighted;
  const summary = `Simple average price ₹${f0(simple)} per kg. What you actually paid: ₹${f0(weighted)} per kg (₹${f0(totalPaid)} for ${f0(totalKg)} kg).`;

  return (
    <>
      <Slider
        label="How many kg of bananas did you buy?"
        value={bigKg}
        min={BIG_BUY_MIN}
        max={BIG_BUY_MAX}
        step={1}
        format={f0}
        onChange={(v) => setBigKg(Math.round(v))}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Price per kg of six fruits as bubbles, sized by kilos bought. ${summary}`}
      >
        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-ink)" />
        {ticks(LO, HI, 50).map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={AXIS_Y}
              y2={AXIS_Y + 4}
              stroke="var(--color-ink)"
            />
            <text
              x={x(t)}
              y={AXIS_Y + 30}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-muted)"
            >
              ₹{t}
            </text>
          </g>
        ))}
        {buys.map((b, i) => {
          const r = radius(b.kg);
          const isBig = i === buys.length - 1;
          return (
            <g key={b.name}>
              <circle
                cx={x(b.price)}
                cy={r2(AXIS_Y - 2 - r)}
                r={r2(r)}
                fill={isBig ? 'var(--color-accent)' : 'var(--color-ink)'}
                fillOpacity={isBig ? 0.35 : 0.2}
                stroke={isBig ? 'var(--color-accent)' : 'var(--color-ink)'}
                strokeWidth="2"
              />
              <text
                x={x(b.price)}
                y={r2(AXIS_Y - 2 - 2 * r - 4)}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-muted)"
              >
                {b.kg} kg
              </text>
            </g>
          );
        })}
        <MeanMark x={x(simple)} y={AXIS_Y + 4} hollow />
        <MeanMark x={x(weighted)} y={AXIS_Y + 4} />
        <text
          x={Math.min(x(simple), R - 40)}
          y={AXIS_Y + 56}
          textAnchor="middle"
          fontSize="11"
          fill="var(--color-ink)"
        >
          △ simple ₹{f0(simple)}
        </text>
        <text
          x={Math.max(x(weighted), L + 50)}
          y={AXIS_Y + 56}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="var(--color-accent)"
        >
          ▲ weighted ₹{f0(weighted)}
        </text>
      </svg>
      <p className="m-0 text-xs text-muted">
        Each bubble is one fruit: its price per kg across, the kilos you bought as the
        size of the bubble.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric
          label="△ Simple average"
          value={`₹${f0(simple)} /kg`}
          hint="each fruit counts once"
        />
        <Metric
          label="▲ Actually paid"
          value={`₹${f0(weighted)} /kg`}
          tone="accent"
          hint="more kilos, more say"
        />
      </div>

      <ul className="m-0 mt-3 list-none space-y-1 p-0 text-sm">
        {buys.map((b, i) => {
          const isBig = i === buys.length - 1;
          return (
            <li key={b.name} className="grid grid-cols-[9.5rem_1fr] items-center gap-2">
              <span className={isBig ? 'font-semibold' : ''}>
                {b.kg} kg {b.name.toLowerCase()} at ₹{b.price}
              </span>
              <span className="block h-3 rounded-sm bg-bg">
                <span
                  className="block h-full rounded-sm transition-[width] duration-200"
                  style={{
                    width: `${(b.kg / BIG_BUY_MAX) * 100}%`,
                    background: isBig ? 'var(--color-accent)' : 'var(--color-muted)',
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        You paid ₹{f0(totalPaid)} for {f0(totalKg)} kg: ₹{f0(weighted)} per kg, which is
        closer to the bananas because you bought so many. The simple average of the prices
        (₹{f0(simple)}) {diff > 0 ? 'overstates it' : 'is about the same'}.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setBigKg(BIG_BUY_DEFAULT)}>Reset</Button>
      </div>
      <p role="status" className="sr-only">
        {summary}
      </p>
    </>
  );
}

export function WeightedAverage() {
  return (
    <ClientOnly
      minHeight={780}
      label="Weighted average: the simple average price against what you actually paid per kilo"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
