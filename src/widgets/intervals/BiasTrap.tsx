import { useMemo, useState } from 'react';
import { commute, stationCommuters } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { useMatrix } from '../sampling/useMatrix';
import { binCounts, popMean } from '../sampling/sampling';
import {
  MAX_N,
  REPS,
  intervalStatsForN,
  intervalsFromStats,
  meanRange,
} from './intervals';
import {
  AVG_FILL,
  AVG_STROKE,
  IntervalStack,
  POP_STROKE,
  Reading,
  Skeleton,
  StackLegend,
  TickRow,
  W,
  XAxis,
  f1,
  makeNList,
  makeScale,
  nearestIndex,
  type StackRow,
} from './charts';
import { usePage } from './store';

const SHOWN = 100;
const PITCH = 6;
const HIST_BASE = 120;
const HIST_H = 84;
const BIN = 2;
const TOP = 208;
const H = TOP + SHOWN * PITCH + 62;
const LO = 0;
const HI = 60;
const LEVEL = 0.95;
const TICKS = [10, 25, 50, 100, 200, 400, 800];
const N_LIST = makeNList(10, MAX_N, TICKS);
const DEFAULT_N = 100;

function Inner() {
  const { seed } = usePage();
  const [biased, setBiased] = useState(false);
  const [n, setN] = useState(DEFAULT_N);
  const [rounds, setRounds] = useState(1);

  const full = useMemo(() => commute(seed), [seed]);
  const station = useMemo(() => stationCommuters(full), [full]);
  const truth = useMemo(() => popMean(full), [full]);
  const cutoff = useMemo(() => Math.max(...station), [station]);
  const hist = useMemo(() => {
    const { counts } = binCounts(full, LO, HI, BIN);
    return { counts, top: Math.max(...counts) };
  }, [full]);
  const pop = biased ? station : full;
  const matrix = useMatrix(pop, MAX_N, REPS, seed);

  const set = useMemo(() => {
    if (!matrix) return null;
    return intervalsFromStats(intervalStatsForN(pop, n, REPS, seed), LEVEL, truth);
  }, [matrix, pop, n, seed, truth]);

  if (!matrix || !set) return <Skeleton height={900} />;

  const from = (rounds - 1) * SHOWN;
  const to = Math.min(REPS, from + SHOWN);
  const total = to - from;
  let caught = 0;
  const rows: StackRow[] = [];
  for (let r = from; r < to; r++) {
    caught += set.caught[r]!;
    rows.push({ lo: set.lo[r]!, hi: set.hi[r]!, caught: set.caught[r] === 1 });
  }
  const centre = meanRange(
    Float64Array.from(
      { length: total },
      (_, i) => (set.lo[from + i]! + set.hi[from + i]!) / 2,
    ),
  )!;
  const half = meanRange(set.half, from, to)!;
  const scale = makeScale(LO, HI);
  const atCap = rounds * SHOWN >= REPS;

  const summary = `${biased ? '3 pm calls only' : 'Everyone'}, ${n} people: ${caught} of ${total} intervals caught the true average of ${f1(truth)} minutes. Typical margin ${f1(half)} minutes.`;

  return (
    <>
      <Toggle
        label="Phone people at 3 pm only"
        checked={biased}
        onChange={(b) => {
          setBiased(b);
          setRounds(1);
        }}
      />
      <p className="m-0 text-xs text-muted">
        {biased
          ? 'Only people already home answer: the 60% with the shorter commutes. The rest are still on the road.'
          : 'Everyone is equally likely to be asked.'}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Stack of ${total} intervals over the true average of ${f1(truth)} minutes. ${summary}`}
      >
        <text x="14" y="20" fontSize="16" fill="var(--color-muted)">
          Everyone&rsquo;s commutes (taller bar = more people)
        </text>
        {Array.from(hist.counts, (c, i) => {
          const lo = LO + i * BIN;
          const asked = !biased || lo < cutoff;
          const bh = (c / hist.top) * HIST_H;
          const x = scale.x(lo);
          const w = scale.x(lo + BIN) - x;
          return (
            <rect
              key={i}
              x={x + 0.4}
              y={HIST_BASE - bh}
              width={Math.max(0, w - 0.8)}
              height={bh}
              fill={asked ? AVG_FILL : 'none'}
              stroke={asked ? AVG_STROKE : POP_STROKE}
              strokeWidth="1"
              strokeDasharray={asked ? undefined : '3 2'}
            />
          );
        })}
        <XAxis
          scale={scale}
          y={HIST_BASE}
          ticks={[0, 10, 20, 30, 40, 50, 60]}
          label="minutes of commute"
        />
        {biased && (
          <>
            <text
              x={scale.x(cutoff / 2)}
              y={44}
              fontSize="15"
              fontWeight="600"
              textAnchor="middle"
              fill="var(--color-ink)"
            >
              reached
            </text>
            <text
              x={Math.min(scale.x(cutoff + 14), 560)}
              y={44}
              fontSize="15"
              fontWeight="600"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              never reached
            </text>
          </>
        )}
        <text x="14" y={TOP - 36} fontSize="16" fill="var(--color-muted)">
          {total} samples of {n} people, each with its 95% interval
        </text>
        <IntervalStack
          rows={rows}
          scale={scale}
          truth={truth}
          top={TOP}
          pitch={PITCH}
          truthLabel={`Truth ${f1(truth)}`}
        />
        <XAxis
          scale={scale}
          y={TOP + SHOWN * PITCH + 10}
          ticks={[0, 10, 20, 30, 40, 50, 60]}
          label="minutes: each bar is one plausible range"
        />
      </svg>
      <StackLegend />

      <div className="mt-3">
        <Slider
          label="People in each sample"
          value={nearestIndex(N_LIST, n)}
          min={0}
          max={N_LIST.length - 1}
          step={1}
          onChange={(v) => setN(N_LIST[Math.round(v)] ?? DEFAULT_N)}
          format={(v) => String(N_LIST[Math.round(v)] ?? '')}
        />
        <TickRow list={N_LIST} ticks={TICKS} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric
          label="Answer you would report"
          value={`${f1(centre)} min`}
          hint="where the intervals are centred"
          tone={biased ? 'neg' : 'accent'}
          wrap
        />
        <Metric
          label="True average of everyone"
          value={`${f1(truth)} min`}
          hint="what you were after"
          wrap
        />
        <Metric
          label="Intervals that caught it"
          value={`${caught} of ${total}`}
          hint={`typical margin ± ${f1(half)} min`}
          tone={biased ? 'neg' : 'accent'}
          wrap
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={atCap}
          onClick={() => setRounds((r) => r + 1)}
        >
          Draw 100 samples
        </Button>
        <Button
          onClick={() => {
            setBiased(false);
            setN(DEFAULT_N);
            setRounds(1);
          }}
        >
          Reset
        </Button>
        {atCap && (
          <span className="text-xs text-muted">
            All prepared samples drawn. Press Reset.
          </span>
        )}
      </div>

      <Reading>
        {biased ? (
          <>
            Phoning only at 3 pm: {caught} of {total} intervals caught the true average.
            You would report about {f1(centre)} min, but the truth is {f1(truth)}. The
            intervals are tight (± {f1(half)} min), so they look sure. They are sure of
            the wrong thing: people with long commutes were never asked.{' '}
            {n >= 100
              ? 'More people only made the wrong answer more certain.'
              : 'Now raise the sample size and watch the bars shrink around the wrong spot.'}
          </>
        ) : (
          <>
            Asking everyone: {caught} of {total} intervals caught the truth. You would
            report about {f1(centre)} min and the truth is {f1(truth)}. Now turn on the 3
            pm calls.
          </>
        )}
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function BiasTrap() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Bias trap: a bigger sample from the wrong group is confidently wrong"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
