import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import {
  bowlGrad,
  bowlLoss,
  gradDirectional,
  stepBowl,
  tangentAt,
  type Pt,
} from './bowl';
import {
  Arrow,
  BowlSvg,
  Card,
  Label,
  LegendRow,
  Reading,
  Slider,
  RingHeights,
  StarMark,
  SwDashArrow,
  SwRing,
  SwSolidArrow,
  SwStar,
  TryThis,
  U,
  X_HI,
  X_LO,
  Y_HI,
  Y_LO,
  dx,
  dy,
  r1,
  sx,
  sy,
} from './charts';
import { fmtLoss, fmtLr, fmtXY } from './format';
import { SideView } from './SideView';
import { kappaFor, pageActions, usePage } from './store';

const START_POINT: Pt = [6, 2];
const DEFAULT_LR = 0.2;
const DEFAULT_KAPPA = 4;
const PILLS = [1, 4, 16] as const;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const inFrame = (p: Pt): Pt => [clampN(p[0], X_LO, X_HI), clampN(p[1], Y_LO, Y_HI)];

/** Compass words for a direction (data space, y up). */
function words(gx: number, gy: number): string {
  const ax = Math.abs(gx);
  const ay = Math.abs(gy);
  const h = gx >= 0 ? 'right' : 'left';
  const v = gy >= 0 ? 'up' : 'down';
  if (ay < 0.4 * ax) return `to the ${h}`;
  if (ax < 0.4 * ay) return v === 'up' ? 'straight up' : 'straight down';
  return `toward the ${v === 'up' ? 'upper' : 'lower'} ${h}`;
}

function Inner() {
  const page = usePage();
  const kappa = kappaFor(page, DEFAULT_KAPPA);
  const [p, setP] = useState<Pt>(START_POINT);
  const [lr, setLr] = useState(DEFAULT_LR);
  const [focused, setFocused] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const g = bowlGrad(p[0], p[1], kappa);
  const gn = Math.hypot(g[0], g[1]);
  const loss = bowlLoss(p[0], p[1], kappa);
  const tn = tangentAt(p[0], p[1], kappa);
  const along = Math.abs(gradDirectional(p[0], p[1], kappa, tn));
  const next = stepBowl(p, lr, kappa);
  const atBottom = gn < 1e-9;

  const px = sx(p[0]);
  const py = sy(p[1]);
  // The ring through the dot: loss = 0.5 r^2.
  const ringR = Math.sqrt(p[0] * p[0] + kappa * p[1] * p[1]);
  const upLen = Math.min(72, 7 * gn);
  const ux = atBottom ? 0 : g[0] / gn;
  const uy = atBottom ? 0 : -g[1] / gn; // pixels: y points down
  // Pixel unit vector along the ring, for the right-angle mark.
  const tx = tn[0];
  const ty = -tn[1];

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const scale = 600 / r.width;
    setP(inFrame([dx((e.clientX - r.left) * scale), dy((e.clientY - r.top) * scale)]));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) move(e);
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    const d = e.shiftKey ? 1 : 0.25;
    const delta: Record<string, Pt> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
    };
    const v = delta[e.key];
    if (!v) return;
    e.preventDefault();
    setP((q) => inFrame([q[0] + v[0], q[1] + v[1]]));
  };

  const takeSteps = (n: number) =>
    setP((q) => {
      let c: Pt = q;
      for (let i = 0; i < n; i++) c = inFrame(stepBowl(c, lr, kappa));
      return c;
    });

  const pillValue = String(
    PILLS.reduce(
      (best, k) => (Math.abs(k - kappa) < Math.abs(best - kappa) ? k : best),
      PILLS[0],
    ),
  );

  // Does the downhill direction point at the bottom? cos of the angle between -g and -p.
  const pn = Math.hypot(p[0], p[1]);
  const cosToBottom = atBottom || pn === 0 ? 1 : (g[0] * p[0] + g[1] * p[1]) / (gn * pn);
  const across = !atBottom && cosToBottom < 0.9;

  const reading = atBottom
    ? `At (0, 0): the slope is 0. You are at the bottom, so there is nowhere downhill to go.`
    : `At (${fmtXY(p[0])}, ${fmtXY(p[1])}): the ground rises fastest ${words(g[0], g[1])}, ${fmtLoss(gn)} per unit. The step of ${fmtLr(lr)} × slope lands at (${fmtXY(next[0])}, ${fmtXY(next[1])}), lower down${
        Math.abs(next[0]) > X_HI || Math.abs(next[1]) > Y_HI ? ' (off the map)' : ''
      }.${across ? ' The arrow points across the narrow part of the hill, not toward the bottom.' : ''}`;
  const summary = `Dot at ${fmtXY(p[0])}, ${fmtXY(p[1])}, knob 2 is ${kappa} times as sensitive as knob 1. Slope ${fmtLoss(gn)}. Next position ${fmtXY(next[0])}, ${fmtXY(next[1])}.`;

  return (
    <>
      <TryThis>
        Drag the dot around. Watch the arrow: where is it longest? Which way does it point
        relative to the rings?
      </TryThis>
      <BowlSvg
        kappa={kappa}
        label={`Hiking map of a bowl-shaped hill over two knobs, where knob 2 is ${kappa} times as sensitive as knob 1. Rings join points of equal height, deeper shade is higher. A draggable dot shows the uphill arrow and the downhill step.`}
        shade
        xLabel="knob 1 →"
        yLabel="knob 2 ↑"
        svgRef={svgRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        overlay={
          <g>
            <text
              x={600 - 14}
              y={26}
              fontSize="12"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              Same ring, same height. Deeper shade, higher ground.
            </text>
          </g>
        }
      >
        <ellipse
          cx={sx(0)}
          cy={sy(0)}
          rx={r1(ringR * U)}
          ry={r1((ringR / Math.sqrt(kappa)) * U)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.4"
          strokeDasharray="3 4"
        />
        <RingHeights />
        <StarMark x={sx(0)} y={sy(0)} />
        {!atBottom && (
          <>
            <Arrow
              x1={px}
              y1={py}
              x2={px + ux * upLen}
              y2={py + uy * upLen}
              stroke="var(--color-ink)"
            />
            <Label
              x={px + ux * (upLen + 8) + (ux < 0 ? -2 : 2)}
              y={py + uy * (upLen + 8) + 4}
              anchor={ux < 0 ? 'end' : 'start'}
              size={13}
            >
              Uphill
            </Label>
            <Arrow
              x1={px}
              y1={py}
              x2={sx(next[0])}
              y2={sy(next[1])}
              dashed
              stroke="var(--color-accent)"
            />
            <Label
              x={(px + sx(next[0])) / 2 + tx * 16 * (tx >= 0 ? 1 : 1)}
              y={(py + sy(next[1])) / 2 + ty * 16 + 4}
              anchor={tx >= 0 ? 'start' : 'end'}
              size={13}
              fill="var(--color-accent)"
            >
              Your step
            </Label>
            <polyline
              points={`${r1(px + ux * 9)},${r1(py + uy * 9)} ${r1(px + ux * 9 + tx * 9)},${r1(py + uy * 9 + ty * 9)} ${r1(px + tx * 9)},${r1(py + ty * 9)}`}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="1.4"
            />
            <circle
              cx={r1(sx(next[0]))}
              cy={r1(sy(next[1]))}
              r="6"
              fill="var(--color-surface)"
              stroke="var(--color-accent)"
              strokeWidth="2.2"
            />
            <Label
              x={sx(next[0]) + 9}
              y={sy(next[1]) + 16}
              size={13}
              fill="var(--color-accent)"
            >
              Next
            </Label>
          </>
        )}
        <g
          tabIndex={0}
          role="slider"
          aria-label="Draggable point. Arrow keys move it by 0.25, with Shift by 1."
          aria-valuetext={`x ${fmtXY(p[0])}, y ${fmtXY(p[1])}`}
          aria-valuenow={Math.round(p[0] * 100) / 100}
          aria-valuemin={X_LO}
          aria-valuemax={X_HI}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ outline: 'none', cursor: 'grab' }}
        >
          <circle cx={r1(px)} cy={r1(py)} r="26" fill="transparent" />
          {focused && (
            <circle
              cx={r1(px)}
              cy={r1(py)}
              r="15"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          )}
          <circle
            cx={r1(px)}
            cy={r1(py)}
            r="8"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
        </g>
      </BowlSvg>
      <LegendRow
        items={[
          [<circle key="d" cx="9" cy="8" r="5" fill="var(--color-ink)" />, 'Your dot'],
          [SwSolidArrow, 'Uphill (the gradient)'],
          [SwDashArrow, 'Your step (downhill)'],
          [
            <circle
              key="n"
              cx="9"
              cy="8"
              r="5"
              fill="var(--color-surface)"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />,
            'Next',
          ],
          [SwStar, 'Bottom'],
          [SwRing, 'Ring: same height'],
          [
            <rect
              key="sh"
              x="2"
              y="3"
              width="14"
              height="10"
              fill="color-mix(in srgb, var(--color-accent) 27%, var(--color-bg))"
              stroke="var(--color-grid)"
            />,
            'Deeper shade: higher',
          ],
        ]}
      />

      <SideView x={p[0]} y={p[1]} kappa={kappa} />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card
          label="Slope here (the gradient’s length)"
          value={fmtLoss(gn)}
          plain={`loss climbs ${fmtLoss(gn)} per unit in the uphill direction`}
        />
        <Card
          label="Slope along the ring"
          value={along < 5e-6 ? '0' : fmtLoss(along)}
          plain="the ring is level"
        />
        <Card label="Loss here" value={fmtLoss(loss)} plain="how high the ground is" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Slider
          label="Learning rate (size of each step)"
          value={lr}
          min={0.02}
          max={0.5}
          log
          onChange={setLr}
          format={fmtLr}
        />
        <SegmentedControl
          label="How sensitive is knob 2, compared with knob 1?"
          options={PILLS.map((k) => ({
            value: String(k),
            label: k === 1 ? 'Equal' : `${k}× as much`,
          }))}
          value={pillValue}
          onChange={(v) => pageActions.setKappa(Number(v))}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => takeSteps(1)}>
          Take the step
        </Button>
        <Button onClick={() => takeSteps(5)}>Take 5 steps</Button>
        <Button
          onClick={() => {
            setP(START_POINT);
            setLr(DEFAULT_LR);
            pageActions.resetBowl();
          }}
        >
          Reset
        </Button>
      </div>

      <p className="m-0 mt-2 text-xs text-muted">
        {kappa === 1
          ? 'Both knobs matter equally: the same nudge changes the loss by the same amount.'
          : `Nudge knob 2 and the loss reacts ${kappa} times as strongly as it does for knob 1. That is why the rings are squeezed.`}
      </p>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
    </>
  );
}

export function GradientArrows() {
  return (
    <ClientOnly
      minHeight={1430}
      minHeightWide={1060}
      label="Gradient arrows: drag a dot on a contour map and see the uphill arrow and the downhill step"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
