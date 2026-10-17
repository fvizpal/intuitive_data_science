import { useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { SHOWN_SETS, meanCurve, partsAt, shownCurve } from './bank';
import {
  CH,
  Curve,
  HourChart,
  Legend,
  OffChart,
  Patterns,
  Reading,
  Skeleton,
  TruthLine,
  exitsOf,
  fmtErr,
  px,
  py,
  type SwatchKind,
} from './charts';
import { bendsText } from './FitTheCurve';
import { capFor, pageActions, usePage } from './store';
import { useBank } from './useBank';

type Part = 'bias' | 'var' | 'noise';

function PartCard({
  id,
  label,
  value,
  hint,
  kind,
}: {
  id: string;
  label: string;
  value: number;
  hint: string;
  kind: Part | 'total';
}) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        {kind !== 'total' && (
          <svg width="22" height="14" aria-hidden="true" className="shrink-0">
            <rect
              width="22"
              height="14"
              fill={`url(#${id}-${kind})`}
              stroke="var(--color-ink)"
              strokeWidth="1"
            />
          </svg>
        )}
        <span>{label}</span>
      </div>
      <div className="font-mono text-xl font-semibold tabular-nums">
        {fmtErr(value)} <span className="text-xs font-normal text-muted">°C²</span>
      </div>
      <div className="text-xs leading-tight text-muted">{hint}</div>
    </div>
  );
}

function Inner() {
  const { seed, n, noiseSd, degree } = usePage();
  const [avgOnly, setAvgOnly] = useState(false);
  const bank = useBank(seed, n);
  const patId = `pat${useId().replace(/:/g, '')}`;
  const cap = capFor(n);

  const view = useMemo(() => {
    if (!bank) return null;
    const mean = meanCurve(bank, degree, noiseSd);
    const faint = Array.from({ length: Math.min(SHOWN_SETS, bank.sets) }, (_, k) =>
      shownCurve(bank, degree, noiseSd, k),
    );
    return {
      parts: partsAt(bank, degree, noiseSd),
      mean,
      faint,
      meanExits: exitsOf(mean),
      faintOff: faint.some((c) => exitsOf(c, 1).length > 0),
    };
  }, [bank, degree, noiseSd]);

  if (!view) return <Skeleton height={720} />;
  const { parts, mean } = view;
  const { bias2, variance, noise2, total } = parts;

  const dominant: Part =
    bias2 >= variance && bias2 >= noise2 ? 'bias' : variance >= noise2 ? 'var' : 'noise';
  const dominantText = {
    bias: 'Mostly bias: the model is too stiff.',
    var: 'Mostly variance: the model changes a lot with each sample.',
    noise: 'Mostly noise: you are near the best this data allows.',
  }[dominant];

  // "Agree" and "close" are plain-words conventions: a typical spread under 1.5 °C (variance
  // 2.25), unless the curves are spread more than half as much as the average is off.
  const agree = !(variance > 2.25 && variance > bias2 / 2);
  const close = bias2 <= 1.5;
  const v = fmtErr(variance);
  const b = fmtErr(bias2);
  const clause =
    agree && !close
      ? `the 30 curves agree with each other (variance ${v}) but their average sits far from the truth (bias² ${b}).`
      : !agree && close
        ? `the curves disagree with each other (variance ${v}) though their average sits close to the truth (bias² ${b}).`
        : !agree && !close
          ? `the curves disagree with each other (variance ${v}) and their average is also far from the truth (bias² ${b}).`
          : `the curves agree with each other (variance ${v}) and their average sits close to the truth (bias² ${b}).`;

  // Stacked bar: widths are shares of the total.
  const BW = 560;
  const shares = [bias2, variance, noise2].map((x) => (total > 0 ? x / total : 0));
  let acc = 0;
  const segs = (['bias', 'var', 'noise'] as const).map((k, i) => {
    const x = acc;
    const w = shares[i]! * BW;
    acc += w;
    return { k, x, w };
  });

  // Direct label for the average, kept inside the chart.
  const labelH = 18;
  const mAt = mean[Math.round((labelH / 24) * (mean.length - 1))]!;
  const labelY = Math.max(CH.T + 30, Math.min(CH.H - CH.B - 14, py(mAt) - 12));

  const summary = `Degree ${degree}: bias² ${fmtErr(bias2)}, variance ${fmtErr(variance)}, noise ${fmtErr(noise2)}, total ${fmtErr(total)}. ${dominantText}`;
  const legend: [SwatchKind, string][] = [];
  if (!avgOnly) legend.push(['faint', '30 of the 200 fits']);
  legend.push(['avg', 'Average of all fits'], ['truth', 'truth']);

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
          label={`Many fits of the same model on different samples, degree ${degree}. ${summary}`}
          overlay={
            <g>
              <OffChart exits={view.meanExits} />
              <text
                x={px(labelH)}
                y={labelY}
                fontSize="15"
                fontWeight="600"
                textAnchor="middle"
                fill="var(--color-accent)"
                stroke="var(--color-surface)"
                strokeWidth="4"
                paintOrder="stroke"
              >
                Average of all fits
              </text>
            </g>
          }
        >
          <TruthLine label={false} />
          {!avgOnly &&
            view.faint.map((c, k) => (
              <Curve key={k} values={c} width={1.2} opacity={0.3} />
            ))}
          <Curve values={mean} width={5} />
        </HourChart>
        <Legend items={legend} />
        <p className="m-0 mt-1 text-xs text-muted">
          The numbers below use all 200 samples of {n} points.
          {view.faintOff && !avgOnly && ' Some thin curves leave the chart.'}
        </p>
      </div>

      <svg
        viewBox={`0 0 600 34`}
        className="mt-3 block h-auto w-full"
        role="img"
        aria-label={`Stacked bar of the total error: bias² ${fmtErr(bias2)}, variance ${fmtErr(variance)}, noise ${fmtErr(noise2)}.`}
        style={{ aspectRatio: '600 / 34' }}
      >
        <Patterns prefix={patId} />
        {segs.map((s) => (
          <rect
            key={s.k}
            x={20 + s.x}
            y="4"
            width={Math.max(0, s.w)}
            height="26"
            fill={`url(#${patId}-${s.k})`}
            stroke="var(--color-ink)"
            strokeWidth={s.w > 0.5 ? 1.5 : 0}
          />
        ))}
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PartCard
          id={patId}
          kind="bias"
          label="Bias²"
          value={bias2}
          hint="how far the average curve is from the truth"
        />
        <PartCard
          id={patId}
          kind="var"
          label="Variance"
          value={variance}
          hint="how much the curves disagree"
        />
        <PartCard
          id={patId}
          kind="noise"
          label="Noise"
          value={noise2}
          hint="can't be removed"
        />
        <PartCard
          id={patId}
          kind="total"
          label="Total"
          value={total}
          hint="expected squared error on new data"
        />
      </div>
      <p className="m-0 mt-2 text-xs text-muted">
        Squared degrees (°C²): bias² + variance + noise = total.
      </p>
      <p className="m-0 mt-2 text-sm font-semibold">{dominantText}</p>

      <Reading>
        Degree {degree}: {clause}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Toggle label="Show average only" checked={avgOnly} onChange={setAvgOnly} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New samples</Button>
        <Button
          onClick={() => {
            pageActions.reset();
            setAvgOnly(false);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function ManySamples() {
  return (
    <ClientOnly
      minHeight={1000}
      label="Many samples: the same model trained on 200 different samples"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
