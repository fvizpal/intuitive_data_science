import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { bayesAccuracyFruit, makeFruit } from './data';
import {
  CLASS_LEGEND,
  BOX_LEGEND,
  Card,
  Chip,
  ClassPoints,
  FIT_CHIP,
  Legend,
  MapChart,
  MiniMap,
  Note,
  Patterns,
  Reading,
  Regions,
  Skeleton,
  StickyControls,
  YAxisName,
  fruitWorld,
  pct0,
  scaleOf,
} from './charts';
import { fitReadingTree, newDataAccuracy, type DepthCurves } from './eval';
import { useJob } from './jobs';
import { N_OPTIONS, pageActions, usePage } from './store';
import { UNLIMITED, growTree, lighten, regionsOf, trainingAccuracy } from './tree';

const WORLD = fruitWorld(false);
const SC = scaleOf(WORLD);
const BOUNDS = { x0: WORLD.x0, x1: WORLD.x1, y0: WORLD.y0, y1: WORLD.y1 };
const NO_LIMIT = 13;
const BEST = bayesAccuracyFruit();

const depthText = (d: number) => (d === NO_LIMIT ? 'No limit' : String(d));
const depthPhrase = (d: number) =>
  d === NO_LIMIT ? 'With no depth limit' : `Depth ${d}`;

// ---------- panel B chart ----------

const W = 600;
const H = 270;
const L = 52;
const R = 14;
const T = 18;
const B = 44;
const PW = W - L - R;
const PH = H - T - B;
const Y_LO = 0.6;
const Y_HI = 1;
const bx = (d: number) => L + ((d - 1) / (NO_LIMIT - 1)) * PW;
const by = (v: number) =>
  T + (1 - (Math.max(Y_LO, Math.min(Y_HI, v)) - Y_LO) / (Y_HI - Y_LO)) * PH;

function CurvesChart({ curves, depth }: { curves: DepthCurves; depth: number }) {
  const train = [...curves.meanTrain, curves.unlimited.train];
  const fresh = [...curves.meanNew, curves.unlimited.newData];
  const line = (v: number[]) =>
    v
      .map((y, i) => `${i ? 'L' : 'M'}${bx(i + 1).toFixed(1)} ${by(y).toFixed(1)}`)
      .join('');
  const bd = curves.bestDepth;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Average accuracy against depth over 60 samples. Training accuracy rises to ${pct0(curves.unlimited.train)}. New-data accuracy peaks at depth ${bd} with ${pct0(curves.meanNew[bd - 1]!)}.`}
    >
      <rect
        x={L}
        y={T}
        width={PW}
        height={PH}
        fill="var(--color-surface)"
        stroke="var(--color-grid)"
      />
      <rect
        x={bx(bd) - 9}
        y={T}
        width="18"
        height={PH}
        fill="color-mix(in srgb, var(--color-good) 14%, transparent)"
      />
      {[0.6, 0.7, 0.8, 0.9, 1].map((v) => (
        <g key={v}>
          <line x1={L} x2={L + PW} y1={by(v)} y2={by(v)} stroke="var(--color-grid)" />
          <text
            x={L - 6}
            y={by(v) + 5}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {pct0(v)}
          </text>
        </g>
      ))}
      {[1, 3, 6, 9, 12].map((d) => (
        <text
          key={d}
          x={bx(d)}
          y={T + PH + 20}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {d}
        </text>
      ))}
      <text
        x={bx(NO_LIMIT)}
        y={T + PH + 20}
        fontSize="13"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        no limit
      </text>
      <text
        x={L + PW / 2}
        y={H - 4}
        fontSize="14"
        textAnchor="middle"
        fill="var(--color-muted)"
      >
        Depth
      </text>
      <line
        x1={L}
        x2={L + PW}
        y1={by(BEST)}
        y2={by(BEST)}
        stroke="var(--color-good)"
        strokeWidth="2"
        strokeDasharray="2 4"
      />
      <text
        x={L + 6}
        y={by(BEST) - 6}
        fontSize="13"
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="3.5"
        paintOrder="stroke"
      >
        Best any rule can do: about {pct0(BEST)}
      </text>
      <path d={line(train)} fill="none" stroke="var(--color-neg)" strokeWidth="2.6" />
      <path
        d={line(fresh)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeDasharray="7 5"
      />
      {train.map((v, i) => (
        <circle key={`t${i}`} cx={bx(i + 1)} cy={by(v)} r="3.4" fill="var(--color-neg)" />
      ))}
      {fresh.map((v, i) => (
        <rect
          key={`n${i}`}
          x={bx(i + 1) - 3.4}
          y={by(v) - 3.4}
          width="6.8"
          height="6.8"
          fill="var(--color-surface)"
          stroke="var(--color-accent)"
          strokeWidth="1.8"
        />
      ))}
      <text
        x={bx(bd)}
        y={T + 12}
        fontSize="13"
        fontWeight="600"
        textAnchor={bd > 9 ? 'end' : 'start'}
        dx={bd > 9 ? -12 : 12}
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="3.5"
        paintOrder="stroke"
      >
        Sweet spot: depth {bd}
      </text>
      <path d={`M${bx(depth)} ${T + PH}l-6 10h12z`} fill="var(--color-ink)" />
      <line
        x1={bx(depth)}
        x2={bx(depth)}
        y1={T}
        y2={T + PH}
        stroke="var(--color-ink)"
        strokeWidth="1.4"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function Inner() {
  const { seed, n } = usePage();
  const [depth, setDepth] = useState(1);
  const [minLeaf, setMinLeaf] = useState(1);
  const [batch, setBatch] = useState(0);

  const data = useMemo(() => makeFruit(seed, n), [seed, n]);
  const tree = useMemo(
    () => growTree(data.X, data.y, { maxDepth: UNLIMITED, minLeaf }),
    [data, minLeaf],
  );
  const light = useMemo(() => lighten(tree), [tree]);
  const d = depth === NO_LIMIT ? UNLIMITED : depth;
  const trainAcc = trainingAccuracy(tree, data.X, data.y, d);
  const newAcc = newDataAccuracy(tree, seed, d);
  const regions = regionsOf(light, BOUNDS, d);
  const fit = fitReadingTree({ train: trainAcc, newData: newAcc, best: BEST });

  const curves = useJob('curves', { seed, n, minLeaf });
  const panelC = useJob('panelC', { seed, n, minLeaf, batch });

  const sweet = curves?.bestDepth ?? 3;
  const atSweet = {
    train: trainingAccuracy(tree, data.X, data.y, sweet),
    nw: newDataAccuracy(tree, seed, sweet),
  };
  const reading =
    depth === sweet
      ? `${depthPhrase(depth)}: training ${pct0(trainAcc)}, new fruit ${pct0(newAcc)}. This is the depth that does best on new fruit on average.`
      : `${depthPhrase(depth)}: training ${pct0(trainAcc)}, new fruit ${pct0(newAcc)}. Depth ${sweet}: training ${pct0(atSweet.train)}, new fruit ${pct0(atSweet.nw)}.${
          trainAcc > atSweet.train && newAcc < atSweet.nw
            ? ' The tree that fits the training fruit best is not the one that does best on new fruit.'
            : ''
        }`;
  const summary = `Depth ${depthText(depth)}, smallest box ${minLeaf}: training ${pct0(trainAcc)}, new fruit ${pct0(newAcc)}, ${fit}`;

  return (
    <>
      <StickyControls>
        <Slider
          label="Depth: how many questions in a row"
          value={depth}
          min={1}
          max={NO_LIMIT}
          step={1}
          onChange={(v) => setDepth(Math.round(v))}
          format={depthText}
        />
        <div className="mt-2">
          <Slider
            label="Smallest box allowed (minimum leaf size)"
            value={minLeaf}
            min={1}
            max={20}
            step={1}
            onChange={(v) => setMinLeaf(Math.round(v))}
            format={(v) => `${v} fruit`}
          />
        </div>
      </StickyControls>
      <section aria-label="One tree">
        <h3 className="m-0 mb-2 text-base font-semibold">One tree</h3>
        <p className="m-0 text-xs text-muted">
          Depth and smallest box size (sliders above) drive all three panels. A cut is
          blocked if it would leave a box with fewer fruit than the smallest box size.
        </p>
        <div className="mt-3">
          <YAxisName>{WORLD.yLabel}</YAxisName>
          <MapChart
            world={WORLD}
            label={`Tree boxes over ${n} training fruit. ${summary}`}
          >
            <Patterns prefix="dd" />
            <Regions regions={regions} scale={SC} prefix="dd" />
            <ClassPoints X={data.X} y={data.y} scale={SC} r={n > 100 ? 3 : 4} />
          </MapChart>
          <Legend items={[...CLASS_LEGEND, ...BOX_LEGEND]} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Card
            label="Right on the training fruit"
            value={pct0(trainAcc)}
            plain={`the ${n} fruit the tree learned from`}
          />
          <Card
            label="Right on 5000 new fruit"
            value={pct0(newAcc)}
            plain="fresh fruit it has never seen"
          />
          <Card
            label="Best any rule can do"
            value={`about ${pct0(BEST)}`}
            plain="the classes overlap, so no rule is perfect"
            tone="good"
          />
        </div>
        <Chip>{FIT_CHIP[fit]}</Chip>
        {trainAcc === 1 && (
          <Note icon="⚠">
            Every training fruit is in a box of its own kind. That is memorizing, not
            learning.
          </Note>
        )}
        <Reading>{reading}</Reading>
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>
      </section>

      <section aria-label="Try every depth" className="mt-6">
        <h3 className="m-0 mb-2 text-base font-semibold">Try every depth</h3>
        <p className="m-0 mb-2 text-sm text-muted">
          One tree could be a fluke, so each point averages 60 trees, each trained on a
          different sample of {n} fruit (smallest box {minLeaf}).
        </p>
        {curves ? (
          <>
            <CurvesChart curves={curves} depth={depth} />
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
              <li>● solid: training accuracy</li>
              <li>□ dashed: accuracy on new fruit</li>
              <li>┈ green: best any rule can do</li>
              <li>▮ green band: sweet spot</li>
              <li>▲ your depth</li>
            </ul>
          </>
        ) : (
          <Skeleton height={270} />
        )}
      </section>

      <section aria-label="Change the fruit, change the tree" className="mt-6">
        <h3 className="m-0 mb-2 text-base font-semibold">
          Change the fruit, change the tree
        </h3>
        <p className="m-0 mb-2 text-sm text-muted">
          Six training samples of the same size, grown with the same settings. If the
          trees had learned the real pattern, they would look alike.
        </p>
        {panelC ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {panelC.samples.map((s, i) => (
                <MiniMap
                  key={i}
                  regions={regionsOf(s.tree, BOUNDS, d)}
                  X={s.X}
                  y={s.y}
                  world={WORLD}
                  label={`Sample ${i + 1}: boxes of a depth ${depthText(depth)} tree`}
                />
              ))}
            </div>
            <div className="mt-3 grid">
              <Card
                label="Disagreement between two trees"
                value={pct0(panelC.disagree[depth - 1] ?? NaN)}
                plain={`Two trees from different samples disagree on ${pct0(panelC.disagree[depth - 1] ?? NaN)} of fruit (average of 30 pairs, on a fixed grid of weight and shade).`}
              />
            </div>
            <Reading>Same recipe, six different samples, six different trees.</Reading>
          </>
        ) : (
          <Skeleton height={260} />
        )}
        <div className="mt-3">
          <Button onClick={() => setBatch((b) => b + 1)}>Draw 6 new samples</Button>
        </div>
      </section>

      <div className="mt-4">
        <SegmentedControl
          label="Fruit in each sample"
          options={N_OPTIONS.map((v) => ({ value: String(v), label: String(v) }))}
          value={String(n)}
          onChange={(v) => pageActions.setN(Number(v))}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newFruit}>New fruit</Button>
        <Button
          onClick={() => {
            setDepth(1);
            setMinLeaf(1);
            setBatch(0);
            pageActions.reset();
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function DepthDial() {
  return (
    <ClientOnly
      minHeight={2050}
      minHeightWide={1750}
      label="When it memorizes: depth and smallest box size, one tree, every depth, six samples"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
