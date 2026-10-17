import { useMemo, useState } from 'react';
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
  type SwatchKind,
  Reading,
  TruthLine,
  exitsOf,
  fmtErr,
} from './charts';
import {
  belowNoiseFloor,
  expectedError,
  fitPoly,
  fitReading,
  gridPredictions,
  makeStream,
  rmse,
  trainingSet,
} from './fit';
import { N_OPTIONS, capFor, pageActions, usePage } from './store';

export const bendsText = (d: number): string =>
  d === 1
    ? '1 = straight line, no bends'
    : `${d} = up to ${d - 1} bend${d - 1 > 1 ? 's' : ''}`;

const CHIP = {
  underfit: '▬ Too stiff: underfitting',
  'good fit': '● A fair fit',
  overfit: '▲ Chasing noise: overfitting',
} as const;

export const NPILLS = N_OPTIONS.map((v) => ({ value: String(v), label: String(v) }));

function Inner() {
  const { seed, n, noiseSd, degree } = usePage();
  const [showTruth, setShowTruth] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const cap = capFor(n);

  const data = useMemo(
    () => trainingSet(makeStream(seed, n), n, noiseSd),
    [seed, n, noiseSd],
  );
  const fresh = useMemo(
    () => trainingSet(makeStream(seed + 500, 30), 30, noiseSd),
    [seed, noiseSd],
  );
  const fit = useMemo(() => {
    const model = fitPoly(data.x, data.y, degree);
    const values = gridPredictions(model);
    return {
      values,
      train: rmse(model, data.x, data.y),
      test: expectedError(model, noiseSd),
      exits: exitsOf(values),
    };
  }, [data, degree, noiseSd]);

  const label = fitReading({ train: fit.train, test: fit.test, noise: noiseSd });
  const memorized = degree === n - 1 && fit.train < 0.05;
  const below = belowNoiseFloor(fit.train, noiseSd) && label === 'overfit';
  const shape = degree === 1 ? 'line' : 'curve';
  const verdict =
    label === 'underfit'
      ? `The ${shape} is too stiff to follow the daily cycle.`
      : label === 'good fit'
        ? 'The curve follows the daily cycle without chasing single dots.'
        : 'The curve bends to chase single dots, noise included.';
  const legend: [SwatchKind, string][] = [['train', 'training points']];
  if (showNew) legend.push(['fresh', 'new points']);
  legend.push(['fit', 'the fit']);
  if (showTruth) legend.push(['truth', 'truth']);
  const summary = `Degree ${degree}: training error ${fmtErr(fit.train)}, error on new data ${fmtErr(fit.test)}, ${
    label === 'good fit'
      ? 'a fair fit'
      : label === 'underfit'
        ? 'too stiff'
        : 'chasing noise'
  }`;

  return (
    <>
      <Slider
        label="Degree: how flexible the curve is"
        value={degree}
        min={1}
        max={cap}
        step={1}
        onChange={pageActions.setDegree}
        format={String}
      />
      <p className="m-0 text-xs text-muted">{bendsText(degree)}</p>
      {cap < 12 && (
        <p className="m-0 mt-1 text-xs text-muted">
          With {n} points, the most flexible curve allowed is degree {cap}.
        </p>
      )}

      <div className="mt-3">
        <HourChart
          label={`Temperature through the day: ${n} training points and a degree ${degree} curve. ${summary}.`}
          overlay={<OffChart exits={fit.exits} />}
        >
          {showTruth && <TruthLine />}
          <Dots xs={data.x} ys={data.y} r={n > 50 ? 2.6 : 3.8} />
          {showNew && <Dots xs={fresh.x} ys={fresh.y} hollow />}
          <Curve values={fit.values} width={3.2} />
        </HourChart>
        <Legend items={legend} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ErrorCard
          label="Training error"
          tech="train RMSE"
          value={fit.train}
          noise={noiseSd}
          plain="average gap to the dots it learned from"
        />
        <ErrorCard
          label="Error on new data"
          tech="expected test error"
          value={fit.test}
          noise={noiseSd}
          plain="expected gap to fresh points"
          filled={false}
        />
      </div>
      <p
        className="m-0 mt-2 inline-block rounded-full border border-grid px-3 py-0.5 text-sm font-semibold"
        role="status"
      >
        {CHIP[label]}
      </p>

      {memorized ? (
        <Note icon="⚠">
          The curve passes through every point: training error 0. That isn&rsquo;t a
          perfect model, it is a memorized one.
        </Note>
      ) : (
        below && (
          <Note icon="⚠">
            Training error {fmtErr(fit.train)} is below the noise floor{' '}
            {noiseSd.toFixed(1)}. The curve is fitting noise.
          </Note>
        )
      )}

      <Reading>
        Degree {degree}: training error {fmtErr(fit.train)}, error on new data{' '}
        {fmtErr(fit.test)}. {verdict}
        {showNew && (
          <>
            {' '}
            The hollow circles are 30 fresh points for a feel. The number is the expected
            error on all fresh points, not on these 30.
          </>
        )}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3">
        <SegmentedControl
          label="Points to learn from"
          options={NPILLS}
          value={String(n)}
          onChange={(v) => pageActions.setN(Number(v))}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Toggle
          label="Show what the world really does"
          checked={showTruth}
          onChange={setShowTruth}
        />
        <Toggle label="Show 30 new points" checked={showNew} onChange={setShowNew} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New data</Button>
        <Button
          onClick={() => {
            pageActions.reset();
            setShowTruth(true);
            setShowNew(false);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function FitTheCurve() {
  return (
    <ClientOnly
      minHeight={900}
      label="Fit the curve: move the flexibility slider and watch both errors"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
