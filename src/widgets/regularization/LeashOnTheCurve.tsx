import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  Curve,
  Dots,
  ErrorCard,
  HourChart,
  Legend,
  Note,
  OffChart,
  TruthLine,
  exitsOf,
  type SwatchKind,
} from '../biasvar/charts';
import {
  DEFAULT_NOISE,
  belowNoiseFloor,
  expectedError,
  fitReading,
  gridPredictions,
  makeStream,
  rmse,
  trainingSet,
} from '../biasvar/fit';
import { JobSkeleton } from '../validation/charts';
import { useJob } from './jobs';
import { LEASH_DEGREE, LEASH_GRID, type LeashCurves } from './leash';
import { fitRidgePoly } from './ridge';
import { pageActions, type LeashShape } from './store';
import {
  Card,
  ClipArrow,
  Label,
  LegendRow,
  PenaltyXAxis,
  Reading,
  SwExact,
  SwFloor,
  SwMarker,
  SwSweet,
  SwTrain,
  fmtErr,
  fmtLam,
  niceTicks,
  penaltyFrame,
  penaltyTicks,
  r1,
} from './charts';

const PARAMS = LEASH_DEGREE + 1;
const DEFAULT_LEASH_SEED = 1;
const DEFAULT_LEASH_N = 20;
const NPILLS = [15, 20, 50].map((v) => ({ value: String(v), label: String(v) }));
const LAST = LEASH_GRID.length - 1;

const CHIP = {
  underfit: '▬ Too stiff: underfitting',
  'good fit': '● A fair fit',
  overfit: '▲ Chasing noise: overfitting',
} as const;

export function shapeOfCurves(c: LeashCurves): LeashShape {
  return c.best === 0
    ? 'rises-first'
    : c.best === c.lambdas.length - 1
      ? 'keeps-falling'
      : 'falls-then-rises';
}

function TryEveryPenalty({
  c,
  pos,
  noise,
}: {
  c: LeashCurves;
  pos: number;
  noise: number;
}) {
  const uid = useId().replace(/:/g, '');
  const f = penaltyFrame(c.lambdas.length, { H: 340, B: 50 });
  const bestTest = c.test[c.best]!;
  const yMax = Math.max(6, 2.6 * bestTest);
  const y = (v: number) => f.T + (1 - Math.min(v, yMax * 1.05) / yMax) * f.ph;
  const ticks = niceTicks(0, yMax, 4);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${r1(f.x(i))} ${r1(y(v))}`).join('');
  const clipped = c.test.map((v, i) => (v > yMax ? i : -1)).filter((i) => i >= 0);
  const bx = f.x(c.best);
  const by = y(bestTest);
  const labelRight = bx < f.L + f.pw * 0.6;
  return (
    <svg
      viewBox={`0 0 ${f.W} ${f.H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${f.W} / ${f.H}` }}
      role="img"
      aria-label={`Average training error and average error on new data against penalty strength. Lowest error on new data at penalty ${fmtLam(c.lambdas[c.best]!)}.`}
    >
      <defs>
        <clipPath id={`pb${uid}`}>
          <rect x={f.L} y={f.T} width={f.pw} height={f.ph} />
        </clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={f.L} x2={f.W - f.R} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" />
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
        fontSize="14"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        °C
      </text>
      <PenaltyXAxis f={f} ticks={penaltyTicks(c.lambdas)} />
      <g clipPath={`url(#pb${uid})`}>
        <line
          x1={f.L}
          x2={f.W - f.R}
          y1={y(noise)}
          y2={y(noise)}
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeDasharray="2 5"
        />
        <path
          d={line(c.test)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.6"
          strokeDasharray="7 4"
        />
        <path d={line(c.train)} fill="none" stroke="var(--color-ink)" strokeWidth="2.4" />
        {c.train.map((v, i) => (
          <circle
            key={`t${i}`}
            cx={r1(f.x(i))}
            cy={r1(y(v))}
            r="3.4"
            fill="var(--color-ink)"
          />
        ))}
        {c.test.map((v, i) =>
          v > yMax ? null : (
            <rect
              key={`e${i}`}
              x={r1(f.x(i) - 3.6)}
              y={r1(y(v) - 3.6)}
              width="7.2"
              height="7.2"
              fill="var(--color-surface)"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          ),
        )}
      </g>
      {clipped.map((i, k) => (
        <ClipArrow
          key={i}
          x={f.x(i)}
          y={f.T + 1}
          label={k === 0 ? `${fmtErr(c.test[i]!)} →` : undefined}
          anchor="start"
        />
      ))}
      <Label x={f.L + 6} y={y(noise) - 6}>
        Noise floor {noise.toFixed(1)}
      </Label>
      <line
        x1={bx}
        x2={bx}
        y1={by}
        y2={f.T + f.ph}
        stroke="var(--color-good)"
        strokeWidth="1.6"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      <polygon
        points={`${bx},${by - 10} ${bx + 9},${by} ${bx},${by + 10} ${bx - 9},${by}`}
        fill="var(--color-surface)"
        stroke="var(--color-good)"
        strokeWidth="2.6"
      />
      <Label
        x={labelRight ? bx + 14 : bx - 14}
        y={Math.max(f.T + 46, by - 16)}
        anchor={labelRight ? 'start' : 'end'}
        size={15}
        weight={600}
      >
        Sweet spot: {fmtLam(c.lambdas[c.best]!)}
      </Label>
      <line
        x1={f.x(pos)}
        x2={f.x(pos)}
        y1={f.T}
        y2={f.T + f.ph}
        stroke="var(--color-ink)"
        strokeWidth="1.6"
      />
      <polygon
        points={`${f.x(pos)},${f.T + f.ph + 2} ${f.x(pos) + 7},${f.T + f.ph + 14} ${f.x(pos) - 7},${f.T + f.ph + 14}`}
        fill="var(--color-ink)"
      />
    </svg>
  );
}

function Inner() {
  const [seed, setSeed] = useState(DEFAULT_LEASH_SEED);
  const [n, setN] = useState(DEFAULT_LEASH_N);
  const [pos, setPos] = useState(0);
  const [showTruth, setShowTruth] = useState(true);
  const noise = DEFAULT_NOISE;
  const lambda = LEASH_GRID[pos]!;

  const data = useMemo(
    () => trainingSet(makeStream(seed, n), n, noise),
    [seed, n, noise],
  );
  const fit = useMemo(() => {
    const f = fitRidgePoly(data.x, data.y, LEASH_DEGREE, lambda);
    const values = gridPredictions(f.model);
    return {
      values,
      train: rmse(f.model, data.x, data.y),
      test: expectedError(f.model, noise),
      df: f.effectiveDf,
      exits: exitsOf(values),
    };
  }, [data, lambda, noise]);

  const curves = useJob('leash', { seed, n });
  const shape = curves ? shapeOfCurves(curves) : null;
  const atDefaults = seed === DEFAULT_LEASH_SEED && n === DEFAULT_LEASH_N;
  useEffect(() => {
    if (shape) pageActions.setLeash({ shape, atDefaults, n });
  }, [shape, atDefaults, n]);

  const label = fitReading({ train: fit.train, test: fit.test, noise });
  const below = belowNoiseFloor(fit.train, noise);
  const atSweet = curves ? pos === curves.best : false;
  const flat = label === 'underfit' && fit.df < 2;
  const ofParams = `${fit.df.toFixed(1)} of ${PARAMS}`;

  let reading: string;
  if (pos === 0) {
    reading = `No penalty: training error ${fmtErr(fit.train)}${below ? ` (below the noise floor ${noise.toFixed(1)})` : ''}, error on new data ${fmtErr(fit.test)}. ${
      label === 'overfit'
        ? 'The curve is fitting noise.'
        : 'The curve is not chasing noise at this setting.'
    }`;
  } else if (flat) {
    reading = `Very strong penalty (${fmtLam(lambda)}): the curve is nearly flat. Too stiff.`;
  } else {
    const d = curves ? pos - curves.best : 0;
    const verdict = !curves
      ? ''
      : atSweet
        ? 'This is the sweet spot for these training sets.'
        : d < 0
          ? label === 'overfit'
            ? 'Left of the sweet spot: still chasing noise.'
            : 'Left of the sweet spot.'
          : label === 'underfit'
            ? 'Past the sweet spot: too stiff.'
            : 'Past the sweet spot: getting stiffer.';
    reading = `Penalty ${fmtLam(lambda)}: training error ${fmtErr(fit.train)}, error on new data ${fmtErr(fit.test)}. Effective flexibility ${ofParams}. ${verdict}`;
  }
  const summary = `${pos === 0 ? 'No penalty' : `Penalty ${fmtLam(lambda)}`}: training error ${fmtErr(fit.train)}, error on new data ${fmtErr(fit.test)}, effective flexibility ${ofParams}`;
  const legend: [SwatchKind, string][] = [
    ['train', 'training points'],
    ['fit', 'the fit'],
  ];
  if (showTruth) legend.push(['truth', 'truth']);
  const reset = () => {
    setSeed(DEFAULT_LEASH_SEED);
    setN(DEFAULT_LEASH_N);
    setPos(0);
    setShowTruth(true);
  };

  return (
    <>
      <div className="sticky top-0 z-10 -mx-3 border-b border-grid bg-surface px-3 pb-2 pt-2 sm:-mx-4 sm:px-4">
        <Slider
          label="Penalty strength (lambda)"
          value={pos}
          min={0}
          max={LAST}
          step={1}
          onChange={(v) => setPos(Math.round(v))}
          format={(v) => (v === 0 ? 'No penalty' : fmtLam(LEASH_GRID[Math.round(v)]!))}
        />
        <p className="m-0 mt-1 text-xs text-muted">{summary}</p>
      </div>

      <div className="mt-3">
        <HourChart
          label={`Temperature through the day: ${n} training points and a ridge-fitted curve with up to 11 bends. ${summary}.`}
          overlay={<OffChart exits={fit.exits} />}
        >
          {showTruth && <TruthLine />}
          <Dots xs={data.x} ys={data.y} r={n > 30 ? 2.8 : 3.8} />
          <Curve values={fit.values} width={3.2} />
        </HourChart>
        <Legend items={legend} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ErrorCard
          label="Training error"
          tech="train RMSE"
          value={fit.train}
          noise={noise}
          plain="average gap to the dots it learned from"
        />
        <ErrorCard
          label="Error on new data"
          tech="expected test error"
          value={fit.test}
          noise={noise}
          plain="expected gap to fresh points"
          filled={false}
        />
        <Card
          label="Effective flexibility"
          value={ofParams}
          plain={`how many of the curve's ${PARAMS} knobs are really in use`}
        >
          <svg
            viewBox="0 0 200 14"
            className="mt-1 block h-auto w-full"
            aria-hidden="true"
          >
            <rect
              x="0"
              y="2"
              width="200"
              height="10"
              fill="var(--color-grid)"
              opacity="0.5"
            />
            <rect
              x="0"
              y="2"
              width={Math.max(1, (Math.min(fit.df, PARAMS) / PARAMS) * 200)}
              height="10"
              fill="var(--color-accent)"
            />
          </svg>
        </Card>
      </div>
      <p
        className="m-0 mt-2 inline-block rounded-full border border-grid px-3 py-0.5 text-sm font-semibold"
        role="status"
      >
        {CHIP[label]}
      </p>
      {pos === 0 && below && (
        <Note icon="⚠">
          Training error {fmtErr(fit.train)} is below the noise floor {noise.toFixed(1)}.
          The curve is fitting noise.
        </Note>
      )}

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3">
        <SegmentedControl
          label="Points to learn from"
          options={NPILLS}
          value={String(n)}
          onChange={(v) => setN(Number(v))}
        />
      </div>
      <div className="mt-2">
        <Toggle
          label="Show what the world really does"
          checked={showTruth}
          onChange={setShowTruth}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => setSeed((s) => s + 1000)}>New data</Button>
        <Button onClick={reset}>Reset</Button>
      </div>

      <h4 className="mb-1 mt-6 text-sm font-semibold">Try every penalty</h4>
      <p className="m-0 mb-2 text-xs text-muted">
        Each point averages 60 different sets of {n} training points, so one lucky draw
        can&rsquo;t fool you.
      </p>
      {curves ? (
        <>
          <TryEveryPenalty c={curves} pos={pos} noise={noise} />
          <LegendRow
            items={[
              [SwTrain, 'Training error (solid, circles)'],
              [SwExact, 'Error on new data (dashed, squares)'],
              [SwFloor, 'Noise floor'],
              [SwSweet, 'Sweet spot: lowest error on new data'],
              [SwMarker, 'Your penalty'],
            ]}
          />
          <p className="m-0 mt-2 text-xs text-muted">
            Red arrows mean the value is off the top of the chart; the label gives its
            size. Without a penalty a bendy curve can swing wildly between points.
          </p>
        </>
      ) : (
        <JobSkeleton height={340}>Trying 41 penalties on 60 training sets…</JobSkeleton>
      )}
    </>
  );
}

export function LeashOnTheCurve() {
  return (
    <ClientOnly
      minHeight={1500}
      minHeightWide={1420}
      label="A leash on the curve: raise the penalty and watch the curve and both errors"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
