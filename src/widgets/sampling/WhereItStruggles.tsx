import { useMemo, useState } from 'react';
import { POP_META, bulbs, views } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { Hatch } from '../distributions/charts';
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
  f0,
  f1,
  makeScale,
  niceMax,
  niceTicks,
  pct,
  tickLabel,
} from './charts';
import {
  REPS,
  bellGap,
  bellReading,
  binCounts,
  expectedZeroShare,
  meanOf,
  meansForN,
  needForTenEvents,
  normalBelowZero,
  popMean,
  sdOf,
} from './sampling';
import { DEFAULT_SEED } from './store';
import { useMatrix } from './useMatrix';

const H = 250;
const BASE = 192;
const PLOT_H = 150;

/** One decimal below 10%, integers above, "under 0.1%" for dust. */
const share = (p: number) => (p > 0 && p < 0.001 ? 'under 0.1%' : pct(p));

// ---------------------------------------------------------------- panel A: rare events

const BATCHES = [25, 100, 250, 1000] as const;
const BATCH_OPTIONS = BATCHES.map((b) => ({ value: String(b), label: String(b) }));

function Bulbs() {
  const [batch, setBatch] = useState<number>(25);
  const [bell, setBell] = useState(true);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const pop = useMemo(() => bulbs(seed), [seed]);
  const matrix = useMatrix(pop, 1000, REPS, seed);
  const p = useMemo(() => popMean(pop), [pop]);
  const means = matrix ? meansForN(matrix, batch) : null;

  /** How many of the 2,000 batches had k faulty bulbs, for k = 0..batch. */
  const view = useMemo(() => {
    if (!means) return null;
    const ks = new Int32Array(batch + 1);
    for (let i = 0; i < means.length; i++) ks[Math.round(means[i]! * batch)]!++;
    return ks;
  }, [means, batch]);

  if (!matrix || !means || !view) return <Skeleton height={420} />;

  const sdn = Math.sqrt((p * (1 - p)) / batch);
  const lo = Math.min(p - 3.6 * sdn, -0.015);
  const hi = p + 4.5 * sdn;
  const scale = makeScale(lo, hi);
  const pxPerUnit = scale.x(1) - scale.x(0);
  const maxShare = Math.max(...view) / REPS;
  const peak = bell ? 1 / batch / (sdn * Math.sqrt(2 * Math.PI)) : 0;
  const yMax = niceMax(Math.max(maxShare, peak) * 1.1);
  const barW = Math.max(3, (0.6 / batch) * pxPerUnit);
  const zero = expectedZeroShare(p, batch);
  const below = normalBelowZero(p, batch);
  const perBatch = batch * p;
  const fair = perBatch >= 10;
  const need = needForTenEvents(p);
  const simZero = view[0]! / REPS;
  const bars: { k: number; c: number }[] = [];
  let off = 0;
  for (let k = 0; k < view.length; k++) {
    if (!view[k]) continue;
    if (k / batch > hi) off += view[k]!;
    else bars.push({ k, c: view[k]! });
  }

  const summary = `Batches of ${batch}: ${share(zero)} contain no faulty bulb. A bell curve would put ${share(below)} below zero.`;

  return (
    <>
      <SegmentedControl
        label="Bulbs in each batch"
        options={BATCH_OPTIONS}
        value={String(batch)}
        onChange={(v) => setBatch(Number(v))}
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Share of batches by share of faulty bulbs, ${batch} bulbs per batch. ${summary}`}
      >
        <defs>
          <Hatch id="below-zero" />
        </defs>
        <rect
          x={scale.x(lo)}
          y={BASE - PLOT_H}
          width={Math.max(0, scale.x(0) - scale.x(lo))}
          height={PLOT_H}
          fill="url(#below-zero)"
        />
        <text
          x={scale.x(0) - 8}
          y={BASE - PLOT_H + 16}
          fontSize="15"
          textAnchor="end"
          fill="var(--color-ink)"
        >
          below 0: impossible
        </text>
        <ShareGrid base={BASE} plotH={PLOT_H} yMax={yMax} fmt={(v) => pct(v)} />
        {bars.map(({ k, c }) => (
          <rect
            key={k}
            x={scale.x(k / batch) - barW / 2}
            y={BASE - (c / REPS / yMax) * PLOT_H}
            width={barW}
            height={(c / REPS / yMax) * PLOT_H}
            fill={AVG_FILL}
            stroke={AVG_STROKE}
            strokeWidth="1"
          />
        ))}
        <line
          x1={scale.x(0)}
          x2={scale.x(0)}
          y1={BASE - PLOT_H}
          y2={BASE}
          stroke="var(--color-ink)"
          strokeWidth="1.5"
        />
        <EveryoneLine x={scale.x(p)} top={30} bottom={BASE} />
        {bell && (
          <TheoryCurve
            scale={scale}
            mu={p}
            sd={sdn}
            binWidth={1 / batch}
            base={BASE}
            plotH={PLOT_H}
            yMax={yMax}
            label="bell curve approximation"
            labelSide="right"
          />
        )}
        <XAxis
          scale={scale}
          y={BASE}
          ticks={niceTicks(lo, hi)}
          fmt={(v) => `${tickLabel(Math.round(v * 1000) / 10)}%`}
          label="share of the batch that is faulty"
        />
        <EveryoneMark x={scale.x(p)} y={BASE - 14} />
        <text x={PAD_L} y={20} fontSize="16" fill="var(--color-muted)">
          share of batches (2,000 batches of {batch})
        </text>
        <text
          x={W - 14}
          y={20}
          fontSize="16"
          fontWeight="600"
          textAnchor="end"
          fill="var(--color-ink)"
        >
          Everyone 4%
        </text>
      </svg>
      <ChartKey
        across={'share of the batch that is faulty'}
        up={'share of the 2,000 batches with that result'}
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={AccentBox}>batches, by share faulty</LegendItem>
        <LegendItem shape={TriangleOutline}>true faulty rate</LegendItem>
        {bell && <LegendItem shape={DashSwatch}>bell curve (dashed)</LegendItem>}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric
          label="Faulty bulbs in a typical batch"
          value={f1(perBatch)}
          hint={`${batch} bulbs × 4%`}
          wrap
        />
        <Metric
          label="Batch size for about 10 faulty bulbs"
          value={String(need)}
          hint="10 ÷ 4%: the rule of thumb"
          wrap
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle label="Show a bell curve" checked={bell} onChange={setBell} />
        <Button
          onClick={() => {
            setBatch(25);
            setBell(true);
            setSeed(DEFAULT_SEED);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
        {off > 0 && (
          <span className="text-xs text-muted">
            {off} batch{off === 1 ? '' : 'es'} off the right edge.
          </span>
        )}
      </div>

      <Reading>
        {zero < 0.001 ? (
          <>In batches of {batch}, almost none contain zero faulty bulbs. </>
        ) : (
          <>
            In batches of {batch}, {share(zero)} contain no faulty bulb at all
            {batch === 25 ? ', and the bars pile up against zero' : ''}.{' '}
          </>
        )}
        {below >= 0.005 ? (
          <>
            A bell curve would put {share(below)} of batches below zero faulty bulbs,
            which is impossible.
          </>
        ) : (
          <>A bell curve puts almost no batches below zero now.</>
        )}
        {fair && (
          <> About {f0(perBatch)} faulty bulbs per batch: the bell is a fair fit now.</>
        )}
        {!fair && batch >= 100 && (
          <> About {f0(perBatch)} faulty bulbs per batch: still fewer than 10.</>
        )}
        <span className="mt-1 block text-xs text-muted">
          {simZero === 0
            ? 'In this run, every one of the 2,000 batches had at least one faulty bulb.'
            : `In this run, ${share(simZero)} of the 2,000 batches had none.`}
        </span>
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

// ---------------------------------------------------------------- panel B: heavy tails

const TICKS_B = [5, 10, 25, 50, 100, 200, 500];
const N_LIST_B: number[] = (() => {
  const s = new Set<number>(TICKS_B);
  for (let i = 0; i <= 60; i++) s.add(Math.round(5 * Math.pow(100, i / 60)));
  return [...s].sort((a, b) => a - b);
})();
const indexOfB = (n: number) => {
  let best = 0;
  for (let i = 0; i < N_LIST_B.length; i++)
    if (Math.abs(N_LIST_B[i]! - n) < Math.abs(N_LIST_B[best]! - n)) best = i;
  return best;
};
const BINS_B = 50;

function Views() {
  const [n, setN] = useState(25);
  const [bell, setBell] = useState(true);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const meta = POP_META.views;

  const pop = useMemo(() => views(seed), [seed]);
  const matrix = useMatrix(pop, 500, REPS, seed);
  const m = useMemo(() => popMean(pop), [pop]);
  const means = matrix ? meansForN(matrix, n) : null;

  const view = useMemo(() => {
    if (!means) return null;
    const sorted = Float64Array.from(means).sort();
    const lo = Math.floor(sorted[0]! * 2) / 2;
    const top = sorted[Math.floor(0.995 * (sorted.length - 1))]!;
    const width = Math.max(0.05, Math.ceil(((top - lo) / BINS_B) * 20) / 20);
    const hi = lo + width * BINS_B;
    const { counts, above } = binCounts(means, lo, hi, width);
    return { lo, hi, width, counts, above, gap: bellGap(means) };
  }, [means]);

  if (!matrix || !means || !view) return <Skeleton height={420} />;

  const scale = makeScale(view.lo, view.hi);
  const barPx = scale.x(view.lo + view.width) - scale.x(view.lo);
  const mu = meanOf(means) ?? m;
  const sd = sdOf(means) ?? 0;
  const maxShare = Math.max(...view.counts) / REPS;
  const yMax = niceMax(maxShare * 1.25);
  const label = bellReading(view.gap);
  const lopsided = label !== 'close to a bell';
  const inView = m >= view.lo && m <= view.hi;

  const summary = `${n} videos per sample: ${label}. Averages centre on ${f1(mu)} thousand views.`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${REPS} average views per video, ${n} videos per sample. ${summary}`}
      >
        <ShareGrid base={BASE} plotH={PLOT_H} yMax={yMax} fmt={(v) => pct(v)} />
        {Array.from(view.counts, (c, i) =>
          c > 0 ? (
            <rect
              key={i}
              x={scale.x(view.lo + i * view.width)}
              y={BASE - Math.min(1, c / REPS / yMax) * PLOT_H}
              width={Math.max(0, barPx - 0.6)}
              height={Math.min(1, c / REPS / yMax) * PLOT_H}
              fill={AVG_FILL}
              stroke={AVG_STROKE}
              strokeWidth="1"
            />
          ) : null,
        )}
        {inView && <EveryoneLine x={scale.x(m)} top={30} bottom={BASE} />}
        {bell && (
          <TheoryCurve
            scale={scale}
            mu={mu}
            sd={sd}
            binWidth={view.width}
            base={BASE}
            plotH={PLOT_H}
            yMax={yMax}
            label="bell curve, same centre and spread"
            labelSide="right"
          />
        )}
        <XAxis
          scale={scale}
          y={BASE}
          ticks={niceTicks(view.lo, view.hi)}
          fmt={tickLabel}
          label="average views per video in a sample, thousand (axis fitted to the data)"
        />
        {inView && <EveryoneMark x={scale.x(m)} y={BASE - 14} />}
        <text x={PAD_L} y={20} fontSize="16" fill="var(--color-muted)">
          share of samples (2,000 samples of {n} videos)
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
        across={'average views per video in one sample, in thousands'}
        up={'share of the 2,000 samples with that average'}
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={AccentBox}>sample averages</LegendItem>
        <LegendItem shape={TriangleOutline}>average of everyone</LegendItem>
        {bell && <LegendItem shape={DashSwatch}>bell curve (dashed)</LegendItem>}
      </ul>

      <div className="mt-3">
        <Slider
          label="Videos in each sample"
          value={indexOfB(n)}
          min={0}
          max={N_LIST_B.length - 1}
          step={1}
          onChange={(v) => setN(N_LIST_B[Math.round(v)] ?? 25)}
          format={(v) => String(N_LIST_B[Math.round(v)] ?? '')}
        />
        <div className="relative mx-[6px] h-4 text-[11px] text-muted" aria-hidden="true">
          {TICKS_B.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2"
              style={{ left: `${(indexOfB(t) / (N_LIST_B.length - 1)) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle label="Show a bell curve" checked={bell} onChange={setBell} />
        <Button
          onClick={() => {
            setN(25);
            setBell(true);
            setSeed(DEFAULT_SEED);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
        {view.above > 0 && (
          <span className="text-xs text-muted">
            {view.above} average{view.above === 1 ? '' : 's'} off the right edge.
          </span>
        )}
      </div>

      <Reading>
        {lopsided ? (
          <>
            At {n} videos per sample, averages are still lopsided: one giant video can
            drag a sample&rsquo;s average ({label}).
          </>
        ) : (
          <>
            At {n} videos per sample, the averages are {label}.
          </>
        )}{' '}
        <span className="whitespace-nowrap text-muted">
          Distance from a bell: {view.gap === null ? '—' : view.gap.toFixed(2)} (0 means a
          perfect bell)
        </span>
        <span className="mt-1 block text-xs text-muted">
          Views are in thousands: {meta.shape}.
        </span>
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function WhereItStruggles() {
  return (
    <ClientOnly
      minHeight={1220}
      label="Where the bell struggles: rare events in a batch of bulbs, and heavy-tailed video views"
    >
      {() => (
        <>
          <h4 className="m-0 text-base font-semibold">A batch with 4% faulty bulbs</h4>
          <p className="m-0 mb-2 text-sm text-muted">
            Each batch is a random pick of bulbs. Its average is the share that are
            faulty.
          </p>
          <Bulbs />
          <hr className="my-6 border-grid" />
          <h4 className="m-0 text-base font-semibold">Views per video (a few giants)</h4>
          <p className="m-0 mb-2 text-sm text-muted">
            Each sample is a random pick of videos. Its average is their average views.
          </p>
          <Views />
        </>
      )}
    </ClientOnly>
  );
}
