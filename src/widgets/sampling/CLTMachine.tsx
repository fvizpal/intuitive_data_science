import { useEffect, useMemo, useState } from 'react';
import { POP_META, getPopulation, type PopId } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  AVG_FILL,
  AVG_STROKE,
  AccentBox,
  DashSwatch,
  EveryoneLine,
  EveryoneMark,
  GreyBox,
  LegendItem,
  POP_FILL,
  POP_STROKE,
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
  niceTicks,
  pct,
  tickLabel,
} from './charts';
import {
  REPS,
  bellGap,
  bellReading,
  binCounts,
  meansForN,
  popMean,
  popSd,
  sdOf,
  meanOf,
} from './sampling';
import { skewness } from '../averages/stats';
import { DEFAULT_SEED } from './store';
import { prefersReducedMotion, useMatrix } from './useMatrix';

const IDS = ['commute', 'cricket', 'dice', 'cafe'] as const satisfies readonly PopId[];
type Id = (typeof IDS)[number];
const OPTIONS = IDS.map((id) => ({ value: id, label: POP_META[id].label }));
/** Spacing of the possible values: averages of n then sit on a grid of LATTICE / n. */
const LATTICE: Record<Id, number> = { commute: 1, cricket: 1, dice: 1, cafe: 0.01 };
const NOTE: Record<Id, string> = {
  commute: 'Commute times are skewed, but not wildly: a few dozen people are plenty.',
  cricket:
    'Cricket needs more samples than dice to settle: its long tail takes longer to even out, so the averages lean right for longer.',
  dice: 'Flat data settles fast: every face is equally likely, so there is no tail to wait for.',
  cafe: 'Two humps melt into one: the average of a lunch and a dinner arrival sits in between.',
};
const MAX_SLIDER = 100;
const BINS = 40;
const H_TOP = 130;
const TOP_BASE = 96;
const TOP_H = 70;
const H = 262;
const BASE = 206;
const PLOT_H = 168;
const PLAY_MS = 2000;
/** Skewness of the averages above this reads as a visible lean. */
const LEAN = 0.3;

/** Bins that sit on the grid of possible averages, so no bar is lumpy by accident. */
function binning(lo: number, hi: number, unit: number) {
  const k = Math.max(1, Math.round((hi - lo) / BINS / unit));
  const width = k * unit;
  const start = Math.floor(lo / unit + 1e-9) * unit - unit / 2;
  const nb = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
  return { start, end: start + nb * width, width };
}

function Inner() {
  const [id, setId] = useState<Id>('commute');
  const [n, setN] = useState(1);
  const [bell, setBell] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const meta = POP_META[id];
  const pop = useMemo(() => getPopulation(id, seed), [id, seed]);
  const matrix = useMatrix(pop, 100, REPS, seed);
  const m = useMemo(() => popMean(pop), [pop]);
  const sigma = useMemo(() => popSd(pop), [pop]);
  const popView = useMemo(() => {
    const { counts } = binCounts(pop, meta.xMin, meta.xMax, meta.binWidth);
    return { counts, top: Math.max(1, ...counts) / pop.length };
  }, [pop, meta]);

  // Play: n runs from 1 to 100 over about two seconds (evenly in log steps).
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / PLAY_MS);
      setN(Math.max(1, Math.round(Math.exp(p * Math.log(MAX_SLIDER)))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const means = matrix ? meansForN(matrix, n) : null;
  const view = useMemo(() => {
    if (!means) return null;
    const se = sigma / Math.sqrt(n);
    const lo = Math.max(Math.min(...pop), m - 4.5 * se);
    const hi = Math.min(Math.max(...pop), m + 4.5 * se);
    const unit = LATTICE[id] / n;
    const b = binning(lo, hi > lo ? hi : lo + unit, unit);
    const { counts, below, above } = binCounts(means, b.start, b.end, b.width);
    return {
      b,
      counts,
      off: below + above,
      gap: bellGap(means),
      skew: skewness(means as unknown as number[]),
    };
  }, [means, pop, m, sigma, n, id]);

  if (!matrix || !means || !view) return <Skeleton height={620} />;

  const reading = bellReading(view.gap);
  const mu = meanOf(means) ?? m;
  const sd = sdOf(means) ?? 0;
  const topScale = makeScale(meta.xMin, meta.xMax);
  const scale = makeScale(view.b.start, view.b.end);
  const barPx = scale.x(view.b.start + view.b.width) - scale.x(view.b.start);
  const topBarPx = topScale.x(meta.xMin + meta.binWidth) - topScale.x(meta.xMin);
  const yMax = niceMax((Math.max(...view.counts) / REPS) * 1.1);
  const topTicks =
    id === 'dice'
      ? [1, 2, 3, 4, 5, 6]
      : id === 'cafe'
        ? [8, 10, 12, 14, 16, 18, 20, 22]
        : [0, 20, 40, 60, 80, 100, 120];
  const unitShort = meta.unit;

  const leans = n > 1 && reading !== 'not a bell yet' && view.skew > LEAN;
  const verdict =
    n === 1
      ? `Averages of 1: ${reading} (${meta.shape}).`
      : `Averages of ${n}: ${reading}.${leans ? ' They still lean a little to the right.' : ''}`;
  const summary = `${meta.label}, ${n} ${n === 1 ? 'person' : 'people'} per sample: ${reading}. Distance from a bell ${view.gap === null ? 'unknown' : view.gap.toFixed(2)}.`;

  const onPlay = () => {
    if (playing) return setPlaying(false);
    if (prefersReducedMotion()) return setN(MAX_SLIDER);
    if (n >= MAX_SLIDER) setN(1);
    setPlaying(true);
  };

  return (
    <>
      <SegmentedControl
        label="Population"
        options={OPTIONS}
        value={id}
        onChange={(v) => {
          setId(v);
        }}
      />
      <svg
        viewBox={`0 0 ${W} ${H_TOP}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H_TOP}` }}
        role="img"
        aria-label={`The ${meta.label.toLowerCase()} population: ${meta.shape}.`}
      >
        <text x={PAD_L} y="18" fontSize="16" fill="var(--color-muted)">
          The data itself: {meta.label.toLowerCase()} ({unitShort})
        </text>
        {Array.from(popView.counts, (c, i) => {
          const h = (c / pop.length / popView.top) * TOP_H;
          return (
            <rect
              key={i}
              x={topScale.x(meta.xMin + i * meta.binWidth) + 0.5}
              y={TOP_BASE - h}
              width={Math.max(0, topBarPx - 1)}
              height={h}
              fill={POP_FILL}
              stroke={POP_STROKE}
              strokeWidth="1.25"
            />
          );
        })}
        <XAxis scale={topScale} y={TOP_BASE} ticks={topTicks} />
        <EveryoneMark x={topScale.x(m)} y={TOP_BASE - 14} />
      </svg>
      <p className="m-0 text-sm">
        <span className="text-muted">Shape: </span>
        {meta.shape}.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${REPS} sample averages, ${n} per sample. ${summary}`}
      >
        <ShareGrid base={BASE} plotH={PLOT_H} yMax={yMax} fmt={(v) => pct(v)} />
        {Array.from(view.counts, (c, i) =>
          c > 0 ? (
            <rect
              key={i}
              x={scale.x(view.b.start + i * view.b.width)}
              y={BASE - (c / REPS / yMax) * PLOT_H}
              width={Math.max(0, barPx - 0.6)}
              height={(c / REPS / yMax) * PLOT_H}
              fill={AVG_FILL}
              stroke={AVG_STROKE}
              strokeWidth="1"
            />
          ) : null,
        )}
        <EveryoneLine x={scale.x(m)} top={30} bottom={BASE} />
        {bell && (
          <TheoryCurve
            scale={scale}
            mu={mu}
            sd={sd}
            binWidth={view.b.width}
            base={BASE}
            plotH={PLOT_H}
            yMax={yMax}
            label="bell curve, same centre and spread"
            labelSide={scale.x(mu) > W / 2 ? 'left' : 'right'}
          />
        )}
        <XAxis
          scale={scale}
          y={BASE}
          ticks={niceTicks(view.b.start, view.b.end)}
          fmt={tickLabel}
          label={`average of ${n} (${unitShort}); the axis zooms in as n grows`}
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
        across={`top chart: the value itself (${unitShort}). Bottom chart: the average of one sample`}
        up={
          'top: how common each value is. Bottom: share of the 2,000 samples with that average'
        }
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={GreyBox}>the data (grey outline)</LegendItem>
        <LegendItem shape={AccentBox}>sample averages</LegendItem>
        <LegendItem shape={TriangleOutline}>average of everyone</LegendItem>
        {bell && <LegendItem shape={DashSwatch}>bell curve (dashed)</LegendItem>}
      </ul>

      <div className="mt-3">
        <Slider
          label="People in each sample"
          value={n}
          min={1}
          max={MAX_SLIDER}
          step={1}
          onChange={(v) => {
            setPlaying(false);
            setN(Math.round(v));
          }}
          format={(v) => String(Math.round(v))}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onPlay}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Toggle
          label="Show a bell curve for comparison"
          checked={bell}
          onChange={setBell}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setPlaying(false);
            setId('commute');
            setN(1);
            setBell(false);
            setSeed(DEFAULT_SEED);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
        {view.off > 0 && (
          <span className="text-xs text-muted">
            {view.off} average{view.off === 1 ? '' : 's'} off the edge of the chart.
          </span>
        )}
      </div>

      <Reading>
        {verdict}{' '}
        <span className="whitespace-nowrap text-muted">
          Distance from a bell: {view.gap === null ? '—' : view.gap.toFixed(2)}{' '}
          <span title="0 means a perfect bell">(0 means a perfect bell)</span>
        </span>
        <span className="mt-1 block">{NOTE[id]}</span>
      </Reading>
    </>
  );
}

export function CLTMachine() {
  return (
    <ClientOnly
      minHeight={780}
      label="Central limit machine: pick a data shape, grow the sample size and watch the averages become a bell"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
