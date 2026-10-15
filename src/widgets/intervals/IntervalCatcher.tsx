import { useEffect, useMemo, useState } from 'react';
import { commute } from '../../lib/populations';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { useMatrix } from '../sampling/useMatrix';
import { popMean } from '../sampling/sampling';
import { MAX_N, REPS, intervalStatsForN, intervalsFromStats } from './intervals';
import {
  EveryoneMark,
  LevelPills,
  Reading,
  Skeleton,
  StackLegend,
  IntervalStack,
  W,
  XAxis,
  f1,
  levelText,
  makeScale,
  pct,
  type StackRow,
} from './charts';
import { pageActions, usePage } from './store';

const N = 25;
const SHOWN = 100;
const PITCH = 6;
const TOP = 40;
const LO = 10;
const HI = 60;
const H = TOP + SHOWN * PITCH + 66;

function Inner() {
  const { seed, level } = usePage();
  const [drawn, setDrawn] = useState(0);

  const pop = useMemo(() => commute(seed), [seed]);
  const matrix = useMatrix(pop, MAX_N, REPS, seed);
  const truth = useMemo(() => popMean(pop), [pop]);

  const set = useMemo(() => {
    if (!matrix) return null;
    return intervalsFromStats(intervalStatsForN(pop, N, REPS, seed), level, truth);
  }, [matrix, pop, seed, level, truth]);

  const total = set ? Math.min(drawn, REPS) : 0;
  const from = Math.max(0, total - SHOWN);
  let inView = 0;
  let all = 0;
  if (set) {
    for (let r = 0; r < total; r++) {
      all += set.caught[r]!;
      if (r >= from) inView += set.caught[r]!;
    }
  }
  const viewCount = total - from;

  useEffect(() => {
    if (level === 0.95 && total >= SHOWN) pageActions.markAnswerSeen();
  }, [level, total]);

  if (!matrix || !set) return <Skeleton height={760} />;

  const scale = makeScale(LO, HI);
  const rows: StackRow[] = [];
  for (let r = total - 1; r >= from; r--)
    rows.push({ lo: set.lo[r]!, hi: set.hi[r]!, caught: set.caught[r] === 1 });

  const allShare = total > 0 ? all / total : null;
  const summary =
    total === 0
      ? 'No intervals drawn yet.'
      : `${levelText(level)} intervals from ${N} people: ${inView} of ${viewCount} in view caught the truth.`;
  const atCap = total >= REPS;
  const draw = (k: number) => setDrawn((d) => Math.min(REPS, d + k));

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Stack of the latest ${SHOWN} intervals over the true average of ${f1(truth)} minutes. ${summary}`}
      >
        <text x="14" y="20" fontSize="16" fill="var(--color-muted)">
          {viewCount > 0
            ? `Latest ${viewCount} intervals, newest on top (${N} people each)`
            : 'Intervals will stack here'}
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
          ticks={[10, 20, 30, 40, 50, 60]}
          label="minutes: each bar is one plausible range"
        />
        <EveryoneMark x={scale.x(truth)} y={TOP + SHOWN * PITCH - 6} />
      </svg>
      <StackLegend />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={atCap} onClick={() => draw(1)}>
          Draw 1
        </Button>
        <Button disabled={atCap} onClick={() => draw(10)}>
          Draw 10
        </Button>
        <Button disabled={atCap} onClick={() => draw(100)}>
          Draw 100
        </Button>
        <Button disabled={atCap} onClick={() => draw(1000)}>
          Draw 1000
        </Button>
      </div>
      <div className="mt-3">
        <LevelPills level={level} onChange={pageActions.setLevel} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric
          label="In view"
          value={viewCount > 0 ? `${inView} of ${viewCount} caught` : '—'}
          hint="the stack above"
          tone="accent"
        />
        <Metric
          label="Coverage: all draws"
          value={allShare === null ? '—' : `${all} of ${total} caught (${pct(allShare)})`}
          hint="coverage = the share of intervals that catch the truth"
          wrap
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setDrawn(0);
            pageActions.setLevel(0.95);
          }}
        >
          Reset
        </Button>
        {atCap && (
          <span className="text-xs text-muted">
            All {REPS} prepared draws used. Press Reset.
          </span>
        )}
      </div>

      <Reading>
        {total === 0 ? (
          <>
            Nothing drawn yet. Press <strong>Draw 100</strong>.
          </>
        ) : (
          <>
            At {levelText(level)}, {inView} of the {viewCount} intervals in view caught
            the truth.
            {total > viewCount && allShare !== null && (
              <>
                {' '}
                Across {total}: {pct(allShare)}.
              </>
            )}
            {total >= 300 && (
              <>
                {' '}
                That is what {levelText(level)} means: the method catches the truth about{' '}
                {Math.round(level * 100)} times in 100.
                {allShare !== null && allShare < level - 0.015 && (
                  <> Small, skewed samples fall a little short.</>
                )}
              </>
            )}
          </>
        )}
      </Reading>
      <p className="sr-only">{summary}</p>
    </>
  );
}

export function IntervalCatcher() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Interval catcher: draw many intervals and count how often they catch the truth"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
