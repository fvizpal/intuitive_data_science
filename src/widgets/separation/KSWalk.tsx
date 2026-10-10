import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { BadHatch, GOOD_FILL, Legend, PAD, SeparationControl, W, pct } from './charts';
import { rankedSample, walkLine } from './metrics';
import { getModel } from './model';
import { pageActions, usePage } from './store';

const N_GOOD = 75;
const N_BAD = 25;
const COLS = 20;
const CELL = 28;
const ROWS = Math.ceil((N_GOOD + N_BAD) / COLS);

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function Inner() {
  const { seed, separation } = usePage();
  const m = getModel(seed, separation);
  const hatch = useId();
  const line = useMemo(() => rankedSample(m.goods, m.bads, N_GOOD, N_BAD), [m]);
  const steps = useMemo(() => walkLine(line), [line]);
  const peak = useMemo(
    () => steps.reduce((best, s) => (s.gap > best.gap + 1e-12 ? s : best), steps[0]!),
    [steps],
  );

  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = line.length;
  const kk = Math.min(k, total);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setK((v) => {
        if (v >= total) {
          setPlaying(false);
          return v;
        }
        return v + 1;
      });
    }, 70);
    return () => clearInterval(id);
  }, [playing, total]);

  if (total === 0)
    return <p className="m-0 text-sm">Need both goods and bads to draw this.</p>;

  const s = steps[kk]!;
  const gapPts = Math.round(s.gap * 100);
  const left = (W - COLS * CELL) / 2;

  // gap-by-position chart
  const CH = 150;
  const C_TOP = 22;
  const C_BASE = 118;
  const maxGap = Math.max(0.1, peak.gap);
  const cx = (i: number) => PAD.l + 30 + (i / total) * (W - PAD.l - PAD.r - 30);
  const cy = (g: number) => C_BASE - (Math.max(0, g) / maxGap) * (C_BASE - C_TOP);
  const gapPath = steps
    .map((st, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${cy(st.gap).toFixed(1)}`)
    .join(' ');

  const caption =
    kk === 0
      ? 'Nobody reviewed yet. Press Walk, or drag the slider.'
      : `After ${kk} customers: ${s.bads} of ${N_BAD} bads passed (${pct(s.bads / N_BAD)}) but only ${s.goods} of ${N_GOOD} goods (${pct(s.goods / N_GOOD)}).`;
  const summary = `${caption} Gap ${gapPts} points. Biggest gap on this line-up ${Math.round(peak.gap * 100)} points after ${peak.k} customers. All 4,400 customers: KS ${m.ks.toFixed(2)}.`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${ROWS * CELL + 24}`}
        className="block w-full select-none"
        role="img"
        aria-label={`${total} customers lined up riskiest first. ${caption}`}
      >
        <defs>
          <BadHatch id={hatch} />
        </defs>
        <text x={left} y="14" fontSize="17" fill="var(--color-muted)">
          lowest score (riskiest) first … highest score (safest) last
        </text>
        {line.map((c, i) => {
          const x = left + (i % COLS) * CELL + CELL / 2;
          const y = 24 + Math.floor(i / COLS) * CELL + CELL / 2;
          const passed = i < kk;
          return (
            <g key={i} opacity={passed ? 1 : 0.28}>
              {c.good ? (
                <circle cx={x} cy={y} r="9" fill={GOOD_FILL} />
              ) : (
                <rect
                  x={x - 9}
                  y={y - 9}
                  width="18"
                  height="18"
                  fill={`url(#${hatch})`}
                  stroke="var(--color-neg)"
                  strokeWidth="2"
                />
              )}
              {i === kk - 1 && (
                <circle
                  cx={x}
                  cy={y}
                  r="14"
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="2.5"
                />
              )}
            </g>
          );
        })}
      </svg>
      <Legend goods="Good (circle)" bads="Bad (square)" />
      <p className="m-0 mt-1 text-xs text-muted">
        100 customers stand in for all 4,400. Bright = already passed, faded = still
        ahead.
      </p>

      <div className="mt-3">
        <Slider
          label="Customers passed (lowest score first)"
          value={kk}
          min={0}
          max={total}
          step={1}
          onChange={(v) => {
            setPlaying(false);
            setK(Math.round(v));
          }}
          format={(v) => String(Math.round(v))}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric
          wrap
          label="Bads passed"
          value={`${s.bads} of ${N_BAD}`}
          hint={pct(s.bads / N_BAD)}
          tone="neg"
        />
        <Metric
          wrap
          label="Goods passed"
          value={`${s.goods} of ${N_GOOD}`}
          hint={pct(s.goods / N_GOOD)}
          tone="pos"
        />
        <Metric
          wrap
          label="Gap"
          value={`${gapPts} pts`}
          hint={kk === peak.k && kk > 0 ? 'the biggest gap' : 'bads % minus goods %'}
        />
      </div>
      <p className="m-0 mt-2 text-sm font-semibold">{caption}</p>

      <svg
        viewBox={`0 0 ${W} ${CH}`}
        className="mt-3 block w-full select-none"
        role="img"
        aria-label={`Gap after each customer. It peaks at ${Math.round(peak.gap * 100)} points after ${peak.k} customers.`}
      >
        <text x={PAD.l} y="16" fontSize="18" fill="var(--color-muted)">
          the gap as you walk
        </text>
        <line
          x1={PAD.l + 30}
          x2={W - PAD.r}
          y1={C_BASE}
          y2={C_BASE}
          stroke="var(--color-grid)"
        />
        <path d={gapPath} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        <path
          d={`M${cx(peak.k)} ${cy(peak.gap) - 9} l8 9 l-8 9 l-8 -9 Z`}
          fill="var(--color-accent)"
        />
        <text
          x={cx(peak.k) + (peak.k > total * 0.6 ? -14 : 14)}
          y={cy(peak.gap) + 6}
          fontSize="18"
          fontWeight="600"
          textAnchor={peak.k > total * 0.6 ? 'end' : 'start'}
          fill="var(--color-accent)"
        >
          biggest gap = KS ≈ {peak.gap.toFixed(2)}
        </text>
        <line
          x1={cx(kk)}
          x2={cx(kk)}
          y1={C_TOP - 4}
          y2={C_BASE}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <circle cx={cx(kk)} cy={cy(s.gap)} r="6" fill="var(--color-ink)" />
        <text
          x={W - PAD.r}
          y={CH - 6}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          customers passed, lowest score first
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={prefersReducedMotion()}
          onClick={() => {
            if (kk >= total) setK(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Pause' : 'Walk'}
        </Button>
        <Button
          onClick={() => {
            setPlaying(false);
            setK(peak.k);
          }}
        >
          Jump to the biggest gap
        </Button>
        <Button
          onClick={() => {
            setPlaying(false);
            setK(0);
            pageActions.reset();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      </div>

      <div className="mt-3 border-t border-grid pt-3">
        <SeparationControl compact />
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function KSWalk() {
  return (
    <ClientOnly
      minHeight={820}
      label="Walk down a ranked line of customers, riskiest first, and track the gap between bads and goods passed"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
