import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  BadHatch,
  CrowdHistogram,
  CutoffLine,
  GOOD_FILL,
  PAD,
  ScoreAxis,
  SeparationControl,
  W,
  pct,
  scoreToX,
  whole,
} from './charts';
import { cumulativeCurves, cutoffRates, histogram } from './metrics';
import { HIST_BINS, N_GOOD, REAL_BAD_RATE, SCORE_HI, SCORE_LO, getModel } from './model';
import { pageActions, usePage } from './store';

const H = 300;
const TOP = 42;
const BASE = 252;
const py = (frac: number) => BASE - frac * (BASE - TOP);

function Inner() {
  const { seed, separation, cutoff } = usePage();
  const m = getModel(seed, separation);
  const [real, setReal] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const hatch = useId();

  const curves = useMemo(
    () => cumulativeCurves(m.goods, m.bads, 109, SCORE_LO, SCORE_HI),
    [m],
  );
  const rates = cutoffRates(m.goods, m.bads, cutoff);

  // True proportions: all goods, but only as many bads as a 4% default rate allows.
  const strip = useMemo(() => {
    const nBad = Math.round((N_GOOD * REAL_BAD_RATE) / (1 - REAL_BAD_RATE));
    const g = histogram(m.goods, SCORE_LO, SCORE_HI, HIST_BINS);
    const b = histogram(m.bads.slice(0, nBad), SCORE_LO, SCORE_HI, HIST_BINS);
    return { g, b, nBad, max: Math.max(1, ...g) };
  }, [m]);

  if (!curves || !rates) {
    return <p className="m-0 text-sm">Need both goods and bads to draw this.</p>;
  }

  const path = (ys: number[]) =>
    ys
      .map(
        (y, i) =>
          `${i ? 'L' : 'M'}${scoreToX(curves.xs[i]!).toFixed(1)} ${py(y).toFixed(1)}`,
      )
      .join(' ');

  const gx = scoreToX(Math.min(SCORE_HI, Math.max(SCORE_LO, cutoff)));
  const yG = py(rates.goodsRejected);
  const yB = py(rates.badsRejected);
  const kx = scoreToX(m.ksCutoff);
  const atKsRates = cutoffRates(m.goods, m.bads, m.ksCutoff);
  const kyG = py(atKsRates?.goodsRejected ?? 0);
  const kyB = py(atKsRates?.badsRejected ?? 0);
  const gapLeft = gx > W - 130 || (kx >= gx - 4 && kx - gx < 150);
  const gapPts = Math.round(rates.gap * 100);
  const atKs = cutoff === m.ksCutoff;
  const flip = kx > W - 190; // keep the KS label on screen

  const caption =
    separation === 0
      ? `At this cutoff you reject ${pct(rates.badsRejected)} of bads and ${pct(rates.goodsRejected)} of goods: no better than chance.`
      : `At this cutoff you reject ${pct(rates.badsRejected)} of bads but only ${pct(rates.goodsRejected)} of goods.`;
  const summary = `Cutoff ${whole(cutoff)}: bads rejected ${pct(rates.badsRejected)}, goods rejected ${pct(rates.goodsRejected)}, gap ${gapPts} points. Biggest gap, KS ${m.ks.toFixed(2)}, at cutoff ${whole(m.ksCutoff)}.`;

  return (
    <>
      {real && (
        <div className="mb-2">
          <CrowdHistogram
            goods={strip.g}
            bads={strip.b}
            max={strip.max}
            height={96}
            axis={false}
            cut={cutoff}
            ariaLabel={`Real proportions: ${strip.nBad} bads for every ${N_GOOD} goods`}
          />
          <p className="m-0 text-xs text-muted">
            Real proportions: {strip.nBad} bads for every {N_GOOD.toLocaleString('en-US')}{' '}
            goods. KS ignores how rare bads are.
          </p>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label={`Cumulative curves of bads and goods by score, cutoff ${whole(cutoff)}`}
      >
        <defs>
          <BadHatch id={hatch} />
        </defs>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(t)}
              y2={py(t)}
              stroke="var(--color-grid)"
            />
            <text x={PAD.l + 2} y={py(t) - 4} fontSize="18" fill="var(--color-muted)">
              {t * 100}%
            </text>
          </g>
        ))}
        <ScoreAxis y={BASE} />
        <text x={PAD.l} y={18} fontSize="18" fill="var(--color-muted)">
          % of the group with a score below this point
        </text>

        <path d={path(curves.goods)} fill="none" stroke={GOOD_FILL} strokeWidth="3.5" />
        <path
          d={path(curves.bads)}
          fill="none"
          stroke="var(--color-neg)"
          strokeWidth="3.5"
          strokeDasharray="9 5"
        />

        {/* KS marker: the longest gap anywhere */}
        <line
          x1={kx}
          x2={kx}
          y1={kyG}
          y2={kyB}
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeDasharray="2 3"
        />
        <path
          d={`M${kx} ${(kyG + kyB) / 2 - 8} l8 8 l-8 8 l-8 -8 Z`}
          fill="var(--color-accent)"
        />
        <text
          x={flip ? kx - 14 : kx + 14}
          y={BASE - 14}
          fontSize="19"
          fontWeight="600"
          textAnchor={flip ? 'end' : 'start'}
          fill="var(--color-accent)"
        >
          Biggest gap = KS {m.ks.toFixed(2)} at {whole(m.ksCutoff)}
        </text>

        {/* gap bracket at the cutoff */}
        <line
          x1={gx - 7}
          x2={gx + 7}
          y1={yG}
          y2={yG}
          stroke="var(--color-ink)"
          strokeWidth="2.5"
        />
        <line
          x1={gx - 7}
          x2={gx + 7}
          y1={yB}
          y2={yB}
          stroke="var(--color-ink)"
          strokeWidth="2.5"
        />
        <circle cx={gx} cy={yG} r="5" fill={GOOD_FILL} stroke="var(--color-ink)" />
        <circle cx={gx} cy={yB} r="5" fill="var(--color-neg)" stroke="var(--color-ink)" />
        <CutoffLine
          svgRef={svgRef}
          cut={cutoff}
          top={TOP}
          bottom={BASE}
          onChange={pageActions.setCutoff}
          label="Cutoff score, rejects scores below it"
        />
        <text
          x={gx + (gapLeft ? -12 : 12)}
          y={(yG + yB) / 2 + 5}
          textAnchor={gapLeft ? 'end' : 'start'}
          fontSize="19"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          gap {gapPts} pts
        </text>
      </svg>

      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="0" x2="26" y1="4" y2="4" stroke={GOOD_FILL} strokeWidth="3.5" />
          </svg>
          Goods (solid line)
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="0"
              x2="26"
              y1="4"
              y2="4"
              stroke="var(--color-neg)"
              strokeWidth="3.5"
              strokeDasharray="7 4"
            />
          </svg>
          Bads (dashed line)
        </li>
      </ul>

      <div className="mt-3">
        <Slider
          label="Cutoff score (rejects scores below it)"
          value={Math.min(SCORE_HI, Math.max(SCORE_LO, cutoff))}
          min={SCORE_LO}
          max={SCORE_HI}
          step={1}
          onChange={pageActions.setCutoff}
          format={whole}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric wrap label="Bads rejected" value={pct(rates.badsRejected)} tone="neg" />
        <Metric wrap label="Goods rejected" value={pct(rates.goodsRejected)} tone="pos" />
        <Metric
          label="Gap"
          value={`${gapPts} pts`}
          hint={atKs ? 'the biggest gap' : undefined}
        />
      </div>
      <p className="m-0 mt-2 text-sm font-semibold">{caption}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => pageActions.setCutoff(m.ksCutoff)}>
          Jump to the biggest gap
        </Button>
        <Toggle
          label={`Real proportions: ${Math.round(REAL_BAD_RATE * 100)}% bad`}
          checked={real}
          onChange={setReal}
        />
      </div>

      <div className="mt-3 border-t border-grid pt-3">
        <SeparationControl compact />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={pageActions.reset}>Reset</Button>
          <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function KSGap() {
  return (
    <ClientOnly
      minHeight={640}
      label="Cumulative curves: slide the cutoff and compare how many bads and goods fall below it"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
