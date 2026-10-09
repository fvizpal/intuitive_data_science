import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import {
  DOT_LIMIT,
  DOT_MAX,
  DOT_MIN,
  DOT_SEED,
  f1,
  listNumbers,
  startingDots,
} from './data';
import { DotPlot } from './DotPlot';
import { stackLevels, tallestStack, ticks } from './stacking';
import { MEAN_COLOR, MarkerLegend } from './Markers';
import { mean, median, modes } from './stats';

const W = 400;
const L = 14;
const R = W - 14;
const TILT_PER_UNIT = 3;
const TILT_MAX = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const px = (v: number) => r2(L + ((v - DOT_MIN) / (DOT_MAX - DOT_MIN)) * (R - L));

/** The number line as a plank on a pivot. The dots are weights; the plank tilts if the pivot is off the mean. */
function Seesaw({ dots, pivot }: { dots: readonly number[]; pivot: number }) {
  const n = dots.length;
  const sum = dots.reduce((s, v) => s + (v - pivot), 0);
  const tilt = n ? clamp((sum / n) * TILT_PER_UNIT, -TILT_MAX, TILT_MAX) : 0;
  const plankY = 92;
  const r = 4;
  const levels = stackLevels(dots, (2 * r) / ((R - L) / (DOT_MAX - DOT_MIN)));
  const tall = tallestStack(levels);
  const step = Math.min(2 * r * 0.95, tall > 1 ? 60 / (tall - 1) : Infinity);
  const xp = px(pivot);
  return (
    <svg
      viewBox={`0 0 ${W} 152`}
      className="block h-auto w-full"
      style={{ aspectRatio: `${W} / 152` }}
      role="img"
      aria-label={`Seesaw: the number line as a plank balanced on a pivot at ${f1(pivot)}. Tilt ${f1(tilt)} degrees.`}
    >
      <g
        style={{ transition: 'transform 200ms ease-out' }}
        transform={`rotate(${r2(tilt)} ${xp} ${plankY})`}
      >
        <rect
          x={L}
          y={plankY}
          width={R - L}
          height="7"
          rx="2"
          fill="var(--color-muted)"
          fillOpacity="0.7"
        />
        {ticks(DOT_MIN, DOT_MAX, 5).map((t) => (
          <line
            key={t}
            x1={px(t)}
            x2={px(t)}
            y1={plankY}
            y2={plankY + 7}
            stroke="var(--color-bg)"
            strokeWidth="1.5"
          />
        ))}
        {dots.map((v, i) => (
          <circle
            key={i}
            cx={px(v)}
            cy={r2(plankY - r - 1 - (levels[i] as number) * step)}
            r={r}
            fill="var(--color-ink)"
            fillOpacity="0.85"
          />
        ))}
      </g>
      <polygon
        points={`${xp},${plankY + 8} ${r2(xp + 15)},${plankY + 38} ${r2(xp - 15)},${plankY + 38}`}
        fill="var(--color-bg)"
        stroke={MEAN_COLOR}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        x={xp}
        y={plankY + 52}
        textAnchor="middle"
        fontSize="11"
        fill="var(--color-muted)"
      >
        pivot {f1(pivot)}
      </text>
    </svg>
  );
}

function Inner() {
  const [seed, setSeed] = useState(DOT_SEED);
  const [dots, setDots] = useState<number[]>(() => startingDots(DOT_SEED));
  const [pivotOverride, setPivotOverride] = useState<number | null>(null);

  const ints = useMemo(() => dots.map(Math.round), [dots]);
  const n = ints.length;
  const m = n ? mean(ints) : NaN;
  const med = n ? median(ints) : NaN;
  const mo = useMemo(() => modes(ints), [ints]);
  const pivot = pivotOverride ?? (Number.isFinite(m) ? m : 10);
  const tilt = n ? clamp((m - pivot) * TILT_PER_UNIT, -TILT_MAX, TILT_MAX) : 0;
  const balanced = Math.abs(tilt) < 0.05;

  const setDot = (i: number, v: number) =>
    setDots((cur) => cur.map((d, j) => (j === i ? v : d)));
  const reload = (s: number) => {
    setSeed(s);
    setDots(startingDots(s));
    setPivotOverride(null);
  };

  const modeCount = mo.length ? ints.filter((v) => v === mo[0]).length : 0;
  const summary = n
    ? `Mean ${f1(m)}, median ${f1(med)}, ${mo.length ? `mode ${listNumbers(mo)}` : 'no mode'}. ${
        balanced
          ? 'The plank is level.'
          : `The plank tips ${tilt > 0 ? 'right' : 'left'}.`
      }`
    : 'No dots yet. Add a dot to begin.';

  return (
    <>
      <p className="m-0 mb-2 text-sm text-muted">
        Drag a dot, or focus one and press ← →. Values snap to whole numbers.
      </p>
      {n === 0 ? (
        <p className="m-0 rounded-md border border-grid bg-bg p-4 text-sm" role="status">
          No dots yet. Press <strong>Add dot</strong> to start.
        </p>
      ) : (
        <DotPlot
          values={dots}
          domain={[DOT_MIN, DOT_MAX]}
          tickStep={5}
          height={170}
          radius={7}
          label={`Dot plot of ${n} values on a number line from 0 to 20`}
          mean={m}
          median={med}
          modes={mo}
          draggable={() => true}
          onMove={setDot}
          onCommit={setDot}
          dotLabel={(i, v) => `Dot ${i + 1} of ${n}, value ${Math.round(v)}`}
        />
      )}
      <MarkerLegend />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Metric
          label="▲ Mean: balance point"
          value={f1(m)}
          tone="accent"
          hint="add up all values, divide by how many"
        />
        <Metric
          label="◆ Median: middle value"
          value={f1(med)}
          hint="half the dots are below, half above"
        />
        <Metric
          label="★ Mode: most common"
          value={n === 0 ? '—' : mo.length ? listNumbers(mo) : 'None'}
          hint={
            n === 0
              ? 'no dots'
              : mo.length
                ? `${modeCount} dots each${mo.length > 1 ? ' (a tie)' : ''}`
                : 'No repeats, no mode'
          }
        />
      </div>

      <h4 className="mb-1 mt-5 text-sm font-semibold">
        Why the mean is the balance point
      </h4>
      <Seesaw dots={ints} pivot={pivot} />
      <Slider
        label="Try a different pivot"
        value={pivot}
        min={DOT_MIN}
        max={DOT_MAX}
        step={0.1}
        format={f1}
        onChange={(v) => setPivotOverride(n ? v : null)}
      />
      <p className="m-0 mt-2 text-sm" role="status">
        {n === 0
          ? 'Add a dot to see the seesaw.'
          : balanced
            ? '● Level. The pivot sits on the mean, so the dots balance.'
            : `⚠ Tips ${tilt > 0 ? 'right' : 'left'}. More weight sits to the ${tilt > 0 ? 'right' : 'left'} of the pivot.`}
        {pivotOverride !== null && (
          <>
            {' '}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => setPivotOverride(null)}
            >
              Put the pivot back on the mean
            </button>
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={n >= DOT_LIMIT}
          onClick={() => setDots((d) => [...d, n ? Math.round(median(d)) : 10])}
        >
          Add dot
        </Button>
        <Button disabled={n === 0} onClick={() => setDots((d) => d.slice(0, -1))}>
          Remove dot
        </Button>
        <Button onClick={() => reload(DOT_SEED)}>Reset</Button>
        <Button onClick={() => reload(seed + 1)}>Reshuffle</Button>
      </div>
      <p role="status" className="sr-only">
        {summary}
      </p>
      <p className="m-0 mt-2 text-xs text-muted" aria-hidden="true">
        {summary}
      </p>
    </>
  );
}

export function ThreeAverages() {
  return (
    <ClientOnly
      minHeight={760}
      label="Three averages: drag dots on a number line and watch the mean, median and mode"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
