import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import { FitSwatch, Reading, RoleLegend, RoleMark, fmtRupee } from './charts';
import {
  FORECASTERS,
  forecasterPicks,
  holdoutScore,
  scoreTable,
  winnerOf,
  type ForecasterKind,
} from './forecasters';
import { pageActions, usePage } from './store';
import {
  BILL_BIG,
  BILL_MONTHS,
  OBSERVED,
  makeBills,
  observed,
  type SplitMethod,
} from './validation';

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'random', label: 'Random: hold back 12 random months' },
  { value: 'future', label: 'Future: hold back the last 12 months' },
];
const KIND_OPTIONS: { value: ForecasterKind; label: string }[] = [
  { value: 'dots', label: 'Connect the dots' },
  { value: 'trend', label: 'Trend line' },
];
const NAME: Record<ForecasterKind, string> = {
  dots: 'Connect the dots',
  trend: 'Trend line',
};
const W = 600;
const YMAX = 4000;
const C = { H: 320, L: 56, R: 12, T: 24, B: 44 };
const PW = W - C.L - C.R;
const PH = C.H - C.T - C.B;
const mx = (t: number) => C.L + (t / (BILL_MONTHS - 1)) * PW;
const my = (v: number) => C.T + ((YMAX - v) / YMAX) * PH;
const cy = (v: number) => my(Math.max(0, Math.min(YMAX, v)));
const r1 = (v: number) => Math.round(v * 10) / 10;

interface ChartProps {
  pool: { t: number[]; y: number[] };
  train: Set<number>;
  val: number[];
  predict: (t: number) => number;
  /** Next year's bills, drawn only when revealed. */
  nextYear: { t: number; y: number }[] | null;
  label: string;
}

function BillChart({ pool, train, val, predict, nextYear, label }: ChartProps) {
  const grid: number[] = [];
  for (let t = 0; t <= BILL_MONTHS - 1; t += 0.5) grid.push(t);
  const path = (from: number, to: number) =>
    grid
      .filter((t) => t >= from && t <= to)
      .map((t, i) => `${i === 0 ? 'M' : 'L'}${r1(mx(t))} ${r1(cy(predict(t)))}`)
      .join('');
  const band = mx(OBSERVED - 0.5);
  return (
    <svg
      viewBox={`0 0 ${W} ${C.H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${C.H}` }}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id="bill-clip">
          <rect x={C.L} y={C.T} width={PW} height={PH} />
        </clipPath>
      </defs>
      <rect
        x={band}
        y={C.T}
        width={C.L + PW - band}
        height={PH}
        fill="color-mix(in srgb, var(--color-muted) 14%, transparent)"
        stroke="var(--color-muted)"
        strokeDasharray="4 3"
      />
      <text
        x={(band + C.L + PW) / 2}
        y={C.T + 14}
        fontSize="12"
        textAnchor="middle"
        fill="var(--color-ink)"
      >
        <tspan x={(band + C.L + PW) / 2}>Next year:</tspan>
        <tspan x={(band + C.L + PW) / 2} dy="14">
          not known yet
        </tspan>
      </text>
      {[0, 1000, 2000, 3000, 4000].map((v) => (
        <g key={v}>
          <line x1={C.L} x2={W - C.R} y1={my(v)} y2={my(v)} stroke="var(--color-grid)" />
          <text
            x={C.L - 6}
            y={my(v) + 5}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {v}
          </text>
        </g>
      ))}
      <text x={4} y={C.T - 9} fontSize="13" fill="var(--color-muted)">
        ₹ per month
      </text>
      {[0, 12, 24, 36, 48].map((t) => (
        <text
          key={t}
          x={mx(t)}
          y={C.T + PH + 18}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {t}
        </text>
      ))}
      <text
        x={W - C.R}
        y={C.H - 6}
        fontSize="13"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        month (0 = first month on record)
      </text>
      <g clipPath="url(#bill-clip)">
        {/* the miss on each held-back month */}
        {val.map((i) => (
          <line
            key={`m${i}`}
            x1={mx(pool.t[i]!)}
            x2={mx(pool.t[i]!)}
            y1={cy(pool.y[i]!)}
            y2={cy(predict(pool.t[i]!))}
            stroke="var(--color-ink)"
            strokeWidth="1.6"
          />
        ))}
        <path
          d={path(0, OBSERVED - 1)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d={path(OBSERVED - 1, BILL_MONTHS - 1)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeDasharray="7 5"
          strokeLinejoin="round"
        />
        {pool.t.map((t, i) =>
          train.has(i) ? (
            <RoleMark key={i} role="train" x={mx(t)} y={cy(pool.y[i]!)} r={3.2} />
          ) : null,
        )}
        {pool.t.map((t, i) =>
          train.has(i) ? null : (
            <RoleMark key={i} role="val" x={mx(t)} y={cy(pool.y[i]!)} r={3.2} />
          ),
        )}
        {nextYear?.map((p) => (
          <RoleMark key={p.t} role="test" x={mx(p.t)} y={cy(p.y)} r={3} />
        ))}
      </g>
    </svg>
  );
}

const StepTitle = ({ n, children }: { n: number; children: string }) => (
  <p className="m-0 mb-1 mt-6 text-sm font-semibold">
    Step {n}. {children}
  </p>
);
const Plain = ({ children }: { children: React.ReactNode }) => (
  <p className="m-0 mb-2 text-xs text-muted">{children}</p>
);

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const w = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono font-semibold tabular-nums">
          {count} of {total}
        </span>
      </div>
      <div
        className="mt-1 h-4 rounded-sm border border-grid"
        role="img"
        aria-label={`${label}: ${count} of ${total}`}
      >
        <div className="h-full bg-accent" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Inner() {
  const { seed } = usePage();
  const [method, setMethod] = useState<SplitMethod>('random');
  const [kind, setKind] = useState<ForecasterKind>('dots');
  const [reveal, setReveal] = useState(false);
  const [presses, setPresses] = useState(0);

  const bills = useMemo(() => makeBills(seed), [seed]);
  const pool = useMemo(() => observed(bills), [bills]);
  const all = useMemo(() => observed(bills, BILL_MONTHS), [bills]);
  const rows = useMemo(() => scoreTable(pool, method, seed + 1), [pool, method, seed]);
  const shown = useMemo(
    () => holdoutScore(pool, method, kind, seed + 1),
    [pool, method, kind, seed],
  );
  const picks = useMemo(
    () => (presses > 0 ? forecasterPicks(seed + presses * 7919, 100) : null),
    [presses, seed],
  );
  if (!shown) return null;

  const row = (k: ForecasterKind) => rows.find((r) => r.kind === k)!;
  const pickedByValidation = winnerOf(rows, 'validation');
  const winnerNextYear = winnerOf(rows, 'real');
  const right = pickedByValidation === winnerNextYear;
  const other = (k: ForecasterKind): ForecasterKind => (k === 'dots' ? 'trend' : 'dots');
  const methodName = method === 'random' ? 'random split' : 'future split';
  const nextYear = reveal
    ? all.t.slice(OBSERVED).map((t, j) => ({ t, y: all.y[OBSERVED + j]! }))
    : null;
  const trainSet = new Set(shown.split.train);

  const why =
    method === 'random'
      ? ' Every hollow month has known months on both sides, so connecting the dots only has to fill a gap. That is easy, and says nothing about the future.'
      : ' The hollow months come after the known months, so each forecaster has to predict ahead, which is the real job.';
  const summary = `${NAME[kind]}, ${methodName}: validation score ${fmtRupee(row(kind).validation)}, real score next year ${fmtRupee(row(kind).real)}.`;

  return (
    <>
      <SegmentedControl
        label="Which months to hold back"
        options={METHODS}
        value={method}
        onChange={setMethod}
      />

      <StepTitle n={1}>Hold months back, then test</StepTitle>
      <Plain>
        The dots are 48 months of one household’s electricity bill. The hollow circles are
        the 12 months held back. The curve is learned from the filled dots only. The black
        line from each hollow circle to the curve is the forecaster’s miss on that month,
        and the validation score is the average size of those misses.
      </Plain>
      <div className="mb-2">
        <SegmentedControl
          label="Show the curve of"
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
        />
      </div>
      <BillChart
        pool={pool}
        train={trainSet}
        val={shown.split.val}
        predict={shown.forecaster.predict}
        nextYear={nextYear}
        label={`Monthly electricity bill for 48 months with the ${NAME[kind]} curve and a ${methodName}. ${summary}`}
      />
      <RoleLegend
        extra={[[FitSwatch, 'the forecaster (dashed = its guess for next year)']]}
        roles={nextYear ? ['train', 'val', 'test'] : ['train', 'val']}
      />
      <div className="mt-1">
        <Toggle label="Reveal next year’s bills" checked={reveal} onChange={setReveal} />
      </div>
      {reveal && (
        <p className="m-0 text-xs text-muted">
          The squares are next year, the final exam. The “real score” below averages over
          every way next year could turn out, not just these 12 squares.
        </p>
      )}

      <StepTitle n={2}>Which forecaster does validation pick?</StepTitle>
      <Plain>
        Smaller is better. Validation judges with the hollow months. The real score is how
        each forecaster does on next year, which a simulation knows and you would not.
      </Plain>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 pr-3 font-semibold">Forecaster</th>
              <th className="pb-1 pr-3 font-semibold">Validation score</th>
              <th className="pb-1 font-semibold">Real score next year</th>
            </tr>
          </thead>
          <tbody>
            {FORECASTERS.map((k) => (
              <tr key={k} className="border-t border-grid">
                <td className="py-1 pr-3 font-semibold">{NAME[k]}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">
                  {fmtRupee(row(k).validation)}
                  {pickedByValidation === k && (
                    <span className="font-sans text-xs text-accent">
                      {' '}
                      ✓ validation picks this
                    </span>
                  )}
                </td>
                <td className="py-1 font-mono tabular-nums">
                  {fmtRupee(row(k).real)}
                  {winnerNextYear === k && (
                    <span className="font-sans text-xs text-accent"> ✓ really best</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="m-0 mt-2 rounded-md border border-grid px-3 py-1.5 text-sm font-semibold"
        role="status"
      >
        {right
          ? `✓ Validation picked ${NAME[pickedByValidation]}, and it really is best next year.`
          : `⚠ Validation picked ${NAME[pickedByValidation]}, but ${NAME[winnerNextYear]} is really best next year.`}
      </p>
      <p className="m-0 mt-1 text-xs text-muted">
        Amounts of {BILL_BIG} or more show as “{fmtRupee(BILL_BIG)}”.
      </p>

      <StepTitle n={3}>Is that just this one history?</StepTitle>
      <Plain>
        Press the button to make 100 new bill histories. For each one, both ways of
        holding months back choose a forecaster, and the simulation checks the choice
        against next year.
      </Plain>
      <Button variant="primary" onClick={() => setPresses((p) => p + 1)}>
        Try 100 new histories
      </Button>
      <div className="mt-2 min-h-[130px]">
        {picks ? (
          <>
            <Bar
              label="Random split chose the right forecaster"
              count={picks.rightRandom}
              total={picks.reps}
            />
            <Bar
              label="Future split chose the right forecaster"
              count={picks.rightFuture}
              total={picks.reps}
            />
            <p className="m-0 mt-2 text-xs text-muted">
              “Right” means the forecaster with the lower real score next year. In these
              histories that was {NAME.trend} {picks.winsNextYear.trend} times and{' '}
              {NAME.dots} {picks.winsNextYear.dots} times.
            </p>
          </>
        ) : (
          <p className="m-0 rounded-md border border-dashed border-grid px-3 py-6 text-center text-sm text-muted">
            Press the button to see how often each way of holding months back chooses
            well.
          </p>
        )}
      </div>

      <Reading>
        {NAME[pickedByValidation]} wins the {methodName} (
        {fmtRupee(row(pickedByValidation).validation)} against{' '}
        {fmtRupee(row(other(pickedByValidation)).validation)}).
        {why} Next year, {NAME[winnerNextYear]} scores{' '}
        {fmtRupee(row(winnerNextYear).real)} and {NAME[other(winnerNextYear)]} scores{' '}
        {fmtRupee(row(other(winnerNextYear)).real)}.{' '}
        {right
          ? 'So validation chose well here.'
          : 'So validation chose the wrong forecaster.'}
        {picks && (
          <>
            {' '}
            Across {picks.reps} histories, the random split chose the right forecaster{' '}
            {picks.rightRandom} times and the future split {picks.rightFuture} times.
          </>
        )}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New data</Button>
        <Button
          onClick={() => {
            setMethod('random');
            setKind('dots');
            setReveal(false);
            setPresses(0);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function RandomVsFuture() {
  return (
    <ClientOnly
      minHeight={1750}
      minHeightWide={1500}
      label="Random split versus the future: two forecasters for a monthly electricity bill"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
