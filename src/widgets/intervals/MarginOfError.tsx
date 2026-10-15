import { useMemo, useState } from 'react';
import { commute } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { useMatrix } from '../sampling/useMatrix';
import { binCounts, popMean } from '../sampling/sampling';
import { MAX_N, REPS, covers, sampleInterval } from './intervals';
import {
  ChartKey,
  EveryoneLine,
  EveryoneMark,
  GreyBox,
  IntervalBar,
  LegendItem,
  LevelPills,
  POP_FILL,
  POP_STROKE,
  Reading,
  SampleMark,
  Skeleton,
  StackLegend,
  TriangleFilled,
  TriangleOutline,
  W,
  XAxis,
  f1,
  f2,
  levelText,
  makeScale,
  niceMax,
} from './charts';
import { pageActions, usePage } from './store';

const H = 312;
const HIST_BASE = 118;
const HIST_H = 84;
const STRIP_BASE = 176;
const BAR_Y = 206;
const TRI_Y = 218;
const TRUTH_Y = 262;
const DEFAULT_N = 25;
const LO = 0;
const HI = 120;
const BIN = 5;

function Inner() {
  const { seed, level } = usePage();
  const [n, setN] = useState(DEFAULT_N);
  const [count, setCount] = useState(0);
  const [reveal, setReveal] = useState(false);

  const pop = useMemo(() => commute(seed), [seed]);
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const truth = useMemo(() => popMean(pop), [pop]);
  const hist = useMemo(() => {
    const { counts } = binCounts(pop, LO, HI, BIN);
    return { counts, top: niceMax(Math.max(...counts) / pop.length) };
  }, [pop]);

  if (!matrix) return <Skeleton height={520} />;

  const scale = makeScale(LO, HI);
  const values = count > 0 ? matrix.sampleValues(count - 1, n) : [];
  const iv = values.length ? sampleInterval(values, level) : null;
  const caught = iv ? covers(iv, truth) : false;
  const barW = scale.x(LO + BIN) - scale.x(LO);

  const buckets = new Map<number, number>();
  const dots = values.map((v) => {
    const key = Math.round(scale.x(v) / 7);
    const lv = Math.min(4, buckets.get(key) ?? 0);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    return { cx: scale.x(v), cy: STRIP_BASE - 5 - lv * 7 };
  });

  const lowX = iv ? scale.x(iv.lo) : 0;
  const highX = iv ? scale.x(iv.hi) : 0;
  const atCap = count >= REPS;

  const summary = !iv
    ? 'No sample drawn yet.'
    : `${levelText(level)} interval from ${n} people: ${f1(iv.lo)} to ${f1(iv.hi)} minutes around a sample average of ${f1(iv.mean)}.${
        reveal ? ` The truth, ${f1(truth)}, is ${caught ? 'inside' : 'outside'}.` : ''
      }`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Commute times of 10,000 people, one sample of ${n} as dots, and its interval. ${summary}`}
      >
        <text x="14" y="18" fontSize="16" fill="var(--color-muted)">
          Everyone: 10,000 commutes
        </text>
        {Array.from(hist.counts, (c, i) => {
          const h = (c / pop.length / hist.top) * HIST_H;
          return (
            <rect
              key={i}
              x={scale.x(LO + i * BIN) + 0.5}
              y={HIST_BASE - h}
              width={Math.max(0, barW - 1)}
              height={h}
              fill={POP_FILL}
              stroke={POP_STROKE}
              strokeWidth="1.25"
            />
          );
        })}
        <XAxis scale={scale} y={HIST_BASE} ticks={[0, 20, 40, 60, 80, 100, 120]} />
        <text
          x={W - 14}
          y={HIST_BASE + 40}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          minutes
        </text>
        <line
          x1={14}
          x2={W - 14}
          y1={STRIP_BASE}
          y2={STRIP_BASE}
          stroke="var(--color-grid)"
        />
        <text x="14" y={HIST_BASE + 40} fontSize="16" fill="var(--color-muted)">
          {count > 0 ? `Your sample: ${n} people` : 'Your sample will appear here'}
        </text>
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r="3"
            fill="color-mix(in srgb, var(--color-accent) 55%, transparent)"
            stroke="var(--color-accent)"
            strokeWidth="1"
          />
        ))}
        {reveal && <EveryoneLine x={scale.x(truth)} top={26} bottom={TRUTH_Y} />}
        {iv && (
          <>
            <IntervalBar
              x1={lowX}
              x2={highX}
              y={BAR_Y}
              caught={caught}
              neutral={!reveal}
              cap={6}
              width={3}
              towards={scale.x(truth)}
            />
            <text
              x={lowX - 8}
              y={BAR_Y + 5}
              fontSize="15"
              textAnchor="end"
              fill="var(--color-ink)"
            >
              {f1(iv.lo)}
            </text>
            <text x={highX + 8} y={BAR_Y + 5} fontSize="15" fill="var(--color-ink)">
              {f1(iv.hi)}
            </text>
            <SampleMark x={scale.x(iv.mean)} y={TRI_Y} />
          </>
        )}
        {reveal && <EveryoneMark x={scale.x(truth)} y={TRUTH_Y} />}
        {reveal && (
          <text
            x={scale.x(truth) + (scale.x(truth) < 300 ? 14 : -14)}
            y={TRUTH_Y + 14}
            fontSize="16"
            fontWeight="600"
            textAnchor={scale.x(truth) < 300 ? 'start' : 'end'}
            fill="var(--color-ink)"
          >
            Truth {f1(truth)}
          </text>
        )}
        {iv && (
          <text
            x={Math.min(500, Math.max(80, scale.x(iv.mean)))}
            y={TRI_Y + 28}
            fontSize="16"
            fontWeight="600"
            textAnchor="middle"
            fill="var(--color-ink)"
          >
            Your sample {f1(iv.mean)}
          </text>
        )}
      </svg>
      <ChartKey
        across={'minutes of one commute'}
        up={'grey bars: how many of everyone have that commute'}
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={GreyBox}>everyone (grey outline)</LegendItem>
        <LegendItem shape={TriangleFilled}>average of your sample</LegendItem>
        {reveal && (
          <LegendItem shape={TriangleOutline}>the truth: average of everyone</LegendItem>
        )}
      </ul>
      {reveal && <StackLegend />}

      {iv && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Metric
            label="Your sample says"
            value={`${f1(iv.mean)} min`}
            hint={`average of ${n} people`}
            wrap
          />
          <Metric
            label="Give or take"
            value={`${f1(iv.half)} min`}
            hint="margin of error: built in the 3 steps below"
            tone="accent"
            wrap
          />
          <Metric
            label="Plausible range"
            value={`${f1(iv.lo)} to ${f1(iv.hi)}`}
            hint={`${levelText(level)} confidence interval`}
            wrap
          />
        </div>
      )}
      {iv && (
        <ol className="m-0 mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>
            <strong>Spread of your {n} people:</strong> {f1(iv.sd)} min. This is the{' '}
            <strong>standard deviation</strong> of your data: how far a typical commute in
            your sample sits from your sample average.
          </li>
          <li>
            <strong>Wobble of the average (standard error):</strong> {f1(iv.sd)} ÷ √{n} ={' '}
            {f1(iv.se)} min. Averages of more people wobble less, so you divide by √{n}.
          </li>
          <li>
            <strong>
              Margin: {f2(iv.crit)} × {f1(iv.se)} = {f1(iv.half)} min.
            </strong>{' '}
            The {f2(iv.crit)} is the multiplier for {levelText(level)}: about 2, a little
            more for small samples. A higher level means a bigger multiplier and a wider
            range.
          </li>
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={atCap} onClick={() => setCount((c) => c + 1)}>
          Draw a sample
        </Button>
        <Toggle label="Reveal the truth" checked={reveal} onChange={setReveal} />
      </div>
      <div className="mt-3">
        <Slider
          label="People in your sample"
          value={n}
          min={10}
          max={200}
          step={1}
          onChange={(v) => setN(Math.round(v))}
          format={(v) => String(Math.round(v))}
        />
      </div>
      <div className="mt-3">
        <LevelPills level={level} onChange={pageActions.setLevel} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setN(DEFAULT_N);
            setCount(0);
            setReveal(false);
            pageActions.resetSeed();
            pageActions.setLevel(0.95);
          }}
        >
          Reset
        </Button>
        <Button
          onClick={() => {
            setCount(0);
            pageActions.newPopulation();
          }}
        >
          New population
        </Button>
        {atCap && (
          <span className="text-xs text-muted">
            All prepared samples drawn. Press Reset.
          </span>
        )}
      </div>

      <Reading>
        {!iv ? (
          <>
            No sample yet. Press <strong>Draw a sample</strong>. A sample needs at least 2
            people to have a margin.
          </>
        ) : (
          <>
            Your sample says {f1(iv.mean)} min, give or take {f1(iv.half)}. Plausible
            range: {f1(iv.lo)} to {f1(iv.hi)}.
            {reveal && (
              <>
                {' '}
                {caught
                  ? `The truth, ${f1(truth)}, is inside.`
                  : `The truth, ${f1(truth)}, is outside: this interval missed.`}
              </>
            )}
          </>
        )}
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function MarginOfError() {
  return (
    <ClientOnly
      minHeight={760}
      label="Margin of error: draw a sample and see the plausible range for the true average"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
