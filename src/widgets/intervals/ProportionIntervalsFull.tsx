/** Full version of section 4 (poll + bulbs, batch sizes, below-0 and zero-width notes). Not used by the page right now; swap it back into the MDX to restore. */
import { useMemo, useState } from 'react';
import { bulbs, poll } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useMatrix } from '../sampling/useMatrix';
import { popMean } from '../sampling/sampling';
import {
  MAX_N_RATE,
  REPS,
  exactCoverage,
  proportionInterval,
  proportionSamples,
  zCrit,
  type RateInterval,
  type RateMethod,
} from './intervals';
import {
  IntervalStack,
  LegendItem,
  Reading,
  Skeleton,
  StackLegend,
  W,
  XAxis,
  f0,
  f1,
  makeScale,
  rate1,
  type StackRow,
} from './charts';
import { usePage } from './store';

type Id = 'poll' | 'bulbs';
const LEVEL = 0.95;
const SHOWN = 100;
const PITCH = 6;
const TOP = 40;
const H = TOP + SHOWN * PITCH + 62;
const BATCHES = [25, 50, 100, 250, 1000] as const;
const BATCH_OPTIONS = BATCHES.map((b) => ({ value: String(b), label: String(b) }));
const DEFAULT_N: Record<Id, number> = { poll: 100, bulbs: 50 };
const POP_OPTIONS = [
  { value: 'poll', label: 'Poll: 52% support' },
  { value: 'bulbs', label: 'Bulbs: 4% faulty' },
] as const;
const METHOD_OPTIONS = [
  { value: 'simple', label: 'Simple formula' },
  { value: 'wilson', label: 'Better formula (Wilson)' },
] as const;
const AXIS: Record<Id, { lo: number; hi: number; ticks: number[] }> = {
  poll: { lo: 0.1, hi: 0.9, ticks: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] },
  bulbs: { lo: 0, hi: 0.16, ticks: [0, 0.04, 0.08, 0.12, 0.16] },
};
const NOUN: Record<Id, { event: string; thing: string }> = {
  poll: { event: 'yes', thing: 'voters' },
  bulbs: { event: 'faulty', thing: 'bulbs' },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pctInt = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`);

const DotSwatch = <circle cx="9" cy="8" r="3" fill="var(--color-neg)" />;
const BelowSwatch = (
  <g>
    <rect
      x="3"
      y="4"
      width="12"
      height="8"
      fill="none"
      stroke="var(--color-neg)"
      strokeWidth="1.2"
    />
    <text x="5" y="11" fontSize="8" fill="var(--color-neg)">
      ◂
    </text>
  </g>
);

function Inner() {
  const { seed } = usePage();
  const [id, setId] = useState<Id>('bulbs');
  const [n, setN] = useState(DEFAULT_N.bulbs);
  const [method, setMethod] = useState<RateMethod>('simple');
  const [rounds, setRounds] = useState(1);

  const pop = useMemo(() => (id === 'poll' ? poll(seed) : bulbs(seed)), [id, seed]);
  const truth = useMemo(() => popMean(pop), [pop]);
  const matrix = useMatrix(pop, MAX_N_RATE, REPS, seed);
  const noun = NOUN[id];

  const ps = useMemo(
    () => (matrix ? proportionSamples(pop, n, REPS, seed) : null),
    [matrix, pop, n, seed],
  );

  const exact = useMemo(
    () => ({
      simple: exactCoverage(truth, n, LEVEL, 'simple'),
      wilson: exactCoverage(truth, n, LEVEL, 'wilson'),
    }),
    [truth, n],
  );

  const view = useMemo(() => {
    if (!ps) return null;
    const from = (rounds - 1) * SHOWN;
    const simple: RateInterval[] = [];
    const wilson: RateInterval[] = [];
    const ks: number[] = [];
    for (let r = from; r < from + SHOWN && r < ps.length; r++) {
      const k = Math.round(ps[r]! * n);
      ks.push(k);
      simple.push(proportionInterval(k, n, LEVEL, 'simple')!);
      wilson.push(proportionInterval(k, n, LEVEL, 'wilson')!);
    }
    const hit = (a: RateInterval[]) =>
      a.reduce((c, iv) => c + (iv.lo <= truth && truth <= iv.hi ? 1 : 0), 0);
    return {
      ks,
      simple,
      wilson,
      hitSimple: hit(simple),
      hitWilson: hit(wilson),
      below: simple.filter((iv) => iv.belowZero).length,
      zero: simple.filter((iv) => iv.degenerate).length,
    };
  }, [ps, rounds, n, truth]);

  if (!matrix || !view) return <Skeleton height={900} />;

  const ax = AXIS[id];
  const scale = makeScale(ax.lo, ax.hi);
  const shown = method === 'simple' ? view.simple : view.wilson;
  const rows: StackRow[] = shown.map((iv) => ({
    lo: Math.max(0, iv.lo),
    hi: Math.min(1, iv.hi),
    caught: iv.lo <= truth && truth <= iv.hi,
    below: method === 'simple' && iv.belowZero,
    dot: method === 'simple' && iv.degenerate,
  }));
  const total = rows.length;
  const first = shown[0]!;
  const k0 = view.ks[0]!;
  const atCap = rounds * SHOWN >= REPS;
  const z = zCrit(LEVEL);
  const pollMargin = z * Math.sqrt((truth * (1 - truth)) / n) * 100;

  const what = id === 'poll' ? 'people said yes' : 'bulbs were faulty';
  const worked = (() => {
    const head = `Batch 1: ${k0} of ${n} ${what}`;
    if (method === 'simple' && first.degenerate)
      return `${head}. The simple formula answers "${rate1(first.pHat)}, give or take 0", as if it were certain. With so few events, it cannot be.`;
    return `${head}, so ${rate1(first.pHat)}. Plausible range: ${rate1(clamp01(first.lo))} to ${rate1(clamp01(first.hi))}.${
      first.belowZero
        ? ' The simple formula reached below 0%, which is impossible, so it is cut at 0%.'
        : ''
    }`;
  })();

  const summary = `${method === 'simple' ? 'Simple' : 'Wilson'} 95% intervals from batches of ${n}: ${
    method === 'simple' ? view.hitSimple : view.hitWilson
  } of ${total} caught the true rate of ${rate1(truth)}.`;

  const pick = (next: Id) => {
    setId(next);
    setN(DEFAULT_N[next]);
    setRounds(1);
  };

  return (
    <>
      <SegmentedControl
        label="Population"
        options={POP_OPTIONS}
        value={id}
        onChange={(v) => pick(v)}
      />
      <div className="mt-3">
        <SegmentedControl
          label={`${noun.thing === 'voters' ? 'People asked' : 'Bulbs checked'} per batch`}
          options={BATCH_OPTIONS}
          value={String(n)}
          onChange={(v) => setN(Number(v))}
        />
      </div>
      <div className="mt-3">
        <SegmentedControl
          label="Method"
          options={METHOD_OPTIONS}
          value={method}
          onChange={(v) => setMethod(v)}
        />
      </div>

      <p className="m-0 mt-3 rounded-md border-l-4 border-accent bg-bg px-3 py-2 text-sm">
        {worked}
      </p>
      <p className="m-0 mt-2 text-xs text-muted">
        Each bar below is one batch&rsquo;s plausible range. We know the true rate (dashed
        line), so we can see which bars caught it.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Stack of ${total} intervals for a yes/no rate over the true rate of ${rate1(truth)}. ${summary}`}
      >
        <text x="14" y="20" fontSize="16" fill="var(--color-muted)">
          {total} batches of {n} {noun.thing}, {method === 'simple' ? 'simple' : 'Wilson'}{' '}
          intervals
        </text>
        <IntervalStack
          rows={rows}
          scale={scale}
          truth={truth}
          top={TOP}
          pitch={PITCH}
          truthLabel={`True rate ${rate1(truth)}`}
        />
        <XAxis
          scale={scale}
          y={TOP + SHOWN * PITCH + 10}
          ticks={ax.ticks}
          fmt={(v) => `${Math.round(v * 100)}%`}
          label={id === 'poll' ? 'share who say yes' : 'share faulty'}
        />
      </svg>
      <StackLegend
        extra={
          method === 'simple' ? (
            <>
              <LegendItem shape={DotSwatch}>dot: claims no uncertainty</LegendItem>
              <LegendItem shape={BelowSwatch}>◂ outline: cut off at 0%</LegendItem>
            </>
          ) : null
        }
      />
      {method === 'simple' && (view.below > 0 || view.zero > 0) && (
        <p className="m-0 mt-2 text-xs text-muted">
          {view.zero > 0 && (
            <>
              {view.zero} of {total} batches found 0 {id === 'poll' ? 'yes' : 'faulty'},
              so the simple formula drew a dot: no uncertainty, which is wrong.{' '}
            </>
          )}
          {view.below > 0 && <>{view.below} reached below 0% and were cut off at 0%.</>}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric
          label="Simple formula caught the truth in"
          value={`${view.hitSimple} of ${total}`}
          hint={`over many batches it really catches about ${pctInt(exact.simple)}`}
          tone={method === 'simple' ? 'accent' : 'ink'}
          wrap
        />
        <Metric
          label="Better formula (Wilson) caught it in"
          value={`${view.hitWilson} of ${total}`}
          hint={`over many batches it really catches about ${pctInt(exact.wilson)}`}
          tone={method === 'wilson' ? 'accent' : 'ink'}
          wrap
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={atCap}
          onClick={() => setRounds((r) => r + 1)}
        >
          Draw 100 batches
        </Button>
        <Button
          onClick={() => {
            setId('bulbs');
            setN(DEFAULT_N.bulbs);
            setMethod('simple');
            setRounds(1);
          }}
        >
          Reset
        </Button>
        {atCap && (
          <span className="text-xs text-muted">
            All prepared batches drawn. Press Reset.
          </span>
        )}
      </div>

      <Reading>
        {id === 'poll' && (
          <>
            {f0(truth * 100)}% give or take {f1(pollMargin)} points.{' '}
          </>
        )}
        A 95% method should catch the truth in about 95 of 100 batches.{' '}
        {(exact.simple ?? 1) < 0.9 ? (
          <>
            The simple formula caught it in {view.hitSimple}, and over many batches only
            about {pctInt(exact.simple)}. The better formula caught it in {view.hitWilson}
            .
          </>
        ) : (
          <>
            Here both formulas do their job: {view.hitSimple} and {view.hitWilson} of{' '}
            {total}. With plenty of events, the simple one is fine.
          </>
        )}
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function ProportionIntervalsFull() {
  return (
    <ClientOnly
      minHeight={1100}
      label="Yes/no rates: stack intervals for polls and defect rates and compare two formulas"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
