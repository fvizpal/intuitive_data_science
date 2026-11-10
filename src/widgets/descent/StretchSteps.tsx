import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { START, bestLr, maxSafeLr, runBowl, stepsAtBestLr } from './bowl';
import {
  BowlSvg,
  Card,
  GapChart,
  LegendRow,
  Reading,
  StarMark,
  StartMark,
  SwCircleTrail,
  SwStar,
  SwStart,
  Trail,
  TryThis,
  sx,
  sy,
} from './charts';
import { fmtLr, fmtSteps } from './format';

const OPTIONS = [
  { value: '1', label: 'Round (stretch 1)' },
  { value: '10', label: 'Long (stretch 10)' },
  { value: '100', label: 'Very long (stretch 100)' },
] as const;
type Pick = (typeof OPTIONS)[number]['value'];
const DEFAULT: Pick = '10';

function Inner() {
  const [pick, setPick] = useState<Pick>(DEFAULT);
  const kappa = Number(pick);
  const lr = bestLr(kappa);
  const safe = maxSafeLr(kappa);
  const run = useMemo(() => runBowl(START, lr, kappa), [lr, kappa]);
  const steps = fmtSteps(run.steps, run.capped, run.diverged);
  const s10 = stepsAtBestLr(10);
  const s100 = stepsAtBestLr(100);
  const xMax =
    run.steps !== null
      ? Math.min(300, Math.max(20, Math.ceil((run.steps * 1.6) / 10) * 10))
      : 300;

  const reading =
    kappa === 1
      ? `Stretch 1, learning rate ${fmtLr(lr)}: ${steps} step. On a round hill the steepest way down points at the bottom, so one well-sized step lands there.`
      : kappa === 10
        ? `Stretch 10, learning rate ${fmtLr(lr)}: ${steps} steps. Try stretch 100 next.`
        : `Stretch 100, learning rate ${fmtLr(lr)}: ${steps} steps. At stretch 10 it was ${s10}. Ten times the stretch, about ${Math.round(s100 / s10)} times the steps.`;

  return (
    <>
      <TryThis>
        Pick <strong>Long (stretch 10)</strong>, then{' '}
        <strong>Very long (stretch 100)</strong>. Compare the steps.
      </TryThis>
      <BowlSvg
        kappa={kappa}
        label={`A hill with stretch ${kappa}. Gradient descent with the best learning rate takes ${steps} steps.`}
      >
        <Trail path={run.path} steps={run.pathSteps} shown={Number.POSITIVE_INFINITY} />
        <StarMark x={sx(0)} y={sy(0)} />
        <StartMark x={sx(START[0])} y={sy(START[1])} />
      </BowlSvg>
      <LegendRow
        items={[
          [SwStart, 'Start'],
          [SwStar, 'Bottom'],
          [SwCircleTrail, 'Trail (a dot every step)'],
        ]}
      />

      <div className="mt-3">
        <SegmentedControl
          label="How long and narrow is the hill?"
          options={OPTIONS}
          value={pick}
          onChange={setPick}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card
          label="Steps until 99% of the way down"
          value={steps}
          plain="The loss has dropped 99% of the way to its lowest."
        />
        <Card
          label="Biggest safe learning rate"
          value={fmtLr(safe)}
          plain="Bigger than this and you bounce out."
        />
        <Card
          label="Learning rate used"
          value={fmtLr(lr)}
          plain="Just under the safe one: both knobs settle at the same pace."
        />
      </div>

      <details className="mt-3 rounded-md border border-grid bg-bg p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Show the numbers
        </summary>
        <p className="m-0 mt-2 text-xs text-muted">
          How much loss is still to go after each step, on a log scale. The trail is done
          when it crosses the green line. Best learning rate at stretch 10: {s10} steps.
          At stretch 100: {s100} steps.
        </p>
        <GapChart
          series={[
            {
              gaps: run.gaps,
              label: 'Loss still to go',
              dashed: false,
              shape: 'circle',
              crossing: run.steps,
            },
          ]}
          minExp={4}
          xMax={xMax}
          label={`Loss still to go against step on a log axis. ${
            run.steps !== null
              ? `It crosses the 99% line at step ${run.steps}.`
              : 'It does not cross the 99% line.'
          }`}
        />
      </details>

      <div className="mt-3">
        <Button onClick={() => setPick(DEFAULT)}>Reset</Button>
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {`Stretch ${kappa}, learning rate ${fmtLr(lr)}: ${steps} steps to 99% of the way down.`}
      </p>
    </>
  );
}

export function StretchSteps() {
  return (
    <ClientOnly
      minHeight={840}
      minHeightWide={760}
      label="Make the hill longer: how many steps the best learning rate needs as the hill gets narrower"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
