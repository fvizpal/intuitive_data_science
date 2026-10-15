import { useMemo, useState } from 'react';
import { bulbs } from '../../lib/populations';
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
  type RateInterval,
  type RateMethod,
} from './intervals';
import {
  IntervalStack,
  Reading,
  Skeleton,
  StackLegend,
  W,
  XAxis,
  makeScale,
  rate1,
  type StackRow,
} from './charts';
import { usePage } from './store';

/** Simple version of section 4: faulty bulbs, batches of 50, one choice of formula. */
const N = 50;
const LEVEL = 0.95;
const SHOWN = 100;
const PITCH = 6;
const TOP = 40;
const H = TOP + SHOWN * PITCH + 62;
const METHOD_OPTIONS = [
  { value: 'simple', label: 'Simple formula' },
  { value: 'wilson', label: 'Better formula' },
] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pctInt = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`);

function Inner() {
  const { seed } = usePage();
  const [method, setMethod] = useState<RateMethod>('simple');
  const [rounds, setRounds] = useState(1);

  const pop = useMemo(() => bulbs(seed), [seed]);
  const truth = useMemo(() => popMean(pop), [pop]);
  const matrix = useMatrix(pop, MAX_N_RATE, REPS, seed);
  const ps = useMemo(
    () => (matrix ? proportionSamples(pop, N, REPS, seed) : null),
    [matrix, pop, seed],
  );
  const exact = useMemo(
    () => ({
      simple: exactCoverage(truth, N, LEVEL, 'simple'),
      wilson: exactCoverage(truth, N, LEVEL, 'wilson'),
    }),
    [truth],
  );

  const view = useMemo(() => {
    if (!ps) return null;
    const from = (rounds - 1) * SHOWN;
    const ks: number[] = [];
    const simple: RateInterval[] = [];
    const wilson: RateInterval[] = [];
    for (let r = from; r < from + SHOWN && r < ps.length; r++) {
      const k = Math.round(ps[r]! * N);
      ks.push(k);
      simple.push(proportionInterval(k, N, LEVEL, 'simple')!);
      wilson.push(proportionInterval(k, N, LEVEL, 'wilson')!);
    }
    const hit = (a: RateInterval[]) =>
      a.reduce((c, iv) => c + (iv.lo <= truth && truth <= iv.hi ? 1 : 0), 0);
    return { ks, simple, wilson, hitSimple: hit(simple), hitWilson: hit(wilson) };
  }, [ps, rounds, truth]);

  if (!matrix || !view) return <Skeleton height={800} />;

  const scale = makeScale(0, 0.16);
  const shown = method === 'simple' ? view.simple : view.wilson;
  const rows: StackRow[] = shown.map((iv) => ({
    lo: Math.max(0, iv.lo),
    hi: Math.min(1, iv.hi),
    caught: iv.lo <= truth && truth <= iv.hi,
  }));
  const total = rows.length;
  const first = shown[0]!;
  const atCap = rounds * SHOWN >= REPS;
  const hits = method === 'simple' ? view.hitSimple : view.hitWilson;
  const summary = `${method === 'simple' ? 'Simple' : 'Better'} formula, batches of ${N} bulbs: ${hits} of ${total} intervals caught the true rate of ${rate1(truth)}.`;

  return (
    <>
      <p className="m-0 rounded-md border-l-4 border-accent bg-bg px-3 py-2 text-sm">
        Batch 1: {view.ks[0]} of {N} bulbs were faulty, so {rate1(first.pHat)}. Plausible
        range: {rate1(clamp01(first.lo))} to {rate1(clamp01(first.hi))}.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Stack of ${total} intervals for the share of faulty bulbs. ${summary}`}
      >
        <text x="14" y="20" fontSize="16" fill="var(--color-muted)">
          {total} batches of {N} bulbs
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
          ticks={[0, 0.04, 0.08, 0.12, 0.16]}
          fmt={(v) => `${Math.round(v * 100)}%`}
          label="share faulty"
        />
      </svg>
      <StackLegend />

      <div className="mt-3">
        <SegmentedControl
          label="Formula"
          options={METHOD_OPTIONS}
          value={method}
          onChange={(v) => setMethod(v)}
        />
      </div>
      <div className="mt-3">
        <Metric
          label="Caught the truth in"
          value={`${hits} of ${total}`}
          hint={`over many batches this formula really catches about ${pctInt(method === 'simple' ? exact.simple : exact.wilson)}`}
          tone="accent"
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
        A 95% method should catch the truth in about 95 of 100 batches. The{' '}
        {method === 'simple' ? 'simple' : 'better'} formula caught it in {hits}.
        {method === 'simple' && (exact.simple ?? 1) < 0.9 && (
          <> Over many batches it manages only about {pctInt(exact.simple)}.</>
        )}
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function ProportionIntervals() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Faulty bulbs: stack intervals and compare the simple and better formulas"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
