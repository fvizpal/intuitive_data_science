import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { fmtInt, fmtPct } from './format';
import { getFitted } from './pipeline';
import { cutoffStats, scoreAll, scoreHistogram } from './scorecard';
import type { Scaling } from './scorecard';
import { getPointsTable, pageActions, usePage } from './store';

const W = 600;
const H = 250;
const PAD = { l: 16, r: 16, t: 36, b: 34 };
const BINS = 32;

function RateBar({
  rate,
  reference,
  max,
}: {
  rate: number;
  reference: number;
  max: number;
}) {
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative mt-1 h-3 rounded-sm bg-surface" aria-hidden="true">
      <div
        className="h-full rounded-sm bg-neg transition-[width] duration-200"
        style={{ width: pos(rate) }}
      />
      <div
        className="absolute -inset-y-1 border-l-2 border-dashed border-ink"
        style={{ left: pos(reference) }}
      />
    </div>
  );
}

function Card({
  title,
  value,
  hint,
  children,
}: {
  title: string;
  value: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">{title}</div>
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      {children}
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </div>
  );
}

function Inner() {
  const { seed, scaling } = usePage();
  const fitted = getFitted(seed);
  const table = getPointsTable(fitted, scaling);
  const flags = fitted.loans.defaulted;
  const portfolioRate = flags.reduce((s, d) => s + d, 0) / flags.length;

  const scores = useMemo(
    () => scoreAll(fitted.loans.columns, table, fitted.bins),
    [fitted, table],
  );
  const hist = useMemo(() => scoreHistogram(scores, flags, BINS), [scores, flags]);
  const { lo, hi, defaultCut } = useMemo(() => {
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      lo: sorted[0]!,
      hi: sorted[sorted.length - 1]!,
      // Start by approving about 4 in 5 applicants.
      defaultCut: sorted[Math.floor(sorted.length * 0.2)]!,
    };
  }, [scores]);

  // A cutoff belongs to the scale it was set on; a new scale starts from the default again.
  const [picked, setPicked] = useState<{ value: number; scaling: Scaling } | null>(null);
  const cut = Math.min(
    hi + 1,
    Math.max(
      lo,
      Math.round(picked && picked.scaling === scaling ? picked.value : defaultCut),
    ),
  );
  const setCut = (v: number) => setPicked({ value: v, scaling });

  const stats = cutoffStats(scores, flags, cut);

  // Chart geometry
  const maxShare = Math.max(0.001, ...hist.goods, ...hist.bads);
  const x0 = hist.min;
  const span = hist.step * BINS;
  const px = (score: number) => PAD.l + ((score - x0) / span) * (W - PAD.l - PAD.r);
  const py = (share: number) => H - PAD.b - (share / maxShare) * (H - PAD.t - PAD.b);
  const barW = (W - PAD.l - PAD.r) / BINS;
  const cx = Math.min(W - PAD.r, Math.max(PAD.l, px(cut)));

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = (e: { clientX: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    setCut(x0 + ((vx - PAD.l) / (W - PAD.l - PAD.r)) * span);
  };
  const patternId = useId();

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(x0 + t * span));
  const per10 = (v: number) => `${Number((v * 10).toFixed(1))} in 10`;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label={`Score histograms of repaid and defaulted customers with a cutoff at ${cut}`}
        onClick={drag}
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect
              width="6"
              height="6"
              fill="color-mix(in srgb, var(--color-neg) 18%, transparent)"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--color-neg)"
              strokeWidth="2.5"
            />
          </pattern>
        </defs>
        <rect
          x={cx}
          y={PAD.t}
          width={Math.max(0, W - PAD.r - cx)}
          height={H - PAD.t - PAD.b}
          fill="var(--color-pos)"
          opacity="0.07"
        />
        {hist.goods.map((v, i) => (
          <rect
            key={`g${i}`}
            x={PAD.l + i * barW + 0.5}
            y={py(v)}
            width={Math.max(0, barW - 1)}
            height={Math.max(0, H - PAD.b - py(v))}
            fill="color-mix(in srgb, var(--color-pos) 55%, var(--color-muted))"
            opacity="0.75"
          />
        ))}
        {hist.bads.map((v, i) => (
          <rect
            key={`b${i}`}
            x={PAD.l + i * barW + 0.5}
            y={py(v)}
            width={Math.max(0, barW - 1)}
            height={Math.max(0, H - PAD.b - py(v))}
            fill={`url(#${patternId})`}
            stroke="var(--color-neg)"
            strokeWidth="1"
          />
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={H - PAD.b}
          y2={H - PAD.b}
          stroke="var(--color-grid)"
        />
        {ticks.map((t) => (
          <text
            key={t}
            x={px(t)}
            y={H - 8}
            fontSize="20"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        ))}
        <text x={PAD.l + 2} y={20} fontSize="20" fill="var(--color-muted)">
          ◀ rejected
        </text>
        <text
          x={W - PAD.r - 2}
          y={20}
          fontSize="20"
          textAnchor="end"
          fill="var(--color-pos)"
        >
          approved ▶
        </text>
        <line
          x1={cx}
          x2={cx}
          y1={PAD.t - 6}
          y2={H - PAD.b}
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <circle cx={cx} cy={PAD.t - 6} r="12" fill="var(--color-ink)" />
        <circle
          cx={cx}
          cy={PAD.t - 6}
          r="26"
          fill="transparent"
          style={{ cursor: 'ew-resize', touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 rounded-sm"
            style={{
              background: 'color-mix(in srgb, var(--color-pos) 55%, var(--color-muted))',
            }}
          />
          Repaid (good), share of all good
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 rounded-sm border border-neg"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent 0 3px, var(--color-neg) 3px 5px)',
            }}
          />
          Defaulted (bad), share of all bad
        </li>
      </ul>

      <div className="mt-3">
        <Slider
          label="Cutoff score (approve at or above)"
          value={cut}
          min={lo}
          max={hi + 1}
          step={1}
          onChange={setCut}
          format={fmtInt}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card
          title="Approved"
          value={fmtPct(stats.approvalRate)}
          hint={`${per10(stats.approvalRate)} applicants get a yes`}
        />
        <Card
          title="Defaulters among approved"
          value={fmtPct(stats.badRateApproved)}
          hint={`dashed line: portfolio ${fmtPct(portfolioRate)}`}
        >
          <RateBar
            rate={stats.badRateApproved}
            reference={portfolioRate}
            max={Math.max(0.1, portfolioRate * 2.5)}
          />
        </Card>
        <Card
          title="Defaulters turned away"
          value={fmtPct(stats.badsRejectedShare)}
          hint={`${per10(stats.badsRejectedShare)} defaulters stopped; good customers turned away: ${fmtPct(stats.goodsRejectedShare)}`}
        />
      </div>

      <p className="m-0 mt-3 text-sm font-semibold">
        Higher cutoff: fewer bad loans, but more good customers turned away.
      </p>
      <p className="m-0 mt-1 text-xs text-muted">
        Scored on the same data it was built on, so it looks better than real life. Real
        teams check on newer data.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setPicked(null);
            pageActions.resetSeed();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      </div>
      <p className="sr-only" role="status">
        Cutoff {cut}. Approved {fmtPct(stats.approvalRate)}. Defaulters among approved{' '}
        {fmtPct(stats.badRateApproved)}, against {fmtPct(portfolioRate)} for the whole
        portfolio. Defaulters turned away {fmtPct(stats.badsRejectedShare)}.
      </p>
    </>
  );
}

export function CutoffExplorer() {
  return (
    <ClientOnly
      minHeight={640}
      label="Cutoff explorer: drag the score cutoff and see who gets approved"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
