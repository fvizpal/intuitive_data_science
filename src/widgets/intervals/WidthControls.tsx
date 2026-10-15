import { useMemo, useState } from 'react';
import { POP_META, getPopulation } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { useMatrix } from '../sampling/useMatrix';
import { binCounts, popMean, popSd } from '../sampling/sampling';
import {
  MAX_N,
  REPS,
  individualRange,
  intervalStatsForN,
  intervalsFromStats,
  meanRange,
  tCrit,
} from './intervals';
import {
  ChartKey,
  LevelPills,
  POP_FILL,
  POP_STROKE,
  Reading,
  Skeleton,
  TickRow,
  W,
  XAxis,
  f0,
  f1,
  f2,
  levelText,
  makeNList,
  makeScale,
  nearestIndex,
  niceMax,
} from './charts';
import { pageActions, usePage } from './store';

const IDS = ['commute', 'cricket'] as const;
type Id = (typeof IDS)[number];
const OPTIONS = IDS.map((id) => ({ value: id, label: POP_META[id].label }));
const NOUN: Record<Id, string> = {
  commute: 'commuters take',
  cricket: 'innings score',
};

const TICKS = [10, 25, 50, 100, 200, 400, 800];
const N_LIST = makeNList(10, MAX_N, TICKS);
const DEFAULT_N = 25;
const H = 322;
const HIST_BASE = 112;
const HIST_H = 80;
const LO = 0;
const HI_BY: Record<Id, number> = { commute: 120, cricket: 200 };
const TICKS_BY: Record<Id, number[]> = {
  commute: [0, 20, 40, 60, 80, 100, 120],
  cricket: [0, 40, 80, 120, 160, 200],
};

function Inner() {
  const { seed, level } = usePage();
  const [id, setId] = useState<Id>('commute');
  const [n, setN] = useState(DEFAULT_N);

  const pop = useMemo(() => getPopulation(id, seed), [id, seed]);
  const meta = POP_META[id];
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const mu = useMemo(() => popMean(pop), [pop]);
  const sigma = useMemo(() => popSd(pop), [pop]);
  const hist = useMemo(() => {
    const { counts } = binCounts(pop, LO, HI_BY[id], meta.binWidth);
    return { counts, top: niceMax(Math.max(...counts) / pop.length) };
  }, [pop, id, meta.binWidth]);
  const indiv = useMemo(() => individualRange(pop, level), [pop, level]);

  const margin = (k: number, l: number): number | null => {
    if (!matrix || k > MAX_N) return null;
    const set = intervalsFromStats(intervalStatsForN(pop, k, REPS, seed), l);
    return set ? meanRange(set.half) : null;
  };

  if (!matrix || !indiv) return <Skeleton height={640} />;

  const scale = makeScale(LO, HI_BY[id]);
  const barW = scale.x(LO + meta.binWidth) - scale.x(LO);
  const four = n * 4;
  const h = margin(n, level) ?? 0;
  const h4 = margin(four, level);
  const h95 = margin(n, 0.95) ?? 0;
  const h99 = margin(n, 0.99) ?? 0;
  const wider = h95 > 0 ? Math.round((h99 / h95 - 1) * 100) : 0;
  const theory = (tCrit(level, n - 1) * sigma) / Math.sqrt(n);
  const theory4 = (tCrit(level, four - 1) * sigma) / Math.sqrt(four);
  const maxHalf = Math.max((tCrit(0.99, 9) * sigma) / Math.sqrt(10), 1e-9);
  const unit = meta.unitShort;

  const aLo = scale.x(indiv.lo);
  const aHi = scale.x(indiv.hi);
  const bLo = scale.x(mu - h);
  const bHi = scale.x(mu + h);
  const marginX = 14 + (h / maxHalf) * (W - 28) * 0.98;

  const summary = `${n} people at ${levelText(level)}: typical margin ${f1(h)} ${unit}. ${levelText(level)} of ${meta.what}s fall between ${f0(indiv.lo)} and ${f0(indiv.hi)}; the average is pinned to ${f1(mu - h)} to ${f1(mu + h)}.`;

  return (
    <>
      <SegmentedControl
        label="Population"
        options={OPTIONS}
        value={id}
        onChange={(v) => setId(v)}
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${meta.label.toLowerCase()} with the range of individuals and the range of the average on the same axis. ${summary}`}
      >
        <text x="14" y="18" fontSize="16" fill="var(--color-muted)">
          Everyone: {meta.label.toLowerCase()} (sd {f1(sigma)} {unit})
        </text>
        {Array.from(hist.counts, (c, i) => {
          const bh = (c / pop.length / hist.top) * HIST_H;
          return (
            <rect
              key={i}
              x={scale.x(LO + i * meta.binWidth) + 0.5}
              y={HIST_BASE - bh}
              width={Math.max(0, barW - 1)}
              height={bh}
              fill={POP_FILL}
              stroke={POP_STROKE}
              strokeWidth="1.25"
            />
          );
        })}
        <XAxis scale={scale} y={HIST_BASE} ticks={TICKS_BY[id]} label={meta.unit} />

        <text x="14" y="176" fontSize="15" fill="var(--color-ink)">
          {levelText(level)} of {NOUN[id]} {f0(indiv.lo)} to {f0(indiv.hi)} {unit}
        </text>
        <path
          d={`M${aLo} 180V194M${aLo} 187H${aHi}M${aHi} 180V194`}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="3"
        />
        <text x="14" y="222" fontSize="15" fill="var(--color-ink)">
          The average is pinned to {f1(mu - h)} to {f1(mu + h)}
        </text>
        <path
          d={`M${bLo} 226V242M${bLo} 234H${bHi}M${bHi} 226V242`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
        />
        <line
          x1={scale.x(mu)}
          x2={scale.x(mu)}
          y1={HIST_BASE - HIST_H}
          y2="246"
          stroke="var(--color-ink)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text x="14" y="276" fontSize="15" fill="var(--color-ink)">
          Typical margin: ± {f1(h)} {unit}
        </text>
        <rect
          x="14"
          y="284"
          width={Math.max(2, marginX - 14)}
          height="12"
          fill="color-mix(in srgb, var(--color-accent) 70%, transparent)"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
        />
        <text x={W - 14} y="316" fontSize="13" textAnchor="end" fill="var(--color-muted)">
          bar scale: 0 to {f0(maxHalf)} {unit}
        </text>
      </svg>
      <ChartKey
        across={`${meta.unit}`}
        up={
          'grey bars: how many of everyone have that value. Grey bar: individuals. Blue bar: the average'
        }
      />

      <div className="mt-3">
        <Slider
          label="People in the sample"
          value={nearestIndex(N_LIST, n)}
          min={0}
          max={N_LIST.length - 1}
          step={1}
          onChange={(v) => setN(N_LIST[Math.round(v)] ?? DEFAULT_N)}
          format={(v) => String(N_LIST[Math.round(v)] ?? '')}
        />
        <TickRow list={N_LIST} ticks={TICKS} />
      </div>
      <div className="mt-3">
        <LevelPills level={level} onChange={pageActions.setLevel} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric
          label="Typical margin (average of 2,000 samples)"
          value={`± ${f1(h)} ${unit}`}
          hint="how far the plausible range reaches each side"
          tone="accent"
          wrap
        />
        <Metric
          label="Theory: multiplier × spread ÷ √n"
          value={`± ${f1(theory)} ${unit}`}
          hint={`${f2(tCrit(level, n - 1))} × ${f1(sigma)} ÷ √${n}`}
          wrap
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={n >= MAX_N}
          onClick={() => setN(Math.min(MAX_N, n * 4))}
        >
          Jump to 4 times as many people
        </Button>
        <Button
          onClick={() => {
            setN(DEFAULT_N);
            setId('commute');
            pageActions.resetSeed();
            pageActions.setLevel(0.95);
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>
        With {n} people: typical margin {f1(h)} {unit}.{' '}
        {h4 !== null ? (
          <>
            With {four}: {f1(h4)}.
          </>
        ) : (
          <>
            4 times as many ({four}) would give about {f1(theory4)}.
          </>
        )}{' '}
        At 99% instead of 95%, margins are about {wider}% wider.
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function WidthControls() {
  return (
    <ClientOnly
      minHeight={820}
      label="Width controls: how people, spread and confidence level set the margin"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
