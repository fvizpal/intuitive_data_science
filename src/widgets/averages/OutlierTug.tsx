import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { OUTLIER_DEFAULT, OUTLIER_MAX, TURNOVERS, f0, f1 } from './data';
import { DotPlot } from './DotPlot';
import { MEAN_COLOR, MEDIAN_COLOR, MarkerLegend } from './Markers';
import { GUESS_ANSWER, GUESS_OPTIONS, useGuess } from './store';
import { mean, median } from './stats';

/** The most either average can move: the outlier at its maximum. */
const BAR_MAX = 20;

const baseMean = mean(TURNOVERS);
const baseMedian = median(TURNOVERS);

function MoveBar({
  label,
  delta,
  color,
}: {
  label: string;
  delta: number;
  color: string;
}) {
  const pct = Math.min(100, (delta / BAR_MAX) * 100);
  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono">moved {f1(delta)}</span>
      </div>
      <div className="h-3 rounded-sm bg-bg">
        <div
          className="h-full rounded-sm transition-[width] duration-200"
          style={{ width: `${Math.max(delta > 0 ? 1.5 : 0, pct)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Inner() {
  const guess = useGuess();
  const [outlier, setOutlier] = useState(OUTLIER_DEFAULT);
  const [removed, setRemoved] = useState(false);

  const values = removed ? [...TURNOVERS] : [...TURNOVERS, Math.round(outlier)];
  const m = mean(values);
  const med = median(values);
  const dMean = Math.abs(m - baseMean);
  const dMedian = Math.abs(med - baseMedian);
  const nBelowMean = values.filter((v) => v < m).length;
  const nearest = Math.min(...values.map((v) => Math.abs(v - m)));
  const lonely = nearest > 2;
  const atDefault = !removed && Math.round(outlier) === OUTLIER_DEFAULT;
  const outlierIndex = TURNOVERS.length;

  const summary = removed
    ? `Without the outlier: mean ${f1(m)}, median ${f1(med)}.`
    : `Mean ${f1(m)}, median ${f1(med)}. The mean moved by ${f1(dMean)}, the median by ${f1(dMedian)}.`;

  return (
    <>
      <Slider
        label="Size of the one very large business (₹ lakh)"
        value={outlier}
        min={0}
        max={OUTLIER_MAX}
        step={1}
        format={(v) => f0(v)}
        onChange={(v) => {
          setRemoved(false);
          setOutlier(Math.round(v));
        }}
      />
      <div className="mt-2">
        <DotPlot
          values={values}
          domain={[0, OUTLIER_MAX]}
          tickStep={25}
          height={170}
          radius={5}
          label={`Dot plot of ${values.length} monthly turnovers in lakh`}
          mean={m}
          median={med}
          draggable={(i) => !removed && i === outlierIndex}
          onMove={(_, v) => setOutlier(v)}
          onCommit={(_, v) => setOutlier(Math.round(v))}
          keyStep={2}
          dotLabel={(_, v) => `One very large business, ${Math.round(v)} lakh`}
          dotStyle={(i) =>
            i === outlierIndex && !removed
              ? { hollow: true, color: 'var(--color-neg)' }
              : {}
          }
          over={({ x, axisY }) =>
            removed ? null : (
              <text
                x={Math.min(Math.max(x(outlier), 80), 330)}
                y={axisY - 56}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="var(--color-neg)"
              >
                ◯ one very large business
              </text>
            )
          }
        />
      </div>
      <MarkerLegend mode={false} />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Metric
            label="▲ Mean"
            value={f1(m)}
            tone="accent"
            hint={`higher than ${nBelowMean} of ${values.length} businesses`}
          />
          <MoveBar
            label="Mean vs no outlier"
            delta={removed ? 0 : dMean}
            color={MEAN_COLOR}
          />
        </div>
        <div>
          <Metric
            label="◆ Median"
            value={f1(med)}
            hint={`${Math.floor(values.length / 2)} businesses below, ${Math.floor(values.length / 2)} above`}
          />
          <MoveBar
            label="Median vs no outlier"
            delta={removed ? 0 : dMedian}
            color={MEDIAN_COLOR}
          />
        </div>
      </div>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        {removed
          ? `Without the outlier: the mean is ${f1(m)} and the median is ${f1(med)}. Close together.`
          : `The mean moved by ${f1(dMean)}. The median moved by ${f1(dMedian)}.`}
      </p>
      {lonely && (
        <p className="m-0 mt-1 text-sm">
          <span aria-hidden="true">⚠ </span>
          No business is near the mean of {f1(m)}. It lands in empty space, where nobody
          actually is.
        </p>
      )}

      <div
        className="mt-3 rounded-md border-l-4 bg-bg p-3 text-sm"
        style={{ borderColor: atDefault ? 'var(--color-accent)' : 'var(--color-grid)' }}
      >
        {atDefault ? (
          <>
            <p className="m-0 font-semibold">Answer to the prediction: about 6.</p>
            <p className="m-0 mt-1">
              The median ({f1(med)}) sits among the crowd. The mean ({f1(m)}) was dragged
              out to where no business is.
              {guess !== null &&
                (guess === GUESS_ANSWER
                  ? ' You picked about 6: right.'
                  : ` You picked ${GUESS_OPTIONS[guess]}: not quite.`)}
            </p>
          </>
        ) : (
          <p className="m-0 text-muted">
            Put the big business back at {OUTLIER_DEFAULT} to see the answer to the
            prediction.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle label="Remove the outlier" checked={removed} onChange={setRemoved} />
        <Button
          onClick={() => {
            setOutlier(OUTLIER_DEFAULT);
            setRemoved(false);
          }}
        >
          Reset
        </Button>
      </div>
      <p role="status" className="sr-only">
        {summary}
      </p>
    </>
  );
}

export function OutlierTug() {
  return (
    <ClientOnly
      minHeight={640}
      label="Outlier tug: move one very large business and watch the mean and the median"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
