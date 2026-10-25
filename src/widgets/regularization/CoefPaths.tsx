import { useId, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { JobSkeleton } from '../validation/charts';
import {
  Card,
  Label,
  LegendRow,
  PenaltyXAxis,
  Reading,
  WideErrorCard,
  fmtCoef,
  fmtErr,
  fmtLam,
  niceTicks,
  penaltyFrame,
  penaltyTicks,
  r1,
} from './charts';
import { useJob } from './jobs';
import { N_WIDE, GRID_STEPS, pageActions, usePage } from './store';
import { WIDE_BETA, WIDE_NOISE, type Method, type WidePaths } from './wide';

const P = WIDE_BETA.length;
const REAL = WIDE_BETA.map((b, j) => (b !== 0 ? j : -1)).filter((j) => j >= 0);
const NPILLS = N_WIDE.map((v) => ({ value: String(v), label: String(v) }));
const METHODS = [
  { value: 'ridge', label: 'Ridge (L2)' },
  { value: 'lasso', label: 'Lasso (L1)' },
] as const;

const featureName = (j: number) =>
  WIDE_BETA[j] !== 0
    ? `Feature ${j + 1} (true weight ${WIDE_BETA[j]})`
    : `Feature ${j + 1} (true weight 0)`;

/** Range of every coefficient on either path and the true weights, padded. */
export function coefRange(p: WidePaths): { lo: number; hi: number } {
  let lo = Math.min(...WIDE_BETA);
  let hi = Math.max(...WIDE_BETA);
  for (const set of [p.ridgeCoefs, p.lassoCoefs])
    for (const row of set)
      for (const v of row) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
  const pad = 0.06 * (hi - lo || 1);
  return { lo: lo - pad, hi: hi + pad };
}

export interface Reading2 {
  text: string;
  kept: number;
  keptReal: number;
  error: number;
}

/** What the current method and penalty did, in plain words. */
export function readingFor(p: WidePaths, method: Method, pos: number): Reading2 {
  const coefs = method === 'ridge' ? p.ridgeCoefs[pos]! : p.lassoCoefs[pos]!;
  const error = method === 'ridge' ? p.ridgeError[pos]! : p.lassoError[pos]!;
  const lam = p.lambdas[pos]!;
  const where =
    pos === 0
      ? 'No penalty'
      : `${method === 'ridge' ? 'Ridge' : 'Lasso'} at penalty ${fmtLam(lam)}`;
  let kept = 0;
  let keptReal = 0;
  for (let j = 0; j < P; j++)
    if (coefs[j] !== 0) {
      kept++;
      if (WIDE_BETA[j] !== 0) keptReal++;
    }
  const err = `Error on new data ${fmtErr(error)}.`;
  if (pos === 0)
    return {
      text: `No penalty: every feature has a weight, most of them wrong. The 17 useless ones reach up to ${fmtCoef(
        Math.max(...coefs.filter((_, j) => WIDE_BETA[j] === 0).map(Math.abs)),
      )}. ${err}`,
      kept,
      keptReal,
      error,
    };
  if (method === 'ridge') {
    const big = Math.max(...coefs.filter((_, j) => WIDE_BETA[j] === 0).map(Math.abs));
    return {
      text: `${where}: all 20 features are still in, but the 17 useless ones are small (largest ${fmtCoef(big)}). ${err}`,
      kept,
      keptReal,
      error,
    };
  }
  if (kept === 0)
    return {
      text: `${where}: no features kept. The model predicts the average. Too much penalty. ${err}`,
      kept,
      keptReal,
      error,
    };
  const useless = kept - keptReal;
  const dropped = REAL.filter((j) => coefs[j] === 0).map((j) => j + 1);
  const mix =
    keptReal === 3
      ? `the 3 real${useless ? ` and ${useless} useless` : ''}`
      : `${keptReal} real and ${useless} useless`;
  const drop =
    dropped.length > 0
      ? ` Lasso dropped feature ${dropped.join(' and ')} (${dropped.length > 1 ? 'real ones' : 'a real one'}): too much penalty.`
      : '';
  return {
    text: `${where}: ${kept} feature${kept === 1 ? '' : 's'} kept (${mix}). ${err}${drop}`,
    kept,
    keptReal,
    error,
  };
}

function PathsChart({
  p,
  method,
  pos,
  hot,
}: {
  p: WidePaths;
  method: Method;
  pos: number;
  hot: number | null;
}) {
  const uid = useId().replace(/:/g, '');
  const f = penaltyFrame(p.lambdas.length, { H: 360, B: 52 });
  const { lo, hi } = coefRange(p);
  const y = (v: number) => f.T + ((hi - v) / (hi - lo)) * f.ph;
  const rows = method === 'ridge' ? p.ridgeCoefs : p.lassoCoefs;
  const path = (j: number) =>
    rows.map((row, i) => `${i ? 'L' : 'M'}${r1(f.x(i))} ${r1(y(row[j]!))}`).join('');
  const ticks = niceTicks(lo, hi, 6);
  // Labels for the real features, where the lines are still apart (grid position 3), without overlap.
  const at = Math.min(3, rows.length - 1);
  const placed = REAL.map((j) => ({ j, y: y(rows[at]![j]!) - 9 })).sort(
    (a, b) => a.y - b.y,
  );
  for (let i = 1; i < placed.length; i++)
    if (placed[i]!.y - placed[i - 1]!.y < 17) placed[i]!.y = placed[i - 1]!.y + 17;
  return (
    <svg
      viewBox={`0 0 ${f.W} ${f.H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${f.W} / ${f.H}` }}
      role="img"
      aria-label={`The 20 coefficients against penalty strength for ${method === 'ridge' ? 'ridge' : 'lasso'}. The 3 real features are thick lines.`}
    >
      <defs>
        <clipPath id={`cp${uid}`}>
          <rect x={f.L} y={f.T} width={f.pw} height={f.ph} />
        </clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={f.L}
            x2={f.W - f.R}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-grid)"
            strokeWidth={t === 0 ? 1.6 : 1}
          />
          <text
            x={f.L - 6}
            y={y(t) + 5}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text
        x={f.L - 6}
        y={f.T - 10}
        fontSize="13"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        weight
      </text>
      <PenaltyXAxis f={f} ticks={penaltyTicks(p.lambdas)} />
      <g clipPath={`url(#cp${uid})`}>
        {REAL.map((j) => (
          <line
            key={`ref${j}`}
            x1={f.L}
            x2={f.W - f.R}
            y1={y(WIDE_BETA[j]!)}
            y2={y(WIDE_BETA[j]!)}
            stroke="var(--color-ink)"
            strokeWidth="1.3"
            strokeDasharray="7 5"
            opacity="0.7"
          />
        ))}
        {Array.from({ length: P }, (_, j) => j)
          .filter((j) => WIDE_BETA[j] === 0)
          .map((j) => (
            <path
              key={j}
              d={path(j)}
              fill="none"
              stroke={hot === j ? 'var(--color-ink)' : 'var(--color-muted)'}
              strokeWidth={hot === j ? 3 : 1.3}
              strokeDasharray="1.5 3.5"
              strokeLinecap="round"
              opacity={hot === j ? 1 : 0.85}
            />
          ))}
        {REAL.map((j) => (
          <path
            key={j}
            d={path(j)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={hot === j ? 5 : 3.4}
            strokeLinejoin="round"
          />
        ))}
        <line
          x1={f.x(pos)}
          x2={f.x(pos)}
          y1={f.T}
          y2={f.T + f.ph}
          stroke="var(--color-ink)"
          strokeWidth="1.6"
        />
        {REAL.map((j) => (
          <circle
            key={`d${j}`}
            cx={r1(f.x(pos))}
            cy={r1(y(rows[pos]![j]!))}
            r="4.6"
            fill="var(--color-accent)"
            stroke="var(--color-surface)"
            strokeWidth="1.5"
          />
        ))}
        {hot !== null && WIDE_BETA[hot] === 0 && (
          <circle
            cx={r1(f.x(pos))}
            cy={r1(y(rows[pos]![hot]!))}
            r="4.4"
            fill="var(--color-surface)"
            stroke="var(--color-ink)"
            strokeWidth="2"
          />
        )}
      </g>
      {placed.map(({ j, y: ly }) => (
        <Label
          key={j}
          x={f.x(at) + 6}
          y={ly}
          size={13}
          fill="var(--color-ink)"
          weight={600}
        >
          {featureName(j)}
        </Label>
      ))}
      {REAL.map((j) => (
        <Label
          key={`rl${j}`}
          x={f.W - f.R - 4}
          y={y(WIDE_BETA[j]!) - 5}
          anchor="end"
          size={12}
          fill="var(--color-muted)"
        >
          True weight {WIDE_BETA[j]}
        </Label>
      ))}
      {hot !== null && WIDE_BETA[hot] === 0 && (
        <Label
          x={Math.min(f.x(pos) + 8, f.W - f.R - 150)}
          y={Math.max(f.T + 14, y(rows[pos]![hot]!) - 8)}
          size={13}
          weight={600}
        >
          {featureName(hot)}
        </Label>
      )}
      <polygon
        points={`${f.x(pos)},${f.T + f.ph + 2} ${f.x(pos) + 7},${f.T + f.ph + 14} ${f.x(pos) - 7},${f.T + f.ph + 14}`}
        fill="var(--color-ink)"
      />
    </svg>
  );
}

const ROW = 17;

function BarsChart({
  p,
  method,
  pos,
  hot,
  setHot,
}: {
  p: WidePaths;
  method: Method;
  pos: number;
  hot: number | null;
  setHot: (j: number | null) => void;
}) {
  const coefs = method === 'ridge' ? p.ridgeCoefs[pos]! : p.lassoCoefs[pos]!;
  const { lo, hi } = coefRange(p);
  const W = 600;
  const L = 92;
  const R = 16;
  const T = 24;
  const H = T + P * ROW + 36;
  const pw = W - L - R;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * pw;
  const ticks = niceTicks(lo, hi, 6);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`The 20 coefficients at the current penalty, as bars. Hollow diamonds mark the true weights.`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={T} y2={T + P * ROW} stroke="var(--color-grid)" />
          <text
            x={x(t)}
            y={T + P * ROW + 16}
            fontSize="13"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text x={W - R} y={H - 4} fontSize="13" textAnchor="end" fill="var(--color-muted)">
        weight at this penalty →
      </text>
      <line
        x1={x(0)}
        x2={x(0)}
        y1={T - 4}
        y2={T + P * ROW + 2}
        stroke="var(--color-ink)"
        strokeWidth="1.2"
      />
      {Array.from({ length: P }, (_, j) => {
        const cy = T + j * ROW + ROW / 2;
        const real = WIDE_BETA[j] !== 0;
        const v = coefs[j]!;
        const x0 = x(0);
        const x1 = x(v);
        const tx = x(WIDE_BETA[j]!);
        return (
          <g key={j} onPointerEnter={() => setHot(j)} onPointerLeave={() => setHot(null)}>
            {hot === j && (
              <rect
                x={2}
                y={cy - ROW / 2}
                width={W - 4}
                height={ROW}
                fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
              />
            )}
            <text
              x={L - 8}
              y={cy + 4.5}
              fontSize="13"
              textAnchor="end"
              fontWeight={real || hot === j ? 700 : 400}
              fill={real || hot === j ? 'var(--color-ink)' : 'var(--color-muted)'}
            >
              Feature {j + 1}
            </text>
            <rect
              x={r1(Math.min(x0, x1))}
              y={cy - 5.5}
              width={r1(Math.max(Math.abs(x1 - x0), v === 0 ? 0 : 1))}
              height="11"
              fill={
                real
                  ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)'
                  : 'color-mix(in srgb, var(--color-muted) 55%, transparent)'
              }
              stroke={real ? 'var(--color-accent)' : 'none'}
              strokeWidth={real ? 2 : 0}
            />
            <rect
              x={r1(tx - 4)}
              y={cy - 4}
              width="8"
              height="8"
              transform={`rotate(45 ${r1(tx)} ${cy})`}
              fill="var(--color-surface)"
              stroke="var(--color-ink)"
              strokeWidth="1.5"
            />
            {v === 0 && (
              <text
                x={x0 + 9}
                y={cy + 4.5}
                fontSize="12"
                fontWeight="700"
                fill="var(--color-ink)"
              >
                0
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Inner() {
  const { seed, n, pos } = usePage();
  const [method, setMethod] = useState<Method>('ridge');
  const [hot, setHot] = useState<number | null>(null);
  const paths = useJob('paths', { seed, n });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0;
    if (e.key === 'Escape') setHot(null);
    if (!d) return;
    e.preventDefault();
    setHot(hot === null ? (d > 0 ? 0 : P - 1) : Math.max(0, Math.min(P - 1, hot + d)));
  };

  const format = (v: number) =>
    v === 0 ? 'No penalty' : paths ? fmtLam(paths.lambdas[Math.round(v)]!) : '…';
  const r = paths ? readingFor(paths, method, pos) : null;
  const summary = r
    ? `${method === 'ridge' ? 'Ridge' : 'Lasso'}, ${pos === 0 ? 'no penalty' : `penalty ${fmtLam(paths!.lambdas[pos]!)}`}: ${r.kept} of ${P} features kept, error on new data ${fmtErr(r.error)}`
    : '';
  const hotCoef =
    paths && hot !== null
      ? method === 'ridge'
        ? paths.ridgeCoefs[pos]![hot]!
        : paths.lassoCoefs[pos]![hot]!
      : null;

  return (
    <>
      <div className="sticky top-0 z-10 -mx-3 border-b border-grid bg-surface px-3 pb-2 pt-2 sm:-mx-4 sm:px-4">
        <Slider
          label="Penalty strength (lambda)"
          value={pos}
          min={0}
          max={GRID_STEPS}
          step={1}
          onChange={(v) => pageActions.setPos(v)}
          format={format}
        />
        <p className="m-0 mt-1 text-xs text-muted">
          {r
            ? `${method === 'ridge' ? 'Ridge' : 'Lasso'}: ${r.kept} of ${P} features kept, error on new data ${fmtErr(r.error)}`
            : 'Far left: no penalty. The far right drops every feature under lasso.'}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        <SegmentedControl
          label="Method"
          options={METHODS}
          value={method}
          onChange={(v) => setMethod(v as Method)}
        />
        <SegmentedControl
          label="Rows of data"
          options={NPILLS}
          value={String(n)}
          onChange={(v) => pageActions.setN(Number(v))}
        />
      </div>

      {paths && r ? (
        <>
          <div className="mt-3">
            <PathsChart p={paths} method={method} pos={pos} hot={hot} />
            <LegendRow
              items={[
                [
                  <line
                    key="a"
                    x1="1"
                    x2="17"
                    y1="8"
                    y2="8"
                    stroke="var(--color-accent)"
                    strokeWidth="3.6"
                  />,
                  'Real feature (thick, solid, labelled)',
                ],
                [
                  <line
                    key="b"
                    x1="1"
                    x2="17"
                    y1="8"
                    y2="8"
                    stroke="var(--color-muted)"
                    strokeWidth="1.5"
                    strokeDasharray="1.5 3.5"
                    strokeLinecap="round"
                  />,
                  'Useless feature (thin, dotted)',
                ],
                [
                  <line
                    key="c"
                    x1="1"
                    x2="17"
                    y1="8"
                    y2="8"
                    stroke="var(--color-ink)"
                    strokeWidth="1.4"
                    strokeDasharray="5 3"
                  />,
                  'True weight (dashed)',
                ],
                [
                  <g key="d">
                    <line
                      x1="9"
                      x2="9"
                      y1="1"
                      y2="15"
                      stroke="var(--color-ink)"
                      strokeWidth="1.6"
                    />
                    <polygon points="9,15 5,10 13,10" fill="var(--color-ink)" />
                  </g>,
                  'Your penalty',
                ],
              ]}
            />
          </div>

          <h4 className="mb-1 mt-4 text-sm font-semibold">Weights at this penalty</h4>
          <p className="m-0 mb-1 text-xs text-muted">
            Bars outlined in blue are the 3 real features. Hollow diamonds mark the true
            weights. Hover a row, or focus the chart and use the arrow keys, to highlight
            one feature.
          </p>
          <div
            tabIndex={0}
            role="group"
            aria-label="The 20 features. Use the up and down arrow keys to highlight one; Escape clears."
            onKeyDown={onKey}
            onBlur={() => setHot(null)}
            className="rounded-md"
          >
            <BarsChart p={paths} method={method} pos={pos} hot={hot} setHot={setHot} />
          </div>
          <p className="m-0 mt-1 min-h-5 text-xs text-muted" aria-live="polite">
            {hot !== null && hotCoef !== null
              ? `${featureName(hot)}: weight ${fmtCoef(hotCoef)}${hotCoef === 0 ? ' (exactly zero, out of the model)' : ''}`
              : ''}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Card
              label={method === 'ridge' ? 'Features still in the model' : 'Features kept'}
              value={`${r.kept} of ${P}`}
              plain={
                method === 'ridge'
                  ? 'ridge never reaches zero'
                  : `${r.keptReal} real, ${r.kept - r.keptReal} useless`
              }
            />
            <WideErrorCard
              label="Error on new data (exact)"
              value={r.error}
              base={paths.lsError}
              floor={WIDE_NOISE}
              plain="typical miss on fresh rows. Only a simulation can know this; real projects can't."
            />
            {method === 'ridge' ? (
              <Card
                label="Effective flexibility"
                value={`${paths.ridgeDf[pos]!.toFixed(1)} of ${P + 1}`}
                plain="how many of the model's 21 knobs are really in use"
              />
            ) : (
              <Card
                label="Penalty strength"
                value={pos === 0 ? 'None' : fmtLam(paths.lambdas[pos]!)}
                plain="lambda, on the standardized features"
              />
            )}
          </div>
          <Reading>{r.text}</Reading>
          <p className="sr-only" aria-live="polite">
            {summary}
          </p>
        </>
      ) : (
        <div className="mt-3">
          <JobSkeleton height={560}>
            Fitting 61 penalties for ridge and lasso…
          </JobSkeleton>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New data</Button>
        <Button
          onClick={() => {
            pageActions.reset();
            setMethod('ridge');
            setHot(null);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function CoefPaths() {
  return (
    <ClientOnly
      minHeight={1750}
      minHeightWide={1600}
      label="Ridge and lasso paths: 20 coefficients against penalty strength"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
