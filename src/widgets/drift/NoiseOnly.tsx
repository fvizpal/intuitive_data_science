import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { Reading, W } from './charts';
import { getBaseline, getEdges, mean } from './data';
import { fmtPsi } from './format';
import { PSI_INVESTIGATE, binShares, driftedScores, expectedNoisePsi, psi } from './psi';

const NOISE_SEED = 11;
const LOANS = [100, 200, 500, 1000, 2000, 5000] as const;
const DEFAULT_LOANS_INDEX = 2;
/** The real change we add: the same 20-point drop used earlier on the page. */
const REAL_DROP = 20;
const MONTHS = 40;
const K = 10;
const AXIS_MAX = 0.3;

const fmtLoans = (n: number) => n.toLocaleString('en-US');

// Raw batches depend only on (round, loans); remember the last few so the controls stay fast.
const batchCache = new Map<string, number[][]>();
function getBatches(round: number, loans: number): number[][] {
  const key = `${round}|${loans}`;
  let b = batchCache.get(key);
  if (!b) {
    if (batchCache.size >= 6) batchCache.delete(batchCache.keys().next().value as string);
    b = Array.from({ length: MONTHS }, (_, m) =>
      driftedScores(NOISE_SEED * 100_003 + round * 211 + m, loans),
    );
    batchCache.set(key, b);
  }
  return b;
}

function monthlyPsi(
  batches: number[][],
  dropBy: number,
  expected: number[],
  edges: number[],
) {
  return batches.map((b) => {
    // Moving every score down by whole points commutes with rounding, so this equals a
    // fresh draw at that shift.
    const today = dropBy ? b.map((v) => v - dropBy) : b;
    const a = binShares(today, edges);
    return a.n ? (psi(expected, a.shares)?.total ?? 0) : 0;
  });
}

const NX = (v: number) => 20 + (Math.min(AXIS_MAX, v) / AXIS_MAX) * (W - 40);
const alarms = (v: number[]) => v.filter((x) => x >= PSI_INVESTIGATE).length;

const STEP = 10;
const MAX_STACK = 11;

/** Dots stacked upward from the lane's baseline, so a crowd reads as a pile. */
function Lane({
  title,
  values,
  base,
  diamond,
  hint,
}: {
  title: string;
  values: number[] | null;
  base: number;
  diamond: boolean;
  hint?: string;
}) {
  const counts = new Map<number, number>();
  return (
    <g>
      <text
        x="20"
        y={base - MAX_STACK * STEP - 14}
        fontSize="16"
        fontWeight="600"
        fill="var(--color-ink)"
      >
        {title}
      </text>
      <line x1="20" x2={W - 20} y1={base} y2={base} stroke="var(--color-grid)" />
      {values ? (
        values.map((v, i) => {
          const cx = NX(v);
          const bucket = Math.round(cx / 11);
          const level = Math.min(MAX_STACK - 1, counts.get(bucket) ?? 0);
          counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
          const cy = base - 8 - level * STEP;
          return diamond ? (
            <path
              key={i}
              d={`M${cx} ${cy - 6} l6 6 l-6 6 l-6 -6 Z`}
              fill="color-mix(in srgb, var(--color-neg) 65%, transparent)"
              stroke="var(--color-neg)"
              strokeWidth="1.5"
            />
          ) : (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="5"
              fill="color-mix(in srgb, var(--color-accent) 60%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />
          );
        })
      ) : (
        <text x="20" y={base - 40} fontSize="15" fill="var(--color-muted)">
          {hint}
        </text>
      )}
    </g>
  );
}

function Noise() {
  const [loansIndex, setLoansIndex] = useState(DEFAULT_LOANS_INDEX);
  const [realDrop, setRealDrop] = useState(false);
  const [round, setRound] = useState(0);
  const loans = LOANS[loansIndex]!;

  const baseline = getBaseline(NOISE_SEED);
  const edges = getEdges(NOISE_SEED, 'count', K);
  const expected = useMemo(() => binShares(baseline, edges).shares, [baseline, edges]);
  const batches = useMemo(() => getBatches(round, loans), [round, loans]);
  const quiet = useMemo(
    () => monthlyPsi(batches, 0, expected, edges),
    [batches, expected, edges],
  );
  const dropped = useMemo(
    () => (realDrop ? monthlyPsi(batches, REAL_DROP, expected, edges) : null),
    [batches, realDrop, expected, edges],
  );

  const falseAlarms = alarms(quiet);
  const trueAlarms = dropped ? alarms(dropped) : 0;
  const rule = expectedNoisePsi(K, baseline.length, loans);
  const avg = mean(quiet);

  let verdict = '';
  if (dropped) {
    verdict =
      falseAlarms <= 2
        ? `So at ${fmtLoans(loans)} loans a month, an alarm is trustworthy: false alarms almost never happen.`
        : `But ${falseAlarms} quiet months raised it too, so at ${fmtLoans(loans)} loans a month one alarm is weak evidence. Check more months before you act.`;
  }

  const quietText = `With ${fmtLoans(loans)} loans a month, ${falseAlarms} of ${MONTHS} months with no change still landed in the alarm zone.`;
  const H = 346;
  const zoneTop = 8;
  const axisY = 300;
  return (
    <>
      <p className="m-0 mb-2 text-lg font-semibold" aria-live="polite">
        {falseAlarms} of {MONTHS} quiet months raised a false alarm
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label={`${quietText} ${dropped ? `With a real ${REAL_DROP}-point drop, ${trueAlarms} of ${MONTHS} months landed in the alarm zone. ` : ''}Each dot is one month's PSI.`}
      >
        <rect
          x={NX(PSI_INVESTIGATE)}
          y={zoneTop}
          width={W - 20 - NX(PSI_INVESTIGATE)}
          height={axisY - zoneTop}
          fill="color-mix(in srgb, var(--color-neg) 12%, transparent)"
        />
        <line
          x1={NX(PSI_INVESTIGATE)}
          x2={NX(PSI_INVESTIGATE)}
          y1={zoneTop}
          y2={axisY}
          stroke="var(--color-neg)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <text
          x={W - 24}
          y={zoneTop + 16}
          fontSize="15"
          textAnchor="end"
          fill="var(--color-ink)"
        >
          ▲ alarm zone: PSI 0.1 or more
        </text>
        <Lane
          title={`Quiet months: ${falseAlarms} in the alarm zone`}
          values={quiet}
          base={150}
          diamond={false}
        />
        <Lane
          title={
            dropped
              ? `Months with a real ${REAL_DROP}-point drop: ${trueAlarms} in the alarm zone`
              : 'Months with a real drop'
          }
          values={dropped}
          base={300}
          diamond
          hint="Switch on the real drop below to see these months."
        />
        {[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((t) => (
          <g key={t}>
            <line
              x1={NX(t)}
              x2={NX(t)}
              y1={axisY}
              y2={axisY + 5}
              stroke="var(--color-grid)"
            />
            <text
              x={NX(t)}
              y={axisY + 22}
              fontSize="15"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {t === 0.3 ? '0.3+' : t}
            </text>
          </g>
        ))}
        <text
          x={W - 20}
          y={axisY + 42}
          fontSize="15"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          PSI of that month
        </text>
      </svg>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="color-mix(in srgb, var(--color-accent) 60%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />
          </svg>
          one month, nothing changed
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <path
              d="M7 1 l6 6 l-6 6 l-6 -6 Z"
              fill="color-mix(in srgb, var(--color-neg) 65%, transparent)"
              stroke="var(--color-neg)"
              strokeWidth="1.5"
            />
          </svg>
          one month, applicants really dropped
        </li>
      </ul>

      <div className="mt-4">
        <Slider
          label="Loans this month"
          value={loansIndex}
          min={0}
          max={LOANS.length - 1}
          step={1}
          onChange={(v) => setLoansIndex(Math.round(v))}
          format={(v) => fmtLoans(LOANS[Math.round(v)]!)}
        />
        <div
          className="flex justify-between px-1 text-[11px] text-muted"
          aria-hidden="true"
        >
          {LOANS.map((n) => (
            <span key={n}>{fmtLoans(n)}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setRound((r) => r + 1)}>
          Draw {MONTHS} new months
        </Button>
        <Button
          onClick={() => {
            setLoansIndex(DEFAULT_LOANS_INDEX);
            setRealDrop(false);
            setRound(0);
          }}
        >
          Reset
        </Button>
      </div>

      <div className="mt-4 border-t border-grid pt-3">
        <p className="m-0 mb-1 text-xs text-muted">
          A second knob, once the quiet months make sense.
        </p>
        <Toggle
          label={`Add a real ${REAL_DROP}-point drop in scores`}
          checked={realDrop}
          onChange={setRealDrop}
        />
      </div>

      <Reading>
        Each dot is one month&rsquo;s PSI. In every quiet month nothing changed about the
        applicants, so each dot in the alarm zone is a <strong>false alarm</strong>.{' '}
        {quietText}
        {dropped && (
          <>
            {' '}
            When applicants really dropped {REAL_DROP} points, {trueAlarms} of {MONTHS}{' '}
            months raised the alarm. {verdict}
          </>
        )}{' '}
        The rule of thumb (9 ÷ loans) predicts a typical quiet-month PSI of about{' '}
        {fmtPsi(rule)}; these months averaged {fmtPsi(avg)}.
      </Reading>
    </>
  );
}

export function NoiseOnly() {
  return (
    <ClientOnly
      minHeight={760}
      label="Real change or noise: how often a quiet month still raises the PSI alarm"
    >
      {() => <Noise />}
    </ClientOnly>
  );
}
