import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Dot, Reading, StatCard, DotStacks, dotsPerStack, pct0, pct1 } from './charts';
import { pageActions, usePage } from './store';
import { exactMaxAccuracy, median, simulateWinners, singleRun } from './validation';

const M_OPTIONS = [50, 100, 500, 2000].map((v) => ({
  value: String(v),
  label: String(v),
}));
const TRIALS = 200;
const LO = 0.3;
const HI = 0.8;

const W = 600;
const L = 14;
const R = 14;
const PW = W - L - R;
const ax = (acc: number): number =>
  L + ((Math.min(HI, Math.max(LO, acc)) - LO) / (HI - LO)) * PW;
const TICKS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

/** One trial: a bar per model, the winner marked, and its score on fresh questions. */
function SingleRunChart({
  scores,
  winner,
  fresh,
  m,
}: {
  scores: number[];
  winner: number;
  fresh: number;
  m: number;
}) {
  const H = 190;
  const T = 30;
  const B = 150;
  const ay = (acc: number) =>
    B - ((Math.min(HI, Math.max(LO, acc)) - LO) / (HI - LO)) * (B - T);
  const K = scores.length;
  const slot = PW / K;
  const bw = Math.max(1.2, Math.min(10, slot * 0.7));
  const wx = L + (winner + 0.5) * slot;
  const labelRight = wx < W * 0.6;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`One trial: ${K} models answered ${m} questions. The best scored ${pct0(scores[winner]!)} on those questions and ${pct0(fresh)} on fresh ones.`}
    >
      {[0.4, 0.5, 0.6, 0.7].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={ay(t)} y2={ay(t)} stroke="var(--color-grid)" />
          <text x={L + 2} y={ay(t) - 3} fontSize="12" fill="var(--color-muted)">
            {pct0(t)}
          </text>
        </g>
      ))}
      {scores.map((s, i) =>
        i === winner ? null : (
          <rect
            key={i}
            x={L + i * slot + (slot - bw) / 2}
            y={ay(s)}
            width={bw}
            height={Math.max(0.5, B - ay(s))}
            fill="var(--color-grid)"
            stroke="var(--color-muted)"
            strokeWidth="0.6"
          />
        ),
      )}
      <rect
        x={wx - Math.max(bw, 4) / 2}
        y={ay(scores[winner]!)}
        width={Math.max(bw, 4)}
        height={Math.max(0.5, B - ay(scores[winner]!))}
        fill="var(--color-accent)"
      />
      <polygon
        points={`${wx},${ay(scores[winner]!) - 3} ${wx + 6},${ay(scores[winner]!) - 14} ${wx - 6},${ay(scores[winner]!) - 14}`}
        fill="var(--color-ink)"
      />
      <text
        x={labelRight ? wx + 10 : wx - 10}
        y={ay(scores[winner]!) - 8}
        fontSize="13"
        textAnchor={labelRight ? 'start' : 'end'}
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Winner: {pct0(scores[winner]!)} on the mock test
      </text>
      <line
        x1={wx}
        x2={wx}
        y1={ay(scores[winner]!)}
        y2={ay(fresh)}
        stroke="var(--color-ink)"
        strokeDasharray="2 3"
      />
      <Dot shape="filled-square" x={wx} y={ay(fresh)} r={5} />
      <text
        x={labelRight ? wx + 10 : wx - 10}
        y={ay(fresh) + 18}
        fontSize="13"
        textAnchor={labelRight ? 'start' : 'end'}
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Same model, fresh questions: {pct0(fresh)}
      </text>
      <line
        x1={L}
        x2={W - R}
        y1={ay(0.5)}
        y2={ay(0.5)}
        stroke="var(--color-ink)"
        strokeWidth="1.2"
        strokeDasharray="5 4"
      />
      <text x={W - R} y={B + 18} fontSize="13" textAnchor="end" fill="var(--color-muted)">
        each bar is one model, {K} in all
      </text>
    </svg>
  );
}

interface HistProps {
  values: Float64Array | null;
  shape: 'hollow-circle' | 'filled-square';
  title: string;
  /** Extra labelled line (the 50% line or the theory line). */
  lines: {
    acc: number;
    label: string;
    dash: string;
    row: 1 | 2;
    side: 'left' | 'right';
    strong?: boolean;
  }[];
  last?: boolean;
}

function DotHist({ values, shape, title, lines, last }: HistProps) {
  const HEAD = 44;
  const ROWS = 11;
  const r = 4.4;
  const base = HEAD + ROWS * (2 * r + 1) + 2;
  const H = base + (last ? 36 : 6);
  const bins = 51;
  const counts = useMemo(() => {
    const c = new Array<number>(bins).fill(0);
    if (values)
      for (const v of values)
        c[Math.min(bins - 1, Math.max(0, Math.round(v * 100) - 30))]!++;
    return c;
  }, [values]);
  const xs = counts.map((_, i) => ax((i + 30) / 100));
  const perDot = dotsPerStack(counts, ROWS);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={title}
    >
      <text x={L} y="14" fontSize="14" fontWeight="600" fill="var(--color-ink)">
        {title}
      </text>
      {values && perDot > 1 && (
        <text x={W - R} y="14" fontSize="12" textAnchor="end" fill="var(--color-muted)">
          1 dot = {perDot} trials
        </text>
      )}
      {TICKS.map((t) => (
        <line
          key={t}
          x1={ax(t)}
          x2={ax(t)}
          y1={HEAD - 2}
          y2={base}
          stroke="var(--color-grid)"
        />
      ))}
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--color-grid)" />
      <DotStacks
        counts={counts}
        xs={xs}
        base={base}
        r={r}
        perDot={perDot}
        shape={shape}
      />
      {!values && (
        <text
          x={W / 2}
          y={HEAD + 30}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          Press “Run {TRIALS} trials” to fill this in
        </text>
      )}
      {lines.map((ln, i) => {
        const x = ax(ln.acc);
        const y = ln.row === 1 ? 30 : 42;
        const right = ln.side === 'right';
        return (
          <g key={i}>
            <line
              x1={x}
              x2={x}
              y1={y + 3}
              y2={base}
              stroke="var(--color-ink)"
              strokeWidth={ln.strong ? 2 : 1.5}
              strokeDasharray={ln.dash}
            />
            <text
              x={right ? x + 5 : x - 5}
              y={y}
              fontSize="12.5"
              textAnchor={right ? 'start' : 'end'}
              fill="var(--color-ink)"
              stroke="var(--color-surface)"
              strokeWidth="4"
              paintOrder="stroke"
            >
              {ln.label}
            </text>
          </g>
        );
      })}
      {last &&
        TICKS.map((t) => (
          <text
            key={t}
            x={ax(t)}
            y={base + 18}
            fontSize="14"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {pct0(t)}
          </text>
        ))}
      {last && (
        <text
          x={W - R}
          y={base + 33}
          fontSize="13"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          accuracy
        </text>
      )}
    </svg>
  );
}

function Inner() {
  const { seed } = usePage();
  const [m, setM] = useState(100);
  const [K, setK] = useState(50);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    pageActions.setCoin(m, K);
  }, [m, K]);

  const runSeed = seed + runs * 977;
  const theory = exactMaxAccuracy(m, K);
  const sim = useMemo(
    () => (runs > 0 ? simulateWinners(runSeed, m, K, TRIALS) : null),
    [runs, runSeed, m, K],
  );
  const one = useMemo(() => singleRun(runSeed, m, K), [runSeed, m, K]);

  const medBest = sim ? median(Array.from(sim.best)) : null;
  const medFresh = sim ? median(Array.from(sim.fresh)) : null;
  const shownBest = medBest ?? theory;
  const shownFresh = medFresh ?? 0.5;

  const reading =
    K === 1 ? (
      <>
        With 1 model there is no choosing, so nothing to flatter: it scores about 50% on
        the mock test and on fresh questions.
      </>
    ) : (
      <>
        Best of {K} models: {medBest !== null ? 'median' : 'on average'} {pct0(shownBest)}{' '}
        on the mock test. Same models on fresh questions:{' '}
        {medFresh !== null ? 'median ' : ''}
        {pct0(shownFresh)}. None had any skill.
        {m >= 500 && (
          <>
            {' '}
            With {m} questions the best of {K} shows {pct0(shownBest)}: luck shrinks as
            the mock test grows.
          </>
        )}
        {sim === null &&
          ' (These are the exact theory values; press Run to draw trials.)'}
      </>
    );

  const summary = `Best of ${K} coin-flip models on ${m} questions: ${pct0(shownBest)} on the mock test, ${pct0(shownFresh)} on fresh questions`;

  return (
    <>
      <Slider
        label="Models you tried"
        value={K}
        min={1}
        max={200}
        log
        onChange={(v) => setK(Math.max(1, Math.min(200, Math.round(v))))}
        format={(v) => String(Math.round(v))}
      />
      <div className="mt-2">
        <SegmentedControl
          label="Questions on the mock test"
          options={M_OPTIONS}
          value={String(m)}
          onChange={(v) => setM(Number(v))}
        />
      </div>

      <p className="m-0 mb-1 mt-4 text-sm font-semibold">One trial</p>
      <SingleRunChart scores={one.scores} winner={one.winner} fresh={one.fresh} m={m} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setRuns((r) => r + 1)}>
          Run {TRIALS} trials
        </Button>
        <span className="text-xs text-muted">
          {runs > 0 ? `${TRIALS} trials drawn (run ${runs})` : 'Nothing drawn yet'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <DotHist
          values={sim ? sim.best : null}
          shape="hollow-circle"
          title="Best score on the mock test (hollow circles)"
          lines={[
            ...(K > 1
              ? [
                  {
                    acc: theory,
                    label: `Theory: best of ${K} averages ${pct1(theory)}`,
                    dash: '2 3',
                    row: 1 as const,
                    side: theory > 0.62 ? ('left' as const) : ('right' as const),
                  },
                ]
              : []),
            ...(medBest !== null
              ? [
                  {
                    acc: medBest,
                    label: `Median ${pct0(medBest)}`,
                    dash: '',
                    row: 2 as const,
                    side: medBest > 0.62 ? ('left' as const) : ('right' as const),
                    strong: true,
                  },
                ]
              : []),
            { acc: 0.5, label: 'Real skill: none', dash: '6 4', row: 2, side: 'left' },
          ]}
        />
        <DotHist
          values={sim ? sim.fresh : null}
          shape="filled-square"
          title="Same model on fresh questions (filled squares)"
          last
          lines={[
            ...(medFresh !== null
              ? [
                  {
                    acc: medFresh,
                    label: `Median ${pct0(medFresh)}`,
                    dash: '',
                    row: 2 as const,
                    side: 'right' as const,
                    strong: true,
                  },
                ]
              : []),
            { acc: 0.5, label: 'Real skill: none', dash: '6 4', row: 1, side: 'left' },
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <StatCard
          label={
            medBest !== null
              ? 'Best mock test score (median)'
              : 'Best mock test score (theory)'
          }
          value={pct0(shownBest)}
          plain="the winner’s score on the questions used to pick it"
        />
        <StatCard
          label={
            medFresh !== null ? 'Fresh questions (median)' : 'Fresh questions (theory)'
          }
          value={pct0(shownFresh)}
          plain="the same winner on questions it never saw: the luck stays behind"
        />
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setM(100);
            setK(50);
            setRuns(0);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function WinnersCurse() {
  return (
    <ClientOnly
      minHeight={950}
      minHeightWide={1130}
      label="The winner's curse: coin-flip models with no skill"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
