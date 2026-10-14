import { useMemo, useState } from 'react';
import { commute } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import {
  AVG_STROKE,
  EveryoneLine,
  EveryoneMark,
  LegendItem,
  GreyBox,
  POP_FILL,
  POP_STROKE,
  ChartKey,
  Reading,
  SampleMark,
  Skeleton,
  TriangleFilled,
  TriangleOutline,
  W,
  XAxis,
  f1,
  makeScale,
  niceMax,
} from './charts';
import { MAX_N, REPS, binCounts, meansForN, popMean } from './sampling';
import { pageActions, usePage } from './store';
import { useMatrix } from './useMatrix';

const H = 306;
const HIST_BASE = 150;
const HIST_H = 104;
const STRIP_BASE = 240;
const TRI_Y = 250;
const DEFAULT_N = 25;
const LO = 0;
const HI = 120;
const BIN = 5;

function Inner() {
  const { seed } = usePage();
  const [n, setN] = useState(DEFAULT_N);
  const [count, setCount] = useState(0);

  const pop = useMemo(() => commute(seed), [seed]);
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const m = useMemo(() => popMean(pop), [pop]);
  const hist = useMemo(() => {
    const { counts } = binCounts(pop, LO, HI, BIN);
    const top = niceMax(Math.max(...counts) / pop.length);
    return { counts, top };
  }, [pop]);

  if (!matrix) return <Skeleton height={520} />;

  const scale = makeScale(LO, HI);
  const row = count - 1;
  const values = count > 0 ? matrix.sampleValues(row, n) : [];
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const means = meansForN(matrix, n);
  const recent: number[] = [];
  if (means) for (let r = Math.max(0, count - 10); r < count; r++) recent.push(means[r]!);

  const barW = scale.x(LO + BIN) - scale.x(LO);
  const buckets = new Map<number, number>();
  const dots = values.map((v) => {
    const key = Math.round(scale.x(v) / 7);
    const level = Math.min(5, buckets.get(key) ?? 0);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    return { cx: scale.x(v), cy: STRIP_BASE - 5 - level * 8 };
  });

  const off = avg === null ? null : Math.abs(avg - m);
  const lo = recent.length ? Math.min(...recent) : 0;
  const hi = recent.length ? Math.max(...recent) : 0;
  const sampleLeft = avg !== null && avg < m;
  const atCap = count >= REPS;

  const summary =
    avg === null
      ? `No sample drawn yet. Everyone averages ${f1(m)} minutes.`
      : `Sample number ${count} of ${n} people: average ${f1(avg)} minutes. Everyone averages ${f1(m)}.`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${pop.length.toLocaleString('en-US')} commute times with one sample of ${n} people shown as dots below it. ${summary}`}
      >
        <text x="14" y="18" fontSize="16" fill="var(--color-muted)">
          Everyone: {pop.length.toLocaleString('en-US')} commutes (the population)
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
        <text x={W - 14} y="198" fontSize="16" textAnchor="end" fill="var(--color-muted)">
          minutes
        </text>
        <text x="14" y="198" fontSize="16" fill="var(--color-muted)">
          {count > 0
            ? `Your sample: ${n} people picked at random`
            : 'Your sample will appear here'}
        </text>
        <line
          x1={14}
          x2={W - 14}
          y1={STRIP_BASE}
          y2={STRIP_BASE}
          stroke="var(--color-grid)"
        />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r="3.4"
            fill="color-mix(in srgb, var(--color-accent) 55%, transparent)"
            stroke={AVG_STROKE}
            strokeWidth="1"
          />
        ))}
        <EveryoneLine x={scale.x(m)} top={26} bottom={TRI_Y} />
        <EveryoneMark x={scale.x(m)} y={TRI_Y} />
        {avg !== null && <SampleMark x={scale.x(avg)} y={TRI_Y} />}
        <text
          x={scale.x(m) + (sampleLeft ? 12 : -12)}
          y={TRI_Y + 26}
          fontSize="16"
          fontWeight="600"
          textAnchor={sampleLeft ? 'start' : 'end'}
          fill="var(--color-ink)"
        >
          Everyone {f1(m)}
        </text>
        <text
          x={scale.x(m) + (sampleLeft ? 12 : -12)}
          y={TRI_Y + 44}
          fontSize="13"
          textAnchor={sampleLeft ? 'start' : 'end'}
          fill="var(--color-muted)"
        >
          population average
        </text>
        {avg !== null && (
          <>
            <text
              x={scale.x(avg) + (sampleLeft ? -12 : 12)}
              y={TRI_Y + 26}
              fontSize="16"
              fontWeight="600"
              textAnchor={sampleLeft ? 'end' : 'start'}
              fill="var(--color-ink)"
            >
              Your sample {f1(avg)}
            </text>
            <text
              x={scale.x(avg) + (sampleLeft ? -12 : 12)}
              y={TRI_Y + 44}
              fontSize="13"
              textAnchor={sampleLeft ? 'end' : 'start'}
              fill="var(--color-muted)"
            >
              sample average
            </text>
          </>
        )}
      </svg>
      <ChartKey
        across={'minutes of one commute'}
        up={
          'grey bars: how many of everyone have that commute. Dots: the people in your sample'
        }
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={GreyBox}>everyone (grey outline)</LegendItem>
        <LegendItem shape={TriangleOutline}>average of everyone</LegendItem>
        <LegendItem shape={TriangleFilled}>average of your sample</LegendItem>
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={atCap} onClick={() => setCount((c) => c + 1)}>
          Draw a sample
        </Button>
        <Button disabled={atCap} onClick={() => setCount((c) => Math.min(REPS, c + 10))}>
          Draw 10 more
        </Button>
      </div>

      <div className="mt-3">
        <Slider
          label="People in each sample"
          value={n}
          min={5}
          max={200}
          step={1}
          onChange={(v) => setN(Math.round(v))}
          format={(v) => String(Math.round(v))}
        />
      </div>

      <div className="mt-3 text-sm">
        <span className="text-muted">
          Last {Math.min(10, count) || 10} sample averages (min):{' '}
        </span>
        {recent.length === 0 ? (
          <span className="text-muted">none yet</span>
        ) : (
          <ul className="m-0 inline-flex list-none flex-wrap gap-1.5 p-0 align-middle">
            {recent.map((v, i) => {
              const latest = i === recent.length - 1;
              return (
                <li
                  key={count - recent.length + i}
                  className={`rounded-full border px-2 py-0.5 font-mono text-xs tabular-nums ${
                    latest ? 'border-accent bg-accent text-bg' : 'border-grid'
                  }`}
                >
                  {latest ? '▲ ' : ''}
                  {f1(v)}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setN(DEFAULT_N);
            setCount(0);
            pageActions.resetSeed();
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
            All {REPS} prepared samples drawn. Press Reset.
          </span>
        )}
      </div>

      <Reading>
        {avg === null || off === null ? (
          <>
            No sample yet. Press <strong>Draw a sample</strong>. Everyone averages {f1(m)}{' '}
            min.
          </>
        ) : (
          <>
            This sample averaged {f1(avg)} min. Everyone averages {f1(m)}. Off by{' '}
            {f1(off)} min.
            {count >= 3 && (
              <>
                {' '}
                Your last {recent.length} averages ranged from {f1(lo)} to {f1(hi)}.
              </>
            )}
          </>
        )}
      </Reading>
    </>
  );
}

export function DrawSamples() {
  return (
    <ClientOnly
      minHeight={580}
      label="Draw samples: pick people from a city of commuters and see that each sample has a different average"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
