import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { START, bowlStatus, maxSafeLr, runBowl, type BowlStatus } from './bowl';
import {
  BowlSvg,
  Chip,
  Label,
  LegendRow,
  MarkedSlider,
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

/** Part A uses one fixed narrow hill: knob 2 is 10 times as sensitive as knob 1. */
const KAPPA = 10;
const DEFAULT_LR = 0.05;
const LR_MIN = 0.005;
const LR_MAX = 0.5;

const TONE: Record<BowlStatus, 'good' | 'warn' | 'bad'> = {
  smooth: 'good',
  bouncing: 'warn',
  crawling: 'good',
  stuck: 'bad',
  diverging: 'bad',
  invalid: 'bad',
};

const PLAIN: Record<BowlStatus, string> = {
  smooth: 'Sliding down',
  crawling: 'Sliding down, slowly',
  bouncing: 'Bouncing, but still arriving',
  stuck: 'Bouncing forever',
  diverging: 'Too big: flying off the hill',
  invalid: 'Not a valid setting',
};

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Inner() {
  const [lr, setLr] = useState(DEFAULT_LR);
  const [anim, setAnim] = useState<{ key: string; s: number } | null>(null);

  const safe = maxSafeLr(KAPPA);
  const run = useMemo(() => runBowl(START, lr, KAPPA), [lr]);
  const status = bowlStatus(lr, KAPPA);
  const total = run.pathSteps[run.pathSteps.length - 1] ?? 0;

  // Play: draw the trail step by step. Any control change, or the end, shows it all again.
  const key = String(lr);
  const shown =
    anim && anim.key === key && anim.s < total ? anim.s : Number.POSITIVE_INFINITY;
  useEffect(() => {
    if (!Number.isFinite(shown)) return;
    const id = window.setTimeout(
      () =>
        setAnim({
          key,
          s:
            shown < 60 ? shown + 1 : shown + Math.max(1, Math.ceil((total - shown) / 18)),
        }),
      shown < 60 ? 80 : 40,
    );
    return () => window.clearTimeout(id);
  }, [shown, total, key]);
  const play = () => {
    if (reducedMotion()) return;
    setAnim({ key, s: 0 });
  };

  const steps = fmtSteps(run.steps, run.capped, run.diverged);
  const reading = (() => {
    switch (status) {
      case 'diverging':
        return `Learning rate ${fmtLr(lr)}: too big. Each step overshoots further than the last, and you fly off.`;
      case 'stuck':
        return `Learning rate ${fmtLr(lr)}: exactly the biggest safe step. You bounce across the hill and never settle.`;
      case 'bouncing':
        return `Learning rate ${fmtLr(lr)}: you bounce across the hill but still arrive, in ${steps} steps.`;
      default:
        return run.steps === null
          ? `Learning rate ${fmtLr(lr)}: you slide down, but not 99% of the way even after 100000 steps.`
          : `Learning rate ${fmtLr(lr)}: you slide down in ${steps} steps.`;
    }
  })();
  const summary = `Learning rate ${fmtLr(lr)}: ${PLAIN[status].toLowerCase()}${
    run.steps !== null ? `, ${run.steps} steps to 99% of the way down` : ''
  }.`;

  return (
    <>
      <TryThis>
        Raise the learning rate slowly. Watch the trail go from a smooth slide, to
        bouncing across the hill, to flying off.
      </TryThis>
      <BowlSvg
        kappa={KAPPA}
        label={`A narrow hill. A trail of gradient descent steps from the start toward the bottom, learning rate ${fmtLr(lr)}.`}
        overlay={
          run.diverged ? (
            <Label x={44} y={30} size={13} fill="var(--color-bad)">
              ✕ The trail leaves the map
            </Label>
          ) : null
        }
      >
        <Trail path={run.path} steps={run.pathSteps} shown={shown} />
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
        <MarkedSlider
          label="Learning rate (step size)"
          value={lr}
          min={LR_MIN}
          max={LR_MAX}
          onChange={(v) => setLr(Math.round(v * 100000) / 100000)}
          format={fmtLr}
          marks={[
            {
              value: safe,
              label: `Bigger than this and you bounce out: ${fmtLr(safe)}`,
              row: 'below',
            },
          ]}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Chip tone={TONE[status]}>{PLAIN[status]}</Chip>
        <Button onClick={play}>Play</Button>
        <Button
          onClick={() => {
            setLr(DEFAULT_LR);
            setAnim(null);
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
    </>
  );
}

export function DescentTrail() {
  return (
    <ClientOnly
      minHeight={560}
      minHeightWide={630}
      label="Take bigger steps: gradient descent on a narrow hill with a learning rate you control"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
