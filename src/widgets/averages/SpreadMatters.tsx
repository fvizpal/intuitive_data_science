import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { normalSample, standardize } from '../../lib/datasets';
import { f0, f1 } from './data';
import { DotPlot } from './DotPlot';
import { MEAN_COLOR } from './Markers';
import { mean, range, std } from './stats';

const N = 30;
const CENTER = 10;
const SPREAD_MIN = 0.5;
const SPREAD_DEFAULT_A = 1;
const SPREAD_DEFAULT_B = 3.5;
const SEED_DEFAULT = 1;

function reading(sd: number): string {
  if (sd <= 1.6) return 'Tight: most values are close to the average.';
  if (sd >= 3) return 'Wide: the average is a weak guide.';
  return 'In between: the average is only a rough guide.';
}

interface GroupProps {
  name: string;
  seed: number;
  spread: number;
  onSpread: (v: number) => void;
}

/** Dots are a fixed unit sample rescaled to the requested spread, so the mean never moves. */
function Group({ name, seed, spread, onSpread }: GroupProps) {
  const unit = useMemo(() => standardize(normalSample(seed, N), 0, 1), [seed]);
  const maxAbs = Math.max(...unit.map(Math.abs));
  const maxSpread = Math.min(4.5, Math.floor((9.6 / maxAbs) * 10) / 10);
  const sd0 = Math.min(Math.max(spread, SPREAD_MIN), maxSpread);
  const values = useMemo(() => unit.map((z) => CENTER + z * sd0), [unit, sd0]);

  const m = mean(values);
  const sd = std(values);
  const rg = range(values);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const inside = values.filter((v) => Math.abs(v - m) <= sd + 1e-9).length;
  const insidePct = (inside / values.length) * 100;

  return (
    <section aria-label={name} className="mt-4 first:mt-0">
      <h4 className="m-0 mb-1 text-sm font-semibold">{name}</h4>
      <Slider
        label={`Spread of ${name}`}
        value={sd0}
        min={SPREAD_MIN}
        max={maxSpread}
        step={0.1}
        format={f1}
        onChange={onSpread}
      />
      <div className="mt-1">
        <DotPlot
          values={values}
          domain={[0, 20]}
          tickStep={5}
          height={176}
          radius={5}
          label={`${name}: ${values.length} dots with mean ${f1(m)} and standard deviation ${f1(sd)}`}
          mean={m}
          under={({ x, axisY, top }) => (
            <g>
              <rect
                x={x(m - sd)}
                y={top + 14}
                width={Math.max(0, x(m + sd) - x(m - sd))}
                height={axisY - top - 14}
                fill={MEAN_COLOR}
                fillOpacity="0.12"
                stroke={MEAN_COLOR}
                strokeDasharray="4 3"
              />
              <text
                x={x(m)}
                y={top + 11}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={MEAN_COLOR}
              >
                ± 1 SD
              </text>
            </g>
          )}
          over={({ x, top }) => (
            <g>
              <line
                x1={x(lo)}
                x2={x(hi)}
                y1={top - 6}
                y2={top - 6}
                stroke="var(--color-ink)"
                strokeWidth="1.5"
              />
              <line
                x1={x(lo)}
                x2={x(lo)}
                y1={top - 11}
                y2={top - 1}
                stroke="var(--color-ink)"
                strokeWidth="1.5"
              />
              <line
                x1={x(hi)}
                x2={x(hi)}
                y1={top - 11}
                y2={top - 1}
                stroke="var(--color-ink)"
                strokeWidth="1.5"
              />
              <text x={x(hi) + 6} y={top - 2} fontSize="10" fill="var(--color-muted)">
                range
              </text>
            </g>
          )}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Range" value={f1(rg)} hint="lowest to highest" />
        <Metric
          label="Standard deviation"
          value={f1(sd)}
          tone="accent"
          hint="typical distance from the average"
        />
        <Metric
          label="Within ± 1 SD"
          value={`${f0(insidePct)}%`}
          hint={`${inside} of ${values.length} dots`}
        />
      </div>
      <p className="m-0 mt-1 text-sm font-semibold">{reading(sd)}</p>
    </section>
  );
}

function Inner() {
  const [spreadA, setSpreadA] = useState(SPREAD_DEFAULT_A);
  const [spreadB, setSpreadB] = useState(SPREAD_DEFAULT_B);
  const [seed, setSeed] = useState(SEED_DEFAULT);

  const unitA = useMemo(() => standardize(normalSample(seed, N), 0, 1), [seed]);
  const unitB = useMemo(() => standardize(normalSample(seed + 100, N), 0, 1), [seed]);
  const sdOf = (unit: number[], spread: number) => {
    const maxAbs = Math.max(...unit.map(Math.abs));
    const max = Math.min(4.5, Math.floor((9.6 / maxAbs) * 10) / 10);
    return Math.min(Math.max(spread, SPREAD_MIN), max);
  };
  const a = sdOf(unitA, spreadA);
  const b = sdOf(unitB, spreadB);

  return (
    <>
      <p className="m-0 mb-3 text-sm">
        Both groups have the same mean:{' '}
        <strong className="font-mono">{f1(CENTER)}</strong>{' '}
        <span aria-hidden="true" style={{ color: MEAN_COLOR }}>
          ▲
        </span>
        . Only the spread differs.
      </p>
      <Group name="Group A" seed={seed} spread={spreadA} onSpread={setSpreadA} />
      <Group name="Group B" seed={seed + 100} spread={spreadB} onSpread={setSpreadB} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSpreadA(SPREAD_DEFAULT_A);
            setSpreadB(SPREAD_DEFAULT_B);
            setSeed(SEED_DEFAULT);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle</Button>
      </div>
      <p role="status" className="sr-only">
        Group A: mean {f1(CENTER)}, standard deviation {f1(a)}. Group B: mean {f1(CENTER)}
        , standard deviation {f1(b)}.
      </p>
    </>
  );
}

export function SpreadMatters() {
  return (
    <ClientOnly
      minHeight={940}
      label="Spread matters: two groups with the same mean and different spread"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
