import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { BandChip, Legend, PairHistogram, Reading } from './charts';
import {
  HIST_HI,
  HIST_LO,
  HIST_TICKS,
  baselineBars,
  getBaseline,
  getToday,
  mean,
  slicedPsi,
  todayBars,
} from './data';
import type { EdgeMethod } from './data';
import { fmtPct1, fmtPsi } from './format';
import { pageActions, usePage } from './store';
import type { Scenario } from './store';

const METHODS: { id: EdgeMethod; title: string; plain: string }[] = [
  {
    id: 'count',
    title: 'Equal-count slices',
    plain: 'each held the same share at build time',
  },
  {
    id: 'width',
    title: 'Equal-width slices',
    plain: 'each covers the same score range',
  },
];
const SIZES = [5, 10, 20] as const;
const TINY = 0.01;
const AXIS = { lo: HIST_LO, hi: HIST_HI, ticks: HIST_TICKS };

interface Pick {
  method: EdgeMethod;
  k: (typeof SIZES)[number];
}

function Binning() {
  const { seed, shift, spreadMult, newSegmentShare } = usePage();
  const scenario = useMemo<Scenario>(
    () => ({ shift, spreadMult, newSegmentShare }),
    [shift, spreadMult, newSegmentShare],
  );
  const [pick, setPick] = useState<Pick>({ method: 'count', k: 10 });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const cells = useMemo(
    () =>
      METHODS.map((m) =>
        SIZES.map((k) => ({
          method: m.id,
          k,
          sliced: slicedPsi(seed, scenario, m.id, k),
        })),
      ),
    [seed, scenario],
  );
  const values = cells.flat().map((c) => c.sliced.result?.total ?? null);
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = finite.length ? Math.min(...finite) : null;
  const hi = finite.length ? Math.max(...finite) : null;

  const sel = cells.flat().find((c) => c.method === pick.method && c.k === pick.k)!;
  const exp = sel.sliced.expected;
  const tiny = exp.map((e) => e < TINY);
  const tinyCount = tiny.filter(Boolean).length;
  const contributions = sel.sliced.result?.contributions ?? [];
  const baseMean = mean(getBaseline(seed));
  const todayMean = mean(getToday(seed, scenario));

  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    let nr = r;
    let nc = c;
    if (e.key === 'ArrowRight') nc = Math.min(SIZES.length - 1, c + 1);
    else if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') nr = Math.min(METHODS.length - 1, r + 1);
    else if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
    else return;
    e.preventDefault();
    setPick({ method: METHODS[nr]!.id, k: SIZES[nc]! });
    refs.current[nr * SIZES.length + nc]?.focus();
  };

  const range =
    lo === null || hi === null
      ? 'There is no data to compare.'
      : `Same data, PSI between ${fmtPsi(lo)} and ${fmtPsi(hi)} depending on slicing.`;

  return (
    <>
      <div role="group" aria-label="PSI for each way of slicing the scores">
        {METHODS.map((m, r) => (
          <div key={m.id} className={r ? 'mt-3' : ''}>
            <p className="m-0 mb-1 text-sm">
              <span className="font-semibold">{m.title}</span>{' '}
              <span className="text-muted">({m.plain})</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map((k, c) => {
                const cell = cells[r]![c]!;
                const v = cell.sliced.result?.total ?? null;
                const on = pick.method === m.id && pick.k === k;
                const tinyHere = cell.sliced.expected.some((e) => e < TINY);
                return (
                  <button
                    key={k}
                    ref={(el) => {
                      refs.current[r * SIZES.length + c] = el;
                    }}
                    type="button"
                    aria-pressed={on}
                    tabIndex={on ? 0 : -1}
                    aria-label={`${m.title}, ${k} slices: PSI ${fmtPsi(v)}${tinyHere ? ', includes a tiny slice' : ''}`}
                    onClick={() => setPick({ method: m.id, k })}
                    onFocus={() => setPick({ method: m.id, k })}
                    onKeyDown={(e) => onKey(e, r, c)}
                    className={`flex min-h-[5.5rem] flex-col items-start gap-1 rounded-md border-2 px-2 py-2 text-left transition-colors ${
                      on
                        ? 'border-accent bg-bg'
                        : 'border-grid bg-surface hover:border-accent'
                    }`}
                  >
                    <span className="text-xs text-muted">{k} slices</span>
                    <span className="font-mono text-xl font-semibold tabular-nums">
                      {fmtPsi(v)}
                    </span>
                    <BandChip value={v} />
                    {tinyHere && (
                      <span className="text-[11px] text-muted">▲ has a tiny slice</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="m-0 mt-3 text-sm font-semibold">{range}</p>

      <h4 className="mb-1 mt-4 text-sm font-semibold">
        Selected: {METHODS.find((m) => m.id === pick.method)!.title.toLowerCase()},{' '}
        {pick.k} slices
      </h4>
      <PairHistogram
        base={baselineBars(seed)}
        today={todayBars(seed, scenario)}
        axis={AXIS}
        yMax={1400}
        height={310}
        baseMean={baseMean}
        todayMean={todayMean}
        edges={sel.sliced.edges}
        contributions={contributions}
        tiny={tiny}
        ariaLabel={`Histogram of build-time and today's scores cut into ${pick.k} ${pick.method === 'count' ? 'equal-count' : 'equal-width'} slices. PSI ${fmtPsi(sel.sliced.result?.total ?? null)}.`}
      />
      <Legend />
      <p className="m-0 mt-1 text-xs text-muted">
        Dashed lines are the slice edges. Orange bars show what each slice adds to PSI.
        {tinyCount > 0 && ' ▲ marks a tiny slice.'}
      </p>
      {tinyCount > 0 && (
        <p className="m-0 mt-2 text-sm">
          <span aria-hidden="true">▲ </span>
          <strong>Tiny slice: PSI gets jumpy here.</strong> {tinyCount}{' '}
          {tinyCount === 1 ? 'slice holds' : 'slices hold'} under 1% of build-time
          applicants (
          {exp
            .map((e, i) => (e < TINY ? `slice ${i + 1}: ${fmtPct1(e)}` : null))
            .filter(Boolean)
            .join(', ')}
          ), so a handful of applicants can move it a lot.
        </p>
      )}

      <div className="mt-4">
        <Slider
          label="How far the average score moved (points)"
          value={shift}
          min={-60}
          max={60}
          step={5}
          onChange={pageActions.setShift}
          format={(v) => (v > 0 ? `+${v}` : String(v))}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        <Button
          onClick={() => {
            pageActions.reset();
            setPick({ method: 'count', k: 10 });
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>
        {range} The selected one, {pick.k}{' '}
        {pick.method === 'count' ? 'equal-count' : 'equal-width'} slices, gives{' '}
        <strong>{fmtPsi(sel.sliced.result?.total ?? null)}</strong>.
        {tinyCount === 0 ? ' No slice is tiny.' : ''}
      </Reading>
    </>
  );
}

export function BinningMatters() {
  return (
    <ClientOnly
      minHeight={820}
      label="Binning matters: the same data under six ways of slicing the scores"
    >
      {() => <Binning />}
    </ClientOnly>
  );
}
