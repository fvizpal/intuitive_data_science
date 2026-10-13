import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Toggle } from '../../components/ui/Toggle';
import { BUILD_STROKE, BandChip, Legend, PAD, Reading, TODAY_FILL, W } from './charts';
import { GINI_FALL, bandInfo, fmt2, fmtPct0, fmtPct1, fmtPsi } from './format';
import {
  bandDefaultRates,
  binShares,
  fadeRelationship,
  psiFromSamples,
  quantileEdges,
  tiltResample,
} from './psi';
import { giniOf, loadRealData } from './realData';
import type { RealData } from './realData';

/** "Applicants change": the tilt toward low scores (about a 0.35 PSI on the real scorecard). */
export const TILT_ON = -0.56;
/** "Default rates change": the share of outcomes that stop following the score. */
export const FADE_ON = 0.8;
const TODAY_N = 5000;
const ROUND = 3;

type LoadState =
  { status: 'loading' } | { status: 'ready'; data: RealData } | { status: 'error' };

function useRealData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadRealData().then(
      (data) => live && setState({ status: 'ready', data }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function Card({
  title,
  plain,
  children,
}: {
  title: string;
  plain: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-3">
      <div className="text-xs text-muted">{title}</div>
      {children}
      <div className="mt-1 text-xs text-muted">{plain}</div>
    </div>
  );
}

/** Paired columns, one pair per score band: build time outlined, today solid. */
function BandBars({
  title,
  build,
  today,
  yMax,
  showToday,
  ariaLabel,
}: {
  title: string;
  build: readonly (number | null)[];
  today: readonly (number | null)[];
  yMax: number;
  showToday: boolean;
  ariaLabel: string;
}) {
  const H = 204;
  const top = 26;
  const baseY = 150;
  const n = build.length;
  const colW = (W - PAD.l - PAD.r) / n;
  const y = (v: number) => baseY - (Math.min(v, yMax) / yMax) * (baseY - top);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full select-none"
      role="img"
      aria-label={ariaLabel}
    >
      <text x={PAD.l} y="16" fontSize="16" fontWeight="600" fill="var(--color-ink)">
        {title}
      </text>
      {build.map((b, i) => {
        const t = today[i] ?? 0;
        const x0 = PAD.l + i * colW;
        return (
          <g key={i}>
            <rect
              x={x0 + 6}
              y={y(b ?? 0)}
              width={colW / 2 - 7}
              height={Math.max(0, baseY - y(b ?? 0))}
              fill="none"
              stroke={BUILD_STROKE}
              strokeWidth="1.5"
            />
            <rect
              x={x0 + colW / 2 + 1}
              y={y(t)}
              width={colW / 2 - 7}
              height={Math.max(0, baseY - y(t))}
              fill={TODAY_FILL}
            />
            {showToday && (
              <text
                x={x0 + colW / 2 + 1 + (colW / 2 - 7) / 2}
                y={y(t) - 4}
                fontSize="13"
                textAnchor="middle"
                fill="var(--color-ink)"
              >
                {fmtPct0(t)}
              </text>
            )}
            <text
              x={x0 + colW / 2}
              y={baseY + 20}
              fontSize="16"
              textAnchor="middle"
              fill="var(--color-ink)"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={baseY} y2={baseY} stroke="var(--color-grid)" />
      <text x={PAD.l} y={baseY + 42} fontSize="15" fill="var(--color-muted)">
        score band: 1 = lowest scores (riskiest), {n} = highest (safest)
      </text>
    </svg>
  );
}

function Lab({ data }: { data: RealData }) {
  const [applicants, setApplicants] = useState(false);
  const [broken, setBroken] = useState(false);

  const edges = useMemo(() => quantileEdges(data.baseScores, 10), [data]);
  const rows = useMemo(
    () => Array.from({ length: data.poolScores.length }, (_, i) => i),
    [data],
  );
  const goodRate = useMemo(() => {
    let g = 0;
    for (let i = 0; i < data.poolFlags.length; i++) g += data.poolFlags[i]!;
    return g / data.poolFlags.length;
  }, [data]);
  const buildShares = useMemo(
    () => binShares(data.baseScores, edges).shares,
    [data, edges],
  );
  // Build-time default rates come from fresh applicants with nothing changed, the same
  // yardstick as the build-time Gini.
  const buildRates = useMemo(
    () => bandDefaultRates(data.poolScores, data.poolFlags, edges),
    [data, edges],
  );
  const buildDefault = 1 - goodRate;

  const drawn = useMemo(() => {
    const idx = tiltResample(
      rows,
      data.poolScores,
      applicants ? TILT_ON : 0,
      TODAY_N,
      1000 + ROUND,
    );
    return {
      scores: idx.map((i) => data.poolScores[i]!),
      flags: idx.map((i) => data.poolFlags[i]!),
    };
  }, [rows, data, applicants]);

  const result = useMemo(() => {
    const flags = fadeRelationship(
      drawn.flags,
      broken ? FADE_ON : 0,
      2000 + ROUND,
      goodRate,
    );
    const a = binShares(drawn.scores, edges);
    return {
      psi: a.n
        ? (psiFromSamples(data.baseScores, drawn.scores, edges)?.total ?? null)
        : null,
      shares: a.shares,
      rates: bandDefaultRates(drawn.scores, flags, edges),
      gini: giniOf(drawn.scores, flags),
      default: 1 - flags.reduce((s, f) => s + f, 0) / Math.max(1, flags.length),
    };
  }, [data, drawn, broken, goodRate, edges]);

  const psiNow = result.psi;
  const giniNow = result.gini;
  const fell = giniNow !== null && data.giniPool - giniNow >= GINI_FALL;
  const shifted = psiNow !== null && psiNow >= 0.1;
  const rateMax =
    Math.max(0.05, ...buildRates.map((r) => r ?? 0), ...result.rates.map((r) => r ?? 0)) *
    1.2;
  const shareMax = Math.max(0.15, ...buildShares, ...result.shares) * 1.1;

  const reading =
    shifted && !fell
      ? 'More applicants land in the riskiest bands (top chart), so PSI is high. But the default rate inside each band is where it was (bottom chart), so the score still ranks borrowers as well and Gini holds. The overall default rate is higher only because more people sit in the risky bands.'
      : !shifted && fell
        ? 'Applicants are spread across the bands as before (top chart), so PSI is near zero. But the default rate inside the bands has flattened (bottom chart): the riskiest band is no longer much riskier than the safest. Gini fell. PSI cannot see this.'
        : shifted && fell
          ? 'Both changed: applicants moved to the risky bands, and the default rates inside the bands flattened. PSI sees the first. Only Gini, which uses default rates, sees the second.'
          : 'Nothing changed. Applicants fill the bands as before, default rates inside the bands are as before, so PSI is near zero and Gini is where it was. Flip a switch.';
  const summary =
    psiNow === null
      ? 'No data to compare.'
      : `PSI ${fmtPsi(psiNow)}, ${bandInfo(psiNow).label.toLowerCase()}. Gini ${fmt2(giniNow)} against ${fmt2(data.giniPool)} at build time.`;

  return (
    <>
      <div className="flex flex-col gap-x-6 gap-y-0 sm:flex-row sm:flex-wrap">
        <Toggle label="Applicants change" checked={applicants} onChange={setApplicants} />
        <Toggle
          label="Default rates inside the bands change"
          checked={broken}
          onChange={setBroken}
        />
      </div>
      <p className="m-0 mt-1 text-xs text-muted">
        &ldquo;Applicants change&rdquo; brings in many more people with low bureau scores.
        &ldquo;Default rates change&rdquo; makes most outcomes ignore the score, so the
        score stops predicting.
      </p>

      <div className="mt-4">
        <BandBars
          title="1. Who is in each band (share of applicants)"
          build={buildShares}
          today={result.shares}
          yMax={shareMax}
          showToday={false}
          ariaLabel={`Share of applicants in each of ${buildShares.length} score bands, build time against today. PSI is ${fmtPsi(psiNow)}.`}
        />
        <BandBars
          title="2. Default rate inside each band"
          build={buildRates}
          today={result.rates}
          yMax={rateMax}
          showToday
          ariaLabel={`Default rate inside each score band, build time against today. Gini is ${fmt2(giniNow)} against ${fmt2(data.giniPool)} at build time.`}
        />
        <Legend />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card
          title="PSI: did the applicants change? (chart 1)"
          plain={
            psiNow === null
              ? 'No data.'
              : `${bandInfo(psiNow).reading} It only counts people per band.`
          }
        >
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums">
              {fmtPsi(psiNow)}
            </span>
            <BandChip value={psiNow} />
          </div>
        </Card>
        <Card
          title="Gini: does the score still work? (chart 2)"
          plain={
            giniNow === null
              ? 'No data.'
              : `Build time ${fmt2(data.giniPool)}. It uses the default rate inside each band.`
          }
        >
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`font-mono text-3xl font-semibold tabular-nums ${fell ? 'text-neg' : ''}`}
            >
              {fmt2(giniNow)}
            </span>
            <span
              className="rounded-full border px-2 py-0.5 text-xs font-semibold"
              style={{
                borderColor: fell ? 'var(--color-bad)' : 'var(--color-good)',
                color: fell ? 'var(--color-bad)' : 'var(--color-good)',
              }}
            >
              {fell ? '✖ Fell' : '✓ Holds'}
            </span>
          </div>
        </Card>
      </div>
      <p className="m-0 mt-2 text-xs text-muted">
        Overall default rate: {fmtPct1(buildDefault)} at build time,{' '}
        {fmtPct1(result.default)} today. Build-time bars use fresh applicants with nothing
        changed. Gini is give or take about 0.05: with about 200 defaulters it is noisy.
      </p>

      <div className="mt-3">
        <Button
          onClick={() => {
            setApplicants(false);
            setBroken(false);
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

function Inner() {
  const state = useRealData();
  if (state.status === 'ready') return <Lab data={state.data} />;
  if (state.status === 'error')
    return (
      <p className="m-0 text-sm">
        This browser could not build the applicant pool. The rest of the page still works.
      </p>
    );
  return (
    <div role="status" aria-label="Building the applicant pool">
      <div className="h-[40px] animate-pulse rounded-md bg-grid motion-reduce:animate-none" />
      <div className="mt-3 h-[190px] animate-pulse rounded-md bg-grid motion-reduce:animate-none" />
      <div className="mt-3 h-[190px] animate-pulse rounded-md bg-grid motion-reduce:animate-none" />
      <p className="m-0 mt-2 text-xs text-muted">
        Scoring 20,000 applicants with the real scorecard…
      </p>
    </div>
  );
}

export function DriftIsNotDamage() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Drift is not damage: PSI counts people per score band, Gini uses the default rate inside each band"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
