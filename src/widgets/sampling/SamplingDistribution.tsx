import { useMemo, useState } from 'react';
import { commute } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import {
  AVG_FILL,
  AVG_STROKE,
  AccentBox,
  EveryoneLine,
  EveryoneMark,
  LegendItem,
  PAD_L,
  ChartKey,
  Reading,
  ShareGrid,
  Skeleton,
  TriangleOutline,
  W,
  XAxis,
  f0,
  f1,
  makeScale,
  niceMax,
} from './charts';
import {
  MAX_N,
  REPS,
  bellGap,
  bellReading,
  binCounts,
  meansForN,
  popMean,
} from './sampling';
import { usePage } from './store';
import { useMatrix } from './useMatrix';

const N = 25;
const LO = 10;
const HI = 55;
const BIN = 0.5;
const H = 268;
const BASE = 206;
const PLOT_H = 168;
const ADDS = [1, 10, 100, 1000] as const;

const DROP_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .smp-drop { animation: smp-drop 0.5s cubic-bezier(0.3, 0.7, 0.4, 1) both; }
}
@keyframes smp-drop { from { transform: translateY(-150px); opacity: 0; } to { transform: none; opacity: 1; } }
`;

function Inner() {
  const { seed } = usePage();
  const [state, setState] = useState({ count: 0, added: 0 });
  const { count, added } = state;

  const pop = useMemo(() => commute(seed), [seed]);
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const m = useMemo(() => popMean(pop), [pop]);
  const means = matrix ? meansForN(matrix, N) : null;

  const view = useMemo(() => {
    if (!means) return null;
    const { counts, below, above } = binCounts(means, LO, HI, BIN, count);
    return { counts, off: below + above };
  }, [means, count]);

  if (!matrix || !means || !view) return <Skeleton height={400} />;

  const scale = makeScale(LO, HI);
  const nBins = view.counts.length;
  const binPx = scale.x(LO + BIN) - scale.x(LO);
  const maxStack = Math.max(0, ...view.counts);
  const asDots = maxStack * binPx <= PLOT_H;
  const yTop = niceMax(Math.max(maxStack, 4) * 1.15);

  const shown = means.subarray(0, count);
  const lo = count ? Math.min(...shown) : 0;
  const hi = count ? Math.max(...shown) : 0;
  const centre = count ? shown.reduce((a, b) => a + b, 0) / count : 0;
  const gap = count >= 100 ? bellGap(shown) : null;
  const reading = bellReading(gap);
  const bellNow = reading === 'close to a bell' || reading === 'getting there';
  const atCap = count >= REPS;

  const stack = new Int32Array(nBins);
  const dots: { key: number; cx: number; cy: number }[] = [];
  if (asDots) {
    for (let i = 0; i < count; i++) {
      const v = means[i]!;
      if (v < LO || v > HI) continue;
      const b = Math.min(nBins - 1, Math.floor((v - LO) / BIN));
      dots.push({
        key: i,
        cx: scale.x(LO + (b + 0.5) * BIN),
        cy: BASE - binPx * (stack[b]! + 0.5),
      });
      stack[b]!++;
    }
  }
  const animateFrom = added > 0 && added <= 10 ? count - added : Infinity;

  const summary = count
    ? `${count} samples of ${N} people: averages from ${f1(lo)} to ${f1(hi)}, centred on ${f1(centre)} minutes. Everyone averages ${f1(m)}.`
    : 'No samples yet.';

  return (
    <>
      <style>{DROP_CSS}</style>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Pile of sample averages, ${N} people per sample, axis ${LO} to ${HI} minutes. ${summary}`}
      >
        {!asDots && (
          <ShareGrid base={BASE} plotH={PLOT_H} yMax={yTop} fmt={(v) => `${f0(v)}`} />
        )}
        {asDots
          ? dots.map((d) => (
              <circle
                key={d.key}
                className={d.key >= animateFrom ? 'smp-drop' : undefined}
                cx={d.cx}
                cy={d.cy}
                r={Math.max(1.5, binPx / 2 - 0.4)}
                fill={AVG_FILL}
                stroke={AVG_STROKE}
                strokeWidth="1"
              />
            ))
          : Array.from(view.counts, (c, i) =>
              c > 0 ? (
                <rect
                  key={i}
                  x={scale.x(LO + i * BIN)}
                  y={BASE - (c / yTop) * PLOT_H}
                  width={Math.max(0, binPx - 0.6)}
                  height={(c / yTop) * PLOT_H}
                  fill={AVG_FILL}
                  stroke={AVG_STROKE}
                  strokeWidth="1"
                />
              ) : null,
            )}
        <EveryoneLine x={scale.x(m)} top={30} bottom={BASE} />
        <XAxis
          scale={scale}
          y={BASE}
          ticks={[10, 15, 20, 25, 30, 35, 40, 45, 50, 55]}
          label={`average of ${N} people, minutes`}
        />
        <EveryoneMark x={scale.x(m)} y={BASE - 14} />
        <text
          x={Math.min(W - 14, scale.x(m) + 10)}
          y={20}
          fontSize="16"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          Everyone {f1(m)}
        </text>
        <text x={PAD_L} y={20} fontSize="16" fill="var(--color-muted)">
          {asDots ? '1 dot = 1 sample' : 'number of samples per bar'}
        </text>
        {count === 0 && (
          <text
            x={W / 2}
            y={BASE - 70}
            fontSize="18"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            Press a Draw button to start the pile
          </text>
        )}
      </svg>
      <ChartKey
        across={`the average commute of one sample (${N} people), in minutes`}
        up={'each dot or bar is one sample: taller means more samples had that average'}
      />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <LegendItem shape={AccentBox}>
          one sample average (a sample of {N} people)
        </LegendItem>
        <LegendItem shape={TriangleOutline}>average of everyone</LegendItem>
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ADDS.map((k) => (
          <Button
            key={k}
            variant={k === 10 ? 'primary' : 'secondary'}
            disabled={atCap}
            onClick={() =>
              setState((s) => {
                const next = Math.min(REPS, s.count + k);
                return { count: next, added: next - s.count };
              })
            }
          >
            Draw {k.toLocaleString('en-US')}
          </Button>
        ))}
        <Button onClick={() => setState({ count: 0, added: 0 })}>Reset</Button>
        {atCap && (
          <span className="text-xs text-muted">All {REPS} prepared samples drawn.</span>
        )}
      </div>

      <Reading>
        {count === 0 ? (
          <>
            No samples yet. Everyone averages {f1(m)} min. Press <strong>Draw 10</strong>.
          </>
        ) : (
          <>
            After {count.toLocaleString('en-US')} sample{count === 1 ? '' : 's'}, the
            averages range from {f1(lo)} to {f1(hi)} and centre on {f1(centre)}. Everyone
            averages {f1(m)}.{count >= 100 && bellNow && <> A bell shape is appearing.</>}
            {view.off > 0 && (
              <>
                {' '}
                {view.off} average{view.off === 1 ? ' is' : 's are'} off the edge of the
                chart.
              </>
            )}
          </>
        )}
      </Reading>
    </>
  );
}

export function SamplingDistribution() {
  return (
    <ClientOnly
      minHeight={400}
      label="Sampling distribution: collect many sample averages and watch them pile up around the true average"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
