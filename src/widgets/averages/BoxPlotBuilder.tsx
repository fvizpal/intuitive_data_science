import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { lognormalSample } from '../../lib/datasets';
import { f0, ordinal } from './data';
import { DotPlot, DP_W } from './DotPlot';
import { MEDIAN_COLOR, MarkerLegend } from './Markers';
import { ticks } from './stacking';
import { boxStats, histogramCounts, percentileRank, quantile } from './stats';

const N = 40;
const SEED_DEFAULT = 4;
const BINS = 12;
const L = 14;
const R = DP_W - 14;
const BOX_H = 116;

/** Monthly income in ₹ thousand: right-skewed, so the box plot has something to show. */
function incomes(seed: number): number[] {
  return lognormalSample(seed, N, Math.log(30), 0.55).map((v) =>
    Math.max(5, Math.round(v)),
  );
}

const k = (v: number) => `₹${f0(v)}k`;

interface Hint {
  title: string;
  text: string;
}

function BoxSvg({
  box,
  hi,
  pctValue,
  onHint,
}: {
  box: ReturnType<typeof boxStats>;
  hi: number;
  pctValue: number;
  onHint: (h: Hint | null) => void;
}) {
  const x = (v: number) => Math.round((L + (v / hi) * (R - L)) * 100) / 100;
  const midY = 52;
  const half = 20;
  const part = (hint: Hint) => ({
    tabIndex: 0,
    role: 'img' as const,
    'aria-label': `${hint.title}. ${hint.text}`,
    onMouseEnter: () => onHint(hint),
    onMouseLeave: () => onHint(null),
    onFocus: () => onHint(hint),
    onBlur: () => onHint(null),
    style: { outline: 'none', cursor: 'help' },
  });
  return (
    <svg
      viewBox={`0 0 ${DP_W} ${BOX_H}`}
      className="block h-auto w-full"
      style={{ aspectRatio: `${DP_W} / ${BOX_H}` }}
      role="group"
      aria-label="Box plot on the same scale as the dot plot. Focus a part for a plain description."
    >
      {ticks(0, hi, 20).map((t) => (
        <line
          key={t}
          x1={x(t)}
          x2={x(t)}
          y1="8"
          y2={BOX_H - 8}
          stroke="var(--color-grid)"
        />
      ))}

      <g
        {...part({
          title: 'Lower whisker',
          text: 'The lowest normal values: the bottom edge of the usual range.',
        })}
      >
        <line
          x1={x(box.whiskerLow)}
          x2={x(box.q1)}
          y1={midY}
          y2={midY}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <line
          x1={x(box.whiskerLow)}
          x2={x(box.whiskerLow)}
          y1={midY - 8}
          y2={midY + 8}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <rect
          x={x(box.whiskerLow)}
          y={midY - 14}
          width={Math.max(0, x(box.q1) - x(box.whiskerLow))}
          height="28"
          fill="transparent"
        />
      </g>
      <g
        {...part({
          title: 'Upper whisker',
          text: 'The highest normal values: the top edge of the usual range.',
        })}
      >
        <line
          x1={x(box.q3)}
          x2={x(box.whiskerHigh)}
          y1={midY}
          y2={midY}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <line
          x1={x(box.whiskerHigh)}
          x2={x(box.whiskerHigh)}
          y1={midY - 8}
          y2={midY + 8}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <rect
          x={x(box.q3)}
          y={midY - 14}
          width={Math.max(0, x(box.whiskerHigh) - x(box.q3))}
          height="28"
          fill="transparent"
        />
      </g>
      <g
        {...part({
          title: 'The box',
          text: 'Middle half of the data lives here: from Q1 to Q3.',
        })}
      >
        <rect
          x={x(box.q1)}
          y={midY - half}
          width={Math.max(1, x(box.q3) - x(box.q1))}
          height={half * 2}
          fill="var(--color-accent)"
          fillOpacity="0.22"
          stroke="var(--color-accent)"
          strokeWidth="2"
        />
      </g>
      <g
        {...part({
          title: 'The median line',
          text: 'The middle value: half of the values are below it, half above.',
        })}
      >
        <line
          x1={x(box.median)}
          x2={x(box.median)}
          y1={midY - half - 4}
          y2={midY + half + 4}
          stroke={MEDIAN_COLOR}
          strokeWidth="3"
        />
        <rect
          x={x(box.median) - 6}
          y={midY - half - 4}
          width="12"
          height={half * 2 + 8}
          fill="transparent"
        />
      </g>
      {box.outliers.map((v, i) => (
        <g
          key={i}
          {...part({
            title: v > box.q3 ? 'Unusually high value' : 'Unusually low value',
            text: 'Beyond 1.5 times the box width from the box. Worth a look: error or a genuine extreme?',
          })}
        >
          <circle
            cx={x(v)}
            cy={midY}
            r="6"
            fill="var(--color-bg)"
            stroke="var(--color-neg)"
            strokeWidth="2"
          />
        </g>
      ))}

      <line
        x1={x(pctValue)}
        x2={x(pctValue)}
        y1="6"
        y2={BOX_H - 6}
        stroke="var(--color-pos)"
        strokeWidth="2"
        strokeDasharray="5 3"
        pointerEvents="none"
      />

      <text
        x={x(box.q1) - 4}
        y={midY + half + 22}
        textAnchor="end"
        fontSize="11"
        fill="var(--color-ink)"
      >
        Q1 {k(box.q1)}
      </text>
      <text
        x={x(box.q3) + 4}
        y={midY + half + 22}
        textAnchor="start"
        fontSize="11"
        fill="var(--color-ink)"
      >
        Q3 {k(box.q3)}
      </text>
      <text
        x={x(box.median)}
        y={midY - half - 8}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--color-ink)"
      >
        median {k(box.median)}
      </text>
    </svg>
  );
}

function Inner() {
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [pct, setPct] = useState(50);
  const [hist, setHist] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);

  const values = useMemo(() => incomes(seed), [seed]);
  const box = useMemo(() => boxStats(values), [values]);
  const hi = Math.ceil((Math.max(...values) * 1.05) / 20) * 20;
  const counts = useMemo(() => histogramCounts(values, 0, hi, BINS), [values, hi]);
  const maxCount = Math.max(...counts);
  const outlierSet = useMemo(() => new Set(box.outliers), [box]);

  const pv = quantile(values, pct / 100);
  const rank = percentileRank(values, pv);
  const below = Math.round(rank * values.length);
  const bad = box.outliers.length;

  const summary = `Median ${k(box.median)}, middle half ${k(box.q1)} to ${k(box.q3)}, ${bad} unusual value${bad === 1 ? '' : 's'}. The ${ordinal(pct)} percentile is ${k(pv)}, higher than ${f0(rank * 100)}% of values.`;

  return (
    <>
      <Slider
        label="Percentile"
        value={pct}
        min={0}
        max={100}
        step={1}
        format={(v) => ordinal(v)}
        onChange={(v) => setPct(Math.round(v))}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {[25, 50, 75].map((p) => (
          <Button
            key={p}
            aria-pressed={pct === p}
            className={pct === p ? 'border-accent' : ''}
            onClick={() => setPct(p)}
          >
            {ordinal(p)}
          </Button>
        ))}
        <Toggle label="Show histogram" checked={hist} onChange={setHist} />
      </div>

      <p className="m-0 mb-1 mt-3 text-xs text-muted">
        Monthly income of {values.length} people, ₹ thousand
      </p>
      <DotPlot
        values={values}
        domain={[0, hi]}
        tickStep={20}
        height={176}
        radius={4.5}
        label={`Dot plot of ${values.length} monthly incomes in thousands of rupees`}
        formatTick={(v) => String(v)}
        median={box.median}
        dotStyle={(i) =>
          outlierSet.has(values[i] as number)
            ? { hollow: true, color: 'var(--color-neg)' }
            : {}
        }
        under={({ x, axisY, top }) =>
          hist ? (
            <g aria-hidden="true">
              {counts.map((c, i) => {
                const x0 = x((i * hi) / BINS);
                const x1 = x(((i + 1) * hi) / BINS);
                const h = (c / maxCount) * (axisY - top - 18);
                return (
                  <rect
                    key={i}
                    x={x0 + 1}
                    y={axisY - h}
                    width={Math.max(0, x1 - x0 - 2)}
                    height={h}
                    fill="var(--color-accent)"
                    fillOpacity="0.2"
                    stroke="var(--color-accent)"
                    strokeOpacity="0.5"
                  />
                );
              })}
            </g>
          ) : null
        }
        over={({ x, axisY, top }) => (
          <line
            x1={x(pv)}
            x2={x(pv)}
            y1={top - 8}
            y2={axisY}
            stroke="var(--color-pos)"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
        )}
      />
      <BoxSvg box={box} hi={hi} pctValue={pv} onHint={setHint} />
      <p className="m-0 min-h-10 text-sm" aria-live="polite">
        {hint ? (
          <>
            <strong>{hint.title}.</strong> {hint.text}
          </>
        ) : (
          <span className="text-muted">
            Hover or focus a part of the box plot for a plain description.
          </span>
        )}
      </p>
      <MarkerLegend mean={false} mode={false} />
      <p className="m-0 mt-1 text-xs text-muted">
        <span className="text-pos" aria-hidden="true">
          ┆
        </span>{' '}
        dashed teal line: your percentile · <span className="text-neg">◯</span> hollow
        circle: outlier
        {hist ? ' · shaded bars: histogram' : ''}
      </p>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        The {ordinal(pct)} percentile is {k(pv)}. That is higher than {f0(rank * 100)}% of
        values ({below} of {values.length}).
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Q1 (25th)" value={k(box.q1)} hint="a quarter are below this" />
        <Metric
          label="Median (50th)"
          value={k(box.median)}
          hint="half below, half above"
        />
        <Metric
          label="Q3 (75th)"
          value={k(box.q3)}
          hint="three quarters are below this"
        />
        <Metric
          label="IQR (Q3 − Q1)"
          value={k(box.iqr)}
          tone="accent"
          hint="the width of the middle half"
        />
      </div>
      <p className="m-0 mt-2 text-sm">
        {bad === 0
          ? 'No outliers: every value is inside the fences.'
          : `${bad} unusual value${bad === 1 ? '' : 's'}: beyond ${k(box.fenceHigh)} (Q3 + 1.5 × IQR)${box.outliers.some((v) => v < box.q1) ? ' or below the lower fence' : ''}.`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSeed(SEED_DEFAULT);
            setPct(50);
            setHist(false);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle</Button>
      </div>
      <p role="status" className="sr-only">
        {summary}
      </p>
    </>
  );
}

export function BoxPlotBuilder() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Box plot builder: a dot plot, a box plot and a percentile slider on one scale"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
