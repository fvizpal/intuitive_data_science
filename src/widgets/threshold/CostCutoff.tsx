import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ticks } from 'd3-array';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import {
  CutoffAxis,
  CutoffHandle,
  PAD,
  ShareSlider,
  W,
  cutoffText,
  units,
  xOf,
} from './charts';
import { N_LARGE, getMail, peekMail, type MailView } from './mail';
import { FLAG_NOTHING, pageActions, usePage } from './store';
import { bestByCost } from './threshold';

const H = 330;
const TOP = 40;
const BASE = 262;
const DEFAULT_RATIO = 5;

const fmt = (r: number) => String(Number(r.toPrecision(2)));
const ratioText = (r: number) =>
  r === 1 ? 'the same as a miss' : r > 1 ? `${fmt(r)} misses` : `${fmt(r)} of a miss`;

/**
 * The 20,000-email view for (seed, share). It is built in an idle callback, never in the
 * event handler, so dragging a slider stays smooth; the previous view stays on screen
 * (dimmed) while the next one is built.
 */
function useBigMail(
  seed: number,
  share: number,
): { view: MailView | null; loading: boolean } {
  const [last, setLast] = useState<MailView | null>(null);
  const ready = peekMail(seed, N_LARGE, share);

  useEffect(() => {
    const run = () => setLast(getMail(seed, N_LARGE, share));
    if (peekMail(seed, N_LARGE, share)) {
      run(); // already built: just remember it as the one to show while the next is built
      return;
    }
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 300 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [seed, share]);

  return { view: ready ?? last, loading: !ready };
}

function Skeleton() {
  return (
    <div
      className="flex animate-pulse items-center justify-center rounded-md bg-grid text-sm text-muted motion-reduce:animate-none"
      style={{ height: 420 }}
      role="status"
    >
      Counting 20,000 emails…
    </div>
  );
}

function Inner() {
  const { seed, cutoff, share } = usePage();
  const { view, loading } = useBigMail(seed, share);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const svgRef = useRef<SVGSVGElement>(null);
  const clip = useId();

  const calc = useMemo(() => {
    if (!view) return null;
    const costs = { costFP: ratio };
    const per1000 = view.curve.map((r) => ((r.fn + r.fp * ratio) / view.n) * 1000);
    const best = bestByCost(view.curve, costs)!;
    return { per1000, best, minCost: per1000[best.threshold]! };
  }, [view, ratio]);

  if (!view || !calc) return <Skeleton />;

  const { per1000, best, minCost } = calc;
  const nothing = per1000[FLAG_NOTHING]!;
  const all = per1000[0]!;
  const yMax = Math.max(nothing, minCost) * 1.5;
  const yTicks = ticks(0, yMax, 4);
  const py = (v: number) => BASE - (v / yMax) * (BASE - TOP);
  const path = per1000
    .map((v, t) => `${t ? 'L' : 'M'}${xOf(t).toFixed(1)} ${py(v).toFixed(1)}`)
    .join('');

  const bestRow = view.curve[best.threshold]!;
  const flaggedShare = (bestRow.tp + bestRow.fp) / view.n;
  const baseCost = Math.min(nothing, all);
  const baseName = nothing <= all ? 'flagging nothing' : 'flagging everything';
  const closeCall = minCost >= baseCost * 0.95;
  const where =
    flaggedShare >= 0.5
      ? ': it flags most mail'
      : flaggedShare <= 0.03
        ? ': it flags very little'
        : '';
  const reading = `A false alarm costs ${ratioText(ratio)}. The cheapest cutoff is about ${best.threshold}${where}. Cost per 1000 emails: ${units(minCost)} miss units, against ${units(baseCost)} for ${baseName}.${closeCall ? ` This filter barely beats ${nothing <= all ? 'doing nothing' : baseName} at these costs.` : ''}`;
  const summary = `False alarm costs ${ratioText(ratio)}. Cheapest cutoff ${best.threshold}, ${units(minCost)} miss units per 1000 emails. Your cutoff ${cutoff}: ${units(per1000[cutoff]!)}.`;

  const bx = xOf(best.threshold);
  const flipBest = best.threshold > 70;
  const tickPos = (v: number) => (Math.log10(v) + 2) / 4;

  return (
    <div aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label={`Expected cost per 1000 emails against the cutoff; cheapest at ${best.threshold}`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={PAD.l} y={TOP} width={W - PAD.l - PAD.r} height={BASE - TOP} />
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(v)}
              y2={py(v)}
              stroke="var(--color-grid)"
            />
            <text
              x={PAD.l - 6}
              y={py(v) + 6}
              textAnchor="end"
              fontSize="16"
              fill="var(--color-muted)"
            >
              {v}
            </text>
          </g>
        ))}
        <text x={PAD.l - 38} y={20} fontSize="16" fill="var(--color-muted)">
          cost per 1000 emails (miss units)
        </text>
        <CutoffAxis y={BASE} label="cutoff" />

        {/* baselines */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={py(nothing)}
          y2={py(nothing)}
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeDasharray="8 5"
        />
        <text
          x={W - PAD.r - 6}
          y={py(nothing) - 6}
          textAnchor="end"
          fontSize="16"
          fill="var(--color-muted)"
        >
          Flag nothing: {units(nothing)}
        </text>
        {all <= yMax ? (
          <>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(all)}
              y2={py(all)}
              stroke="var(--color-muted)"
              strokeWidth="2"
              strokeDasharray="2 5"
            />
            <text
              x={W - PAD.r - 6}
              y={py(all) - 6}
              textAnchor="end"
              fontSize="16"
              fill="var(--color-muted)"
            >
              Flag everything: {units(all)}
            </text>
          </>
        ) : null}

        <path
          d={path}
          clipPath={`url(#${clip})`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3.5"
        />

        {/* cheapest cutoff */}
        <path
          d={`M${bx} ${py(minCost) - 11} l9 11 l-9 11 l-9 -11 Z`}
          fill="var(--color-good)"
          stroke="var(--color-surface)"
          strokeWidth="1.5"
        />
        <text
          x={flipBest ? bx - 14 : bx + 14}
          y={py(minCost) + 26}
          textAnchor={flipBest ? 'end' : 'start'}
          fontSize="17"
          fontWeight="600"
          fill="var(--color-good)"
        >
          Cheapest: {best.threshold} ({units(minCost)})
        </text>

        {per1000[cutoff]! <= yMax && (
          <circle
            cx={xOf(cutoff)}
            cy={py(per1000[cutoff]!)}
            r="6"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
        )}
        <CutoffHandle
          svgRef={svgRef}
          cutoff={cutoff}
          top={TOP}
          bottom={BASE}
          onChange={pageActions.setCutoff}
        />
      </svg>

      {(all > yMax || per1000[cutoff]! > yMax) && (
        <p className="m-0 text-xs text-muted">
          Off the chart:{' '}
          {[
            per1000[cutoff]! > yMax
              ? `your cutoff costs ${units(per1000[cutoff]!)}`
              : null,
            all > yMax ? `flagging everything costs ${units(all)}` : null,
          ]
            .filter(Boolean)
            .join(', and ')}
          .
        </p>
      )}

      <div className="mt-3">
        <Slider
          label="A false alarm costs this many times a miss"
          value={ratio}
          min={0.01}
          max={100}
          log
          onChange={(v) => setRatio(Number(v.toPrecision(2)))}
          format={fmt}
        />
        <div className="relative mx-2 h-5 text-xs text-muted" aria-hidden="true">
          {[0.01, 0.1, 1, 10, 100].map((v) => (
            <span
              key={v}
              className="absolute -translate-x-1/2"
              style={{ left: `${tickPos(v) * 100}%` }}
            >
              {v}
            </span>
          ))}
        </div>
        <p className="m-0 text-sm font-semibold">
          A false alarm costs {ratioText(ratio)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button aria-pressed={ratio === 5} onClick={() => setRatio(5)}>
          Spam filter: losing real mail is worse (5)
        </Button>
        <Button aria-pressed={ratio === 0.01} onClick={() => setRatio(0.01)}>
          Smoke alarm: a missed fire is worse (0.01)
        </Button>
        <Button aria-pressed={ratio === 1} onClick={() => setRatio(1)}>
          Equal costs (1)
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric
          label="Cheapest cutoff"
          value={String(best.threshold)}
          hint={cutoffText(best.threshold)}
          tone="pos"
          wrap
        />
        <Metric
          label="Cost per 1000 emails at the cheapest cutoff"
          value={units(minCost)}
          hint="miss units (1 = one missed spam)"
          wrap
        />
        <Metric
          label="Cost if you flag nothing / everything"
          value={`${units(nothing)} / ${units(all)}`}
          hint="per 1000 emails"
          tone="muted"
          wrap
        />
        <Metric
          label="Cost at your cutoff"
          value={units(per1000[cutoff]!)}
          hint={cutoffText(cutoff)}
          tone="accent"
          wrap
        />
      </div>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        <span className="text-muted">What you&apos;re seeing: </span>
        {reading}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => pageActions.setCutoff(best.threshold)}>
          Jump to the cheapest cutoff
        </Button>
        <Button
          onClick={() => {
            setRatio(DEFAULT_RATIO);
            pageActions.reset();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.newMail}>New mail</Button>
      </div>
      <div className="mt-3 border-t border-grid pt-3">
        <ShareSlider />
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </div>
  );
}

export function CostCutoff() {
  return (
    <ClientOnly
      minHeight={1050}
      minHeightWide={950}
      label="Expected cost against the cutoff, for different costs of a false alarm"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
