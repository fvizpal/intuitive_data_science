import { useEffect, useMemo, useState } from 'react';
import { commute } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  AVG_FILL,
  AVG_STROKE,
  AccentBox,
  DashSwatch,
  EveryoneLine,
  EveryoneMark,
  LegendItem,
  PAD_L,
  ChartKey,
  Reading,
  ShareGrid,
  Skeleton,
  TheoryCurve,
  TriangleOutline,
  W,
  XAxis,
  f1,
  makeScale,
  niceMax,
  pct,
} from './charts';
import { MAX_N, REPS, binCounts, meansForN, popMean, sdOf, se } from './sampling';
import { pageActions, usePage } from './store';
import { useMatrix } from './useMatrix';

const LO = 10;
const HI = 55;
const BIN = 0.5;
const H = 268;
const BASE = 206;
const PLOT_H = 168;
const DEFAULT_N = 25;
export const TICKS = [5, 10, 25, 50, 100, 200, 400, 800];

/** Whole-number sample sizes, evenly spaced on a log scale, always including the ticks. */
export const N_LIST: number[] = (() => {
  const s = new Set<number>(TICKS);
  for (let i = 0; i <= 100; i++) s.add(Math.round(5 * Math.pow(160, i / 100)));
  return [...s].sort((a, b) => a - b);
})();
const indexOfN = (n: number) => {
  let best = 0;
  for (let i = 0; i < N_LIST.length; i++)
    if (Math.abs(N_LIST[i]! - n) < Math.abs(N_LIST[best]! - n)) best = i;
  return best;
};

function Inner() {
  const { seed, saw100, saw400 } = usePage();
  const [n, setN] = useState(DEFAULT_N);
  const [theory, setTheory] = useState(false);

  const pop = useMemo(() => commute(seed), [seed]);
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const m = useMemo(() => popMean(pop), [pop]);

  useEffect(() => {
    pageActions.markN(n);
  }, [n]);

  const means = matrix ? meansForN(matrix, n) : null;
  const view = useMemo(() => {
    if (!means) return null;
    const { counts, below, above } = binCounts(means, LO, HI, BIN);
    return { counts, off: below + above, sd: sdOf(means) };
  }, [means]);

  if (!matrix || !means || !view) return <Skeleton height={460} />;

  const scale = makeScale(LO, HI);
  const binPx = scale.x(LO + BIN) - scale.x(LO);
  const maxShare = Math.max(...view.counts) / REPS;
  const yMax = niceMax(maxShare * 1.1);
  const sd = view.sd ?? 0;
  const th = se(pop, n);
  const four = n * 4;
  const capped = four > MAX_N;
  const sd4 = capped ? null : sdOf(meansForN(matrix, four)!);
  const th4 = se(pop, four);
  const compared =
    saw100 && saw400 && (n === 100 || n === 400)
      ? { a: sdOf(meansForN(matrix, 100)!) ?? 0, b: sdOf(meansForN(matrix, 400)!) ?? 0 }
      : null;

  const summary = `${n} people per sample: averages spread ${f1(sd)} minutes around ${f1(m)}. Theory says ${f1(th)}.`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${REPS} sample averages, ${n} people per sample. ${summary}`}
      >
        <ShareGrid base={BASE} plotH={PLOT_H} yMax={yMax} fmt={(v) => pct(v)} />
        {Array.from(view.counts, (c, i) =>
          c > 0 ? (
            <rect
              key={i}
              x={scale.x(LO + i * BIN)}
              y={BASE - (c / REPS / yMax) * PLOT_H}
              width={Math.max(0, binPx - 0.6)}
              height={(c / REPS / yMax) * PLOT_H}
              fill={AVG_FILL}
              stroke={AVG_STROKE}
              strokeWidth="1"
            />
          ) : null,
        )}
        <EveryoneLine x={scale.x(m)} top={30} bottom={BASE} />
        {theory && (
          <TheoryCurve
            scale={scale}
            mu={m}
            sd={th}
            binWidth={BIN}
            base={BASE}
            plotH={PLOT_H}
            yMax={yMax}
            label="theory: bell curve"
            labelSide="right"
          />
        )}
        <XAxis
          scale={scale}
          y={BASE}
          ticks={[10, 15, 20, 25, 30, 35, 40, 45, 50, 55]}
          label="average of the sample, minutes"
        />
        <EveryoneMark x={scale.x(m)} y={BASE - 14} />
        <text x={PAD_L} y={20} fontSize="16" fill="var(--color-muted)">
          share of samples (2,000 samples of {n})
        </text>
        <text
          x={W - 14}
          y={20}
          fontSize="16"
          fontWeight="600"
          textAnchor="end"
          fill="var(--color-ink)"
        >
          Everyone {f1(m)}
        </text>
      </svg>
      <ChartKey
        across={'the average commute of one sample, in minutes'}
        up={'share of the 2,000 samples that had that average'}
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={AccentBox}>sample averages</LegendItem>
        <LegendItem shape={TriangleOutline}>average of everyone</LegendItem>
        {theory && <LegendItem shape={DashSwatch}>theory curve (dashed)</LegendItem>}
      </ul>

      <div className="mt-3">
        <Slider
          label="People in each sample"
          value={indexOfN(n)}
          min={0}
          max={N_LIST.length - 1}
          step={1}
          onChange={(v) => setN(N_LIST[Math.round(v)] ?? DEFAULT_N)}
          format={(v) => String(N_LIST[Math.round(v)] ?? '')}
        />
        <div className="relative mx-[6px] h-4 text-[11px] text-muted" aria-hidden="true">
          {TICKS.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2"
              style={{ left: `${(indexOfN(t) / (N_LIST.length - 1)) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric
          label="Spread of the averages"
          value={`${f1(sd)} min`}
          hint="how far a sample average typically sits from the middle"
          tone="accent"
          wrap
        />
        <Metric
          label="Theory: spread of everyone ÷ √n"
          value={`${f1(th)} min`}
          hint={`${f1(se(pop, 1))} ÷ √${n}, from the formula`}
          wrap
        />
      </div>
      <p className="m-0 mt-2 text-sm">
        {compared ? (
          <>
            You compared 100 and 400 people: the spread fell from {f1(compared.a)} to{' '}
            {f1(compared.b)} min, about half.
          </>
        ) : capped ? (
          <>
            For 4 times as many people (n = {four}, beyond this slider&rsquo;s 800), the
            spread would be halved: about {f1(th4)} min.
          </>
        ) : (
          <>
            For 4 times as many people, the spread is halved: n = {four} gives{' '}
            {f1(sd4 ?? th4)} min.
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={n >= MAX_N}
          onClick={() => setN(Math.min(MAX_N, n * 4))}
        >
          Jump to 4 times as many people
        </Button>
        <Toggle label="Show theory curve" checked={theory} onChange={setTheory} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setN(DEFAULT_N);
            setTheory(false);
            pageActions.resetSeed();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.newPopulation}>New population</Button>
        {view.off > 0 && (
          <span className="text-xs text-muted">
            {view.off} average{view.off === 1 ? '' : 's'} off the edge of the chart.
          </span>
        )}
      </div>

      <Reading>
        With {n} people per sample, the averages typically land within about {f1(sd)}{' '}
        minutes of {f1(m)}.{' '}
        {capped ? (
          <>With 4 times as many: about {f1(th4)}.</>
        ) : (
          <>
            With {four} people: {f1(sd4 ?? th4)}.
          </>
        )}
        {Math.abs(sd - th) / (th || 1) < 0.1
          ? ' The simulation and the formula agree.'
          : ' The simulation and the formula differ a little: 2,000 samples is a finite pile.'}
      </Reading>
      <p className="m-0 mt-2 text-sm">
        The typical spread of sample averages has a name: <strong>standard error</strong>.
      </p>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function SampleSize() {
  return (
    <ClientOnly
      minHeight={700}
      label="Sample size: slide the number of people per sample and watch the averages narrow"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
