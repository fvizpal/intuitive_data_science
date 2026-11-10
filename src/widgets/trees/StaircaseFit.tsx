import { useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { fitPoly } from '../biasvar/fit';
import {
  Card,
  Legend,
  Reading,
  StickyControls,
  YAxisName,
  f1,
  type SwatchKind,
} from './charts';
import { DELIVERY_NOISE, NEW_KM, TRAIN_KM, deliveryTruth, makeDelivery } from './data';
import {
  expectedErrorRegression,
  growRegTree,
  predictReg,
  regLeafCount,
  staircase,
} from './regression';

const W = 600;
const H = 320;
const L = 50;
const R = 12;
const T = 14;
const B = 46;
const PW = W - L - R;
const PH = H - T - B;
const X_MAX = 16;
const Y_MAX = 60;
const px = (km: number) => L + (km / X_MAX) * PW;
const py = (min: number) => T + (1 - Math.max(0, Math.min(Y_MAX, min)) / Y_MAX) * PH;
const SEED_STEP = 1000;
const NS = [30, 60, 120];

function Inner() {
  const [depth, setDepth] = useState(1);
  const [n, setN] = useState(60);
  const [showLine, setShowLine] = useState(false);
  const [seed, setSeed] = useState(1);
  const band = `sf${useId().replace(/:/g, '')}`;

  const data = useMemo(() => makeDelivery(seed, n), [seed, n]);
  const tree = useMemo(() => growRegTree(data.x, data.y, { maxDepth: 8 }), [data]);
  const line = useMemo(() => fitPoly(data.x, data.y, 1), [data]);

  const p = (x: number) => predictReg(tree, x, depth);
  const inside = expectedErrorRegression(p, deliveryTruth, DELIVERY_NOISE, {
    lo: TRAIN_KM[0],
    hi: TRAIN_KM[1],
  });
  const beyond = expectedErrorRegression(p, deliveryTruth, DELIVERY_NOISE, {
    lo: NEW_KM[0],
    hi: NEW_KM[1],
  });
  const lineIn = expectedErrorRegression(line.predict, deliveryTruth, DELIVERY_NOISE, {
    lo: TRAIN_KM[0],
    hi: TRAIN_KM[1],
  });
  const lineOut = expectedErrorRegression(line.predict, deliveryTruth, DELIVERY_NOISE, {
    lo: NEW_KM[0],
    hi: NEW_KM[1],
  });
  const steps = staircase(tree, 1, X_MAX, depth);
  const used = regLeafCount(tree, depth);
  const plateau = p(X_MAX);
  const path = steps
    .map(
      (s, i) =>
        `${i === 0 ? `M${px(s.x0)} ${py(s.value)}` : `V${py(s.value)}`}H${px(s.x1)}`,
    )
    .join('');

  const reading = `Depth ${depth}: ${2 ** depth} steps allowed, ${used} used. Inside the range the tree is off by about ${f1(inside)} minutes. Beyond 10 km it stays at ${Math.round(plateau)} minutes while the truth keeps rising to ${Math.round(deliveryTruth(X_MAX))}: off by about ${f1(beyond)}.${
    showLine
      ? ` The straight line is off by about ${f1(lineIn)} inside and ${f1(lineOut)} beyond.`
      : ''
  }`;
  const legend: [SwatchKind, string][] = [
    ['dot', 'training orders'],
    ['fit', 'the tree (a staircase)'],
    ['truth', 'truth'],
  ];
  if (showLine) legend.push(['line', 'straight line']);
  const summary = `Depth ${depth}: error inside 1 to 10 km ${f1(inside)} minutes, beyond 10 km ${f1(beyond)} minutes`;

  return (
    <>
      <StickyControls>
        <Slider
          label="Depth: how many questions in a row"
          value={depth}
          min={1}
          max={8}
          step={1}
          onChange={(v) => setDepth(Math.round(v))}
          format={String}
        />
      </StickyControls>
      <p className="m-0 text-xs text-muted">
        Each box predicts the average delivery time of its orders. Depth {depth} allows up
        to {2 ** depth} boxes.
      </p>

      <div className="mt-3">
        <YAxisName>Delivery time (minutes)</YAxisName>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`Delivery time against distance with a tree staircase. ${summary}.`}
        >
          <defs>
            <pattern id={band} width="8" height="8" patternUnits="userSpaceOnUse">
              <rect
                width="8"
                height="8"
                fill="color-mix(in srgb, var(--color-muted) 12%, transparent)"
              />
              <circle cx="4" cy="4" r="1" fill="var(--color-muted)" opacity="0.6" />
            </pattern>
          </defs>
          <rect
            x={L}
            y={T}
            width={PW}
            height={PH}
            fill="var(--color-surface)"
            stroke="var(--color-grid)"
          />
          <rect
            x={px(10)}
            y={T}
            width={px(X_MAX) - px(10)}
            height={PH}
            fill={`url(#${band})`}
          />
          {[0, 10, 20, 30, 40, 50, 60].map((v) => (
            <g key={v}>
              <line x1={L} x2={L + PW} y1={py(v)} y2={py(v)} stroke="var(--color-grid)" />
              <text
                x={L - 6}
                y={py(v) + 5}
                fontSize="14"
                textAnchor="end"
                fill="var(--color-muted)"
              >
                {v}
              </text>
            </g>
          ))}
          {[0, 4, 8, 12, 16].map((v) => (
            <text
              key={v}
              x={px(v)}
              y={T + PH + 20}
              fontSize="14"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {v}
            </text>
          ))}
          <text
            x={L + PW}
            y={H - 4}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            Distance (km)
          </text>
          <text
            x={px(10) + 6}
            y={T + 16}
            fontSize="13"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="3.5"
            paintOrder="stroke"
          >
            Beyond what the tree has seen
          </text>
          <line
            x1={px(0)}
            y1={py(deliveryTruth(0))}
            x2={px(X_MAX)}
            y2={py(deliveryTruth(X_MAX))}
            stroke="var(--color-muted)"
            strokeWidth="2.5"
            strokeDasharray="7 5"
          />
          <text
            x={px(0.4)}
            y={py(deliveryTruth(0.4)) - 8}
            fontSize="13"
            fill="var(--color-muted)"
            stroke="var(--color-surface)"
            strokeWidth="3.5"
            paintOrder="stroke"
          >
            Truth
          </text>
          {data.x.map((x, i) => (
            <circle
              key={i}
              cx={px(x)}
              cy={py(data.y[i]!)}
              r={n > 60 ? 2.6 : 3.6}
              fill="var(--color-ink)"
              fillOpacity="0.8"
              stroke="var(--color-surface)"
              strokeWidth="0.8"
            />
          ))}
          {showLine && (
            <g>
              <line
                x1={px(1)}
                y1={py(line.predict(1))}
                x2={px(X_MAX)}
                y2={py(line.predict(X_MAX))}
                stroke="var(--color-pos)"
                strokeWidth="2"
              />
              <text
                x={px(X_MAX) - 4}
                y={py(line.predict(X_MAX)) + 18}
                fontSize="13"
                textAnchor="end"
                fill="var(--color-pos)"
                stroke="var(--color-surface)"
                strokeWidth="3.5"
                paintOrder="stroke"
              >
                Straight line
              </text>
            </g>
          )}
          <path
            d={path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <text
            x={px(X_MAX) - 4}
            y={py(plateau) - 8}
            fontSize="13"
            textAnchor="end"
            fill="var(--color-accent)"
            stroke="var(--color-surface)"
            strokeWidth="3.5"
            paintOrder="stroke"
          >
            Tree
          </text>
        </svg>
        <Legend items={legend} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card
          label="Error inside 1 to 10 km"
          value={`${f1(inside)} min`}
          plain="typical miss on new orders in the range"
        />
        <Card
          label="Error beyond 10 km"
          value={`${f1(beyond)} min`}
          plain="typical miss on longer trips"
        />
        <Card
          label="Noise floor"
          value={`${f1(DELIVERY_NOISE)} min`}
          plain="no model can beat it"
        />
      </div>
      {showLine && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card label="Straight line, inside 1 to 10 km" value={`${f1(lineIn)} min`} />
          <Card label="Straight line, beyond 10 km" value={`${f1(lineOut)} min`} />
        </div>
      )}
      <p className="m-0 mt-2 text-xs text-muted">
        These errors are exact, not measured on a test sample. Only a simulation, where we
        know the true line, can say how far off a model is on every possible order.
      </p>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3">
        <SegmentedControl
          label="Training orders"
          options={NS.map((v) => ({ value: String(v), label: String(v) }))}
          value={String(n)}
          onChange={(v) => setN(Number(v))}
        />
      </div>
      <div className="mt-2">
        <Toggle
          label="Show a straight-line fit"
          checked={showLine}
          onChange={setShowLine}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => setSeed((s) => s + SEED_STEP)}>New orders</Button>
        <Button
          onClick={() => {
            setDepth(1);
            setN(60);
            setShowLine(false);
            setSeed(1);
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function StaircaseFit() {
  return (
    <ClientOnly
      minHeight={980}
      minHeightWide={860}
      label="Trees for numbers: a staircase fit of delivery times"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
