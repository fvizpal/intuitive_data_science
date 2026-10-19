import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { Curve, HourChart, px, py } from '../biasvar/charts';
import { fitPoly, gridPredictions } from '../biasvar/fit';
import { prefersReducedMotion } from '../sampling/useMatrix';
import {
  FitSwatch,
  JobSkeleton,
  PickHist,
  Reading,
  RoleLegend,
  RoleMark,
  ShapeSwatch,
  StatCard,
  fmtErr,
  type DotShape,
} from './charts';
import { POOL } from './jobCore';
import { useJob } from './jobs';
import { pageActions, usePage } from './store';
import {
  bestDegree,
  cvPoly,
  kFoldIndices,
  median,
  realErrorByDegree,
  temperaturePool,
  type CvPicks,
} from './validation';

const K_OPTIONS = [
  { value: '2', label: '2' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '40', label: '40 = leave one out' },
];
const NOISE = 2;
const MAX_DEG = 12;
const W = 600;

const StepTitle = ({ n, children }: { n: number; children: string }) => (
  <p className="m-0 mb-1 mt-6 text-sm font-semibold">
    Step {n}. {children}
  </p>
);
const Plain = ({ children }: { children: React.ReactNode }) => (
  <p className="m-0 mb-2 text-xs text-muted">{children}</p>
);

// ---------- Step 1: every point takes a turn ----------

function FoldBars({
  rmses,
  active,
  onPick,
  combined,
}: {
  rmses: number[];
  active: number;
  onPick: (i: number) => void;
  combined: number;
}) {
  const k = rmses.length;
  const L = 14;
  const R = 14;
  const slot = (W - L - R) / k;
  const bw = Math.max(5, slot * 0.7);
  const top = 22;
  const base = 104;
  const ymax = Math.max(...rmses, 0.1) * 1.15;
  const h = (v: number) => (Math.min(v, ymax) / ymax) * (base - top);
  const showNums = k <= 10;
  const H = 172;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Error on each of the ${k} folds when it is held back. Fold ${active + 1} is highlighted: ${fmtErr(rmses[active]!)}. Combined error of all folds ${fmtErr(combined)}.`}
    >
      <text x={L} y="13" fontSize="13" fill="var(--color-muted)">
        Error on the held-back points, one bar per fold (°C)
      </text>
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--color-grid)" />
      {rmses.map((v, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const on = i === active;
        return (
          <g key={i} onClick={() => onPick(i)} style={{ cursor: 'pointer' }}>
            <rect
              x={L + i * slot}
              y={top - 6}
              width={slot}
              height={base - top + 24}
              fill="transparent"
            />
            <rect
              x={x}
              y={base - h(v)}
              width={bw}
              height={Math.max(1, h(v))}
              fill={on ? 'var(--color-accent)' : 'var(--color-grid)'}
              stroke={on ? 'var(--color-ink)' : 'var(--color-muted)'}
              strokeWidth={on ? 2.2 : 0.8}
            />
            {showNums && (
              <text
                x={x + bw / 2}
                y={base - h(v) - 4}
                fontSize="12"
                textAnchor="middle"
                fill="var(--color-ink)"
              >
                {fmtErr(v)}
              </text>
            )}
            {showNums && (
              <text
                x={x + bw / 2}
                y={base + 14}
                fontSize="12"
                textAnchor="middle"
                fill="var(--color-muted)"
              >
                {i + 1}
              </text>
            )}
            {on && (
              <polygon
                points={`${x + bw / 2},${base + 3} ${x + bw / 2 + 5},${base + 12} ${x + bw / 2 - 5},${base + 12}`}
                fill="var(--color-ink)"
                transform={showNums ? 'translate(0 14)' : undefined}
              />
            )}
          </g>
        );
      })}
      <path
        d={`M${L} ${base + 38} v6 h${W - L - R} v-6`}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
      />
      <text
        x={W / 2}
        y={base + 62}
        fontSize="14"
        fontWeight="600"
        textAnchor="middle"
        fill="var(--color-ink)"
      >
        Cross-validation error (all folds combined): {fmtErr(combined)} °C
      </text>
    </svg>
  );
}

function StepOne({ seed, k, degree }: { seed: number; k: number; degree: number }) {
  const reduced = prefersReducedMotion();
  const [fold, setFold] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set([0]));
  const [playing, setPlaying] = useState(false);

  const pool = useMemo(() => temperaturePool(seed, POOL, NOISE), [seed]);
  const folds = useMemo(() => kFoldIndices(POOL, k, seed + 3), [seed, k]);
  const cv = useMemo(
    () => (folds ? cvPoly(pool.x, pool.y, degree, folds) : null),
    [pool, folds, degree],
  );

  const goto = (i: number) => {
    setFold(i);
    setSeen((s) => new Set(s).add(i));
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setFold((f) => {
        const n = f + 1;
        if (n >= k) {
          setPlaying(false);
          return f;
        }
        setSeen((s) => new Set(s).add(n));
        return n;
      });
    }, 600);
    return () => clearInterval(id);
  }, [playing, k]);

  const view = useMemo(() => {
    if (!folds || !cv) return null;
    const held = new Set(folds[fold]!);
    const rest: number[] = [];
    for (let i = 0; i < POOL; i++) if (!held.has(i)) rest.push(i);
    const model = fitPoly(
      rest.map((i) => pool.x[i]!),
      rest.map((i) => pool.y[i]!),
      degree,
    );
    return { held, values: gridPredictions(model) };
  }, [folds, cv, fold, pool, degree]);

  if (!folds || !cv || !view)
    return <JobSkeleton height={420}>No folds to show.</JobSkeleton>;
  const rmses = cv.perFold.map((f) => f.rmse);
  const n = folds[fold]!.length;

  return (
    <>
      <StepTitle n={1}>Every point takes a turn</StepTitle>
      <Plain>
        The 40 points are dealt into {k} groups (folds). The hollow circles are the fold
        held back right now. The curve learns from the filled dots only, then is scored on
        the hollow circles. Press Play to move to the next fold.
      </Plain>
      <HourChart
        label={`${POOL} temperature points. Fold ${fold + 1} of ${k} is held back (${n} hollow circles); a degree ${degree} curve is fitted to the other ${POOL - n}. Error on the held-back points: ${fmtErr(rmses[fold]!)}.`}
      >
        {pool.x.map((x, i) =>
          view.held.has(i) ? null : (
            <RoleMark key={i} role="train" x={px(x)} y={py(pool.y[i]!)} r={3.4} />
          ),
        )}
        {pool.x.map((x, i) =>
          view.held.has(i) ? (
            <RoleMark key={i} role="val" x={px(x)} y={py(pool.y[i]!)} r={3.4} />
          ) : null,
        )}
        <Curve values={view.values} width={3.2} />
      </HourChart>
      <RoleLegend
        roles={['train', 'val']}
        extra={[[FitSwatch, 'the curve learned from the filled dots']]}
      />
      <p className="m-0 mt-1 text-xs text-muted">
        Fold {fold + 1} of {k}: {n} point{n === 1 ? '' : 's'} held back. Folds used so
        far: {seen.size} of {k}.
      </p>
      <div className="mt-2">
        <FoldBars rmses={rmses} active={fold} onPick={goto} combined={cv.pooledRmse} />
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button onClick={() => goto((fold + 1) % k)}>Next fold</Button>
        <Button
          variant="primary"
          onClick={() => {
            if (reduced) {
              setSeen(new Set(Array.from({ length: k }, (_, i) => i)));
              return;
            }
            if (playing) {
              setPlaying(false);
              return;
            }
            setSeen(new Set([0]));
            setFold(0);
            setPlaying(true);
          }}
        >
          {reduced ? 'Show all folds' : playing ? 'Pause' : 'Play'}
        </Button>
      </div>
    </>
  );
}

// ---------- Step 2: choose the degree ----------

function niceStep(span: number, count: number): number {
  const raw = span / count;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

function DegreeChart({
  cv,
  real,
  degree,
}: {
  cv: number[];
  real: number[] | null;
  degree: number;
}) {
  const H = 290;
  const L = 44;
  const R = 14;
  const T = 26;
  const B = 232;
  const ymax = Math.max(4, Math.ceil(Math.min(...cv) * 3));
  const dx = (d: number) => L + ((d - 1) / (MAX_DEG - 1)) * (W - L - R);
  const dy = (v: number) => B - (Math.min(v, ymax) / ymax) * (B - T);
  const step = niceStep(ymax, 4);
  const ticks: number[] = [];
  for (let t = 0; t <= ymax + 1e-9; t += step) ticks.push(t);
  const bestCv = bestDegree(cv);
  const bestReal = real ? bestDegree(real) : null;
  const line = (v: number[]) =>
    v
      .map((y, i) => `${i === 0 ? 'M' : 'L'}${dx(i + 1).toFixed(1)} ${dy(y).toFixed(1)}`)
      .join('');
  const anyOff = cv.some((y) => y > ymax);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Cross-validation error against degree. Lowest at degree ${bestCv ?? '—'}.${bestReal ? ` The real error is lowest at degree ${bestReal}.` : ''}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={dy(t)} y2={dy(t)} stroke="var(--color-grid)" />
          <text
            x={L - 6}
            y={dy(t) + 5}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text x={L - 6} y={T - 10} fontSize="13" textAnchor="end" fill="var(--color-muted)">
        °C
      </text>
      {Array.from({ length: MAX_DEG }, (_, i) => i + 1).map((d) => (
        <text
          key={d}
          x={dx(d)}
          y={B + 18}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {d}
        </text>
      ))}
      <text x={W - R} y={B + 38} fontSize="13" textAnchor="end" fill="var(--color-muted)">
        degree: how flexible the curve is
      </text>
      <line
        x1={dx(degree)}
        x2={dx(degree)}
        y1={T}
        y2={B}
        stroke="var(--color-ink)"
        strokeWidth="1.2"
        strokeDasharray="1 3"
      />
      <text
        x={dx(degree)}
        y={T - 9}
        fontSize="12"
        textAnchor={degree >= MAX_DEG - 1 ? 'end' : 'middle'}
        fill="var(--color-ink)"
      >
        your degree
      </text>
      {real && (
        <>
          <path
            d={line(real)}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {real.map((v, i) => (
            <rect
              key={`r${i}`}
              x={dx(i + 1) - 4}
              y={dy(v) - 4}
              width="8"
              height="8"
              fill="var(--color-surface)"
              stroke="var(--color-ink)"
              strokeWidth="1.5"
            />
          ))}
          {bestReal !== null && (
            <rect
              x={dx(bestReal) - 9}
              y={dy(real[bestReal - 1]!) - 9}
              width="18"
              height="18"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2.2"
              strokeDasharray="3 2"
            />
          )}
        </>
      )}
      <path
        d={line(cv)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {cv.map((v, i) => (
        <circle
          key={`c${i}`}
          cx={dx(i + 1)}
          cy={dy(v)}
          r={i + 1 === degree ? 6 : 4.2}
          fill="var(--color-accent)"
          stroke="var(--color-surface)"
          strokeWidth="1"
        />
      ))}
      {bestCv !== null && (
        <circle
          cx={dx(bestCv)}
          cy={dy(cv[bestCv - 1]!)}
          r="9.5"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.2"
        />
      )}
      {anyOff && (
        <text x={L + 8} y={T + 14} fontSize="13" fill="var(--color-neg)">
          ▲ off the chart
        </text>
      )}
      {cv.map((v, i) =>
        v > ymax ? (
          <polygon
            key={`a${i}`}
            points={`${dx(i + 1)},${T} ${dx(i + 1) + 5},${T + 10} ${dx(i + 1) - 5},${T + 10}`}
            fill="var(--color-neg)"
          />
        ) : null,
      )}
    </svg>
  );
}

function StepTwo({
  cv,
  real,
  degree,
  k,
  showReal,
  onToggle,
}: {
  cv: number[] | null;
  real: number[];
  degree: number;
  k: number;
  showReal: boolean;
  onToggle: (v: boolean) => void;
}) {
  const bestCv = cv ? bestDegree(cv) : null;
  const bestReal = bestDegree(real);
  return (
    <>
      <StepTitle n={2}>Use the results to choose the degree</StepTitle>
      <Plain>
        Step 1 scored one degree. Here the same turn-taking is repeated for every degree
        from 1 to 12. The lowest point of the line is the degree cross-validation
        recommends.
      </Plain>
      {cv ? (
        <DegreeChart cv={cv} real={showReal ? real : null} degree={degree} />
      ) : (
        <JobSkeleton height={290}>
          Scoring every degree with {k === POOL ? 'leave-one-out' : `${k}-fold`}{' '}
          cross-validation…
        </JobSkeleton>
      )}
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <svg width="26" height="16" aria-hidden="true">
            <line
              x1="1"
              x2="25"
              y1="8"
              y2="8"
              stroke="var(--color-accent)"
              strokeWidth="3"
            />
            <circle cx="13" cy="8" r="4" fill="var(--color-accent)" />
          </svg>
          Cross-validation error
          {bestCv !== null && (
            <strong className="font-semibold text-ink">
              {' '}
              · best: degree {bestCv} (ringed)
            </strong>
          )}
        </li>
        {showReal && (
          <li className="flex items-center gap-1.5">
            <svg width="26" height="16" aria-hidden="true">
              <line
                x1="1"
                x2="25"
                y1="8"
                y2="8"
                stroke="var(--color-ink)"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
              <rect
                x="9"
                y="4"
                width="8"
                height="8"
                fill="var(--color-surface)"
                stroke="var(--color-ink)"
                strokeWidth="1.5"
              />
            </svg>
            Real error on new data
            {bestReal !== null && (
              <strong className="font-semibold text-ink">
                {' '}
                · best: degree {bestReal}
              </strong>
            )}
          </li>
        )}
      </ul>
      <div className="mt-1">
        <Toggle
          label="Reveal the real answer (only a simulation can show this)"
          checked={showReal}
          onChange={onToggle}
        />
      </div>
      {showReal && (
        <p className="m-0 text-xs text-muted">
          The dashed line is how the curve really does on new data. A real project can’t
          draw it. Cross-validation is how you approximate it, and the two lowest points
          should be close.
        </p>
      )}
    </>
  );
}

// ---------- Step 3: is one dataset luck? ----------

const METHODS: { key: 'single' | 'k5'; label: string; shape: DotShape }[] = [
  { key: 'single', label: 'One split (25% held back)', shape: 'triangle' },
  { key: 'k5', label: '5-fold cross-validation', shape: 'filled-circle' },
];

function StepThree({
  presses,
  result,
  onRepeat,
}: {
  presses: number;
  result: CvPicks | null;
  onRepeat: () => void;
}) {
  const waiting = presses > 0 && !result;
  return (
    <>
      <StepTitle n={3}>Is one dataset just luck?</StepTitle>
      <Plain>
        A different set of 40 points could recommend a different degree. Press the button
        to try 100 new datasets. Each shape below is one dataset’s recommended degree. A
        narrow pile means the method gives about the same answer every time.
      </Plain>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={waiting} onClick={onRepeat}>
          Try 100 new datasets
        </Button>
        <span className="text-xs text-muted">
          {waiting ? 'Running…' : result ? `Done (run ${presses})` : 'Nothing run yet'}
        </span>
      </div>
      <div className="mt-3 min-h-[360px]">
        {waiting ? (
          <JobSkeleton height={360}>Choosing a degree 200 times…</JobSkeleton>
        ) : result ? (
          <>
            <div className="flex flex-col gap-1">
              {METHODS.map((m, i) => (
                <PickHist
                  key={m.key}
                  picks={result[m.key].picks}
                  maxValue={MAX_DEG}
                  label={m.label}
                  shape={m.shape}
                  unit="recommended degree"
                  last={i === METHODS.length - 1}
                />
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {METHODS.map((m) => {
                const p = result[m.key].picks;
                return (
                  <StatCard
                    key={m.key}
                    label={
                      <>
                        <ShapeSwatch shape={m.shape} /> {m.label}
                      </>
                    }
                    value={`${Math.min(...p)} to ${Math.max(...p)}`}
                    plain="range of recommended degrees"
                  >
                    <div className="mt-1 font-mono text-sm tabular-nums">
                      {fmtErr(median(result[m.key].errors))} °C
                    </div>
                    <div className="text-xs leading-tight text-muted">
                      typical error on new data when you follow its advice
                    </div>
                  </StatCard>
                );
              })}
            </div>
          </>
        ) : (
          <p className="m-0 rounded-md border border-dashed border-grid px-3 py-8 text-center text-sm text-muted">
            Press the button to see how steady each method is.
          </p>
        )}
      </div>
    </>
  );
}

function Inner() {
  const { seed } = usePage();
  const [k, setK] = useState(5);
  const [degree, setDegree] = useState(3);
  const [showReal, setShowReal] = useState(false);
  const [presses, setPresses] = useState(0);
  const result = useJob('cvPicks', presses > 0 ? { seed: seed + presses * 7919 } : null);

  const pool = useMemo(() => temperaturePool(seed, POOL, NOISE), [seed]);
  const folds = useMemo(() => kFoldIndices(POOL, k, seed + 3), [seed, k]);
  const cv = useMemo(
    () => (folds ? cvPoly(pool.x, pool.y, degree, folds) : null),
    [pool, folds, degree],
  );
  const cvCurve = useJob('cvCurve', { seed, k });
  const real = useMemo(() => realErrorByDegree(pool.x, pool.y, NOISE, MAX_DEG), [pool]);
  const bestCv = cvCurve ? bestDegree(cvCurve) : null;

  const range = (p: number[]) => `${Math.min(...p)} to ${Math.max(...p)}`;
  const better =
    result && median(result.k5.errors) < median(result.single.errors)
      ? 'and following its advice gave lower error on new data'
      : 'with a similar error on new data';

  return (
    <>
      <SegmentedControl
        label="Folds: how many groups the 40 points are dealt into"
        options={K_OPTIONS}
        value={String(k)}
        onChange={(v) => setK(Number(v))}
      />
      <div className="mt-2">
        <Slider
          label="Degree: how flexible the curve is"
          value={degree}
          min={1}
          max={MAX_DEG}
          step={1}
          onChange={(v) => setDegree(Math.max(1, Math.min(MAX_DEG, Math.round(v))))}
          format={String}
        />
      </div>

      <StepOne key={`${seed}:${k}`} seed={seed} k={k} degree={degree} />
      <StepTwo
        cv={cvCurve}
        real={real}
        degree={degree}
        k={k}
        showReal={showReal}
        onToggle={setShowReal}
      />
      <StepThree
        presses={presses}
        result={result}
        onRepeat={() => setPresses((p) => p + 1)}
      />

      <Reading>
        {cv ? (
          <>
            {k === POOL ? 'Leave one out' : `${k} folds`}, degree {degree}:
            cross-validation error {fmtErr(cv.pooledRmse)} °C.
            {bestCv !== null && <> Best degree by cross-validation: {bestCv}.</>}
            {showReal && <> Best degree on new data: {bestDegreeOf(real)}.</>}
          </>
        ) : (
          'No folds to show.'
        )}
        {result && (
          <>
            {' '}
            Across 100 datasets, one split recommended degrees{' '}
            {range(result.single.picks)}. 5-fold stayed within {range(result.k5.picks)},{' '}
            {better}.
          </>
        )}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {cv
          ? `${k} folds, degree ${degree}: cross-validation error ${fmtErr(cv.pooledRmse)}`
          : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New data</Button>
        <Button
          onClick={() => {
            setK(5);
            setDegree(3);
            setShowReal(false);
            setPresses(0);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

const bestDegreeOf = (v: number[]): number => bestDegree(v) ?? 1;

export function FoldsInMotion() {
  return (
    <ClientOnly
      minHeight={1900}
      minHeightWide={1800}
      label="Folds in motion: cross-validation step by step"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
