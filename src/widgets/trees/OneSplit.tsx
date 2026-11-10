import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import {
  CH,
  CLASS_LEGEND,
  Card,
  ClassPoints,
  Legend,
  MapChart,
  Reading,
  StickyControls,
  StackBar,
  YAxisName,
  f2,
  fruitWorld,
  mixWord,
  pct0,
  plural,
  scaleOf,
} from './charts';
import { makeFruit } from './data';
import { gini, weightedImpurity } from './impurity';
import { N_OPTIONS, pageActions, usePage } from './store';
import { countsOf, splitCurve } from './tree';
import { clamp, nearestIdx, pureNote, range, sideCounts } from './view';

const WORLD = fruitWorld(false);
const SC = scaleOf(WORLD);
const FEATURES = [
  { value: '0', label: 'Weight' },
  { value: '1', label: 'Skin shade' },
] as const;

function Inner() {
  const { seed, n } = usePage();
  const data = useMemo(() => makeFruit(seed, n), [seed, n]);
  const all = useMemo(() => range(n), [n]);
  const [feature, setFeature] = useState<0 | 1>(0);
  const [pick, setPick] = useState<{ key: string; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const curve = useMemo(
    () => splitCurve(data.X, data.y, all, { features: [feature] })[feature] ?? [],
    [data, all, feature],
  );
  const K = curve.length;
  const key = `${seed}:${n}:${feature}`;
  const midValue = feature === 0 ? 180 : 5;
  const start = nearestIdx(curve, midValue);
  const idx = K === 0 ? 0 : clamp(pick?.key === key ? pick.i : start, 0, K - 1);
  const setIdx = (i: number) =>
    K > 0 && setPick({ key, i: clamp(Math.round(i), 0, K - 1) });

  const cand = curve[idx];
  const thr = cand?.threshold ?? 0;
  const valueText = (t: number) => WORLD.value[feature](t);

  const parent = countsOf(data.y, all);
  const { left, right } = cand
    ? sideCounts(data.X, data.y, all, feature, thr)
    : { left: parent, right: [0, 0] as [number, number] };
  const before = gini(parent);
  const after = weightedImpurity(left, right);
  const gain = Math.max(0, before - after);
  const rightCount = Math.max(...left) + Math.max(...right);
  const gA = gini(left);
  const gB = gini(right);

  const labelA =
    feature === 0
      ? `Box A: weight below ${valueText(thr)}`
      : `Box A: skin shade below ${valueText(thr)}`;
  const labelB = `Box B: ${valueText(thr)} or more`;

  const best = () => {
    let bi = 0;
    for (let i = 1; i < K; i++) if (curve[i]!.gain > curve[bi]!.gain + 1e-12) bi = i;
    setIdx(bi);
  };

  const noteA = pureNote(left);
  const noteB = pureNote(right);
  const reading = cand
    ? `Cut at ${valueText(thr)}: Box A has ${plural(left[0], 'apple')} and ${plural(left[1], 'orange')} (mix ${f2(gA)}), Box B has ${plural(right[0], 'apple')} and ${plural(right[1], 'orange')} (mix ${f2(gB)}). ${
        gain < 0.005
          ? `Overall mix barely changes (${f2(before)} to ${f2(after)}).`
          : `Overall mix falls from ${f2(before)} to ${f2(after)}. Gain ${f2(gain)}.`
      }${noteA ? ` Box A is ${noteA}.` : ''}${noteB ? ` Box B is ${noteB}.` : ''}`
    : 'No cut is possible: every fruit has the same value for this feature.';

  // drag and keyboard on the handle
  const fromPointer = (e: PointerEvent) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const v =
      feature === 0
        ? SC.vx(((e.clientX - r.left) / r.width) * CH.W)
        : SC.vy(((e.clientY - r.top) / r.height) * CH.H);
    setIdx(nearestIdx(curve, v));
  };
  const onKey = (e: KeyboardEvent) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    if (step) {
      e.preventDefault();
      setIdx(idx + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setIdx(K - 1);
    }
  };

  const cutX = SC.px(thr);
  const cutY = SC.py(thr);
  const summary = cand
    ? `Cut at ${valueText(thr)}. Box A ${left[0]} apples ${left[1]} oranges. Box B ${right[0]} apples ${right[1]} oranges. Mix falls from ${f2(before)} to ${f2(after)}. Gain ${f2(gain)}.`
    : 'No cut is possible.';
  const tint = 'color-mix(in srgb, var(--color-accent) 11%, transparent)';
  const tintB = 'color-mix(in srgb, var(--color-muted) 14%, transparent)';

  return (
    <>
      <StickyControls>
        <SegmentedControl
          label="Question about"
          options={FEATURES}
          value={String(feature)}
          onChange={(v) => setFeature(v === '1' ? 1 : 0)}
        />
        <div className="mt-2">
          <Slider
            label={feature === 0 ? 'Cut: weight below' : 'Cut: skin shade below'}
            value={idx}
            min={0}
            max={Math.max(0, K - 1)}
            step={1}
            onChange={setIdx}
            format={(i) => (curve[i] ? valueText(curve[i]!.threshold) : '—')}
          />
        </div>
      </StickyControls>
      <div>
        <p className="m-0 text-xs text-muted">
          A <strong>split</strong> is one question about one feature. Fruit that answer
          yes go to Box A, the rest to Box B. You can also drag the handle on the chart.
        </p>
      </div>

      <div className="mt-3">
        <YAxisName>{WORLD.yLabel}</YAxisName>
        <MapChart
          world={WORLD}
          svgRef={svgRef}
          label={`Fruit by weight and skin shade with one cut. ${summary}`}
          overlay={
            cand && (
              <g>
                <g
                  role="slider"
                  tabIndex={0}
                  aria-label="Cut position"
                  aria-valuemin={0}
                  aria-valuemax={Math.max(0, K - 1)}
                  aria-valuenow={idx}
                  aria-valuetext={valueText(thr)}
                  onKeyDown={onKey}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    fromPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
                  }}
                  style={{ touchAction: 'none', cursor: 'grab', outline: 'none' }}
                >
                  {feature === 0 ? (
                    <>
                      <circle cx={cutX} cy={CH.T + 262} r="15" fill="transparent" />
                      <circle
                        cx={cutX}
                        cy={CH.T + 262}
                        r="9"
                        fill="var(--color-ink)"
                        stroke="var(--color-surface)"
                        strokeWidth="2"
                      />
                      <path
                        d={`M${cutX - 3.5} ${CH.T + 262}l-3 -3v6zM${cutX + 3.5} ${CH.T + 262}l3 -3v6z`}
                        fill="var(--color-surface)"
                      />
                    </>
                  ) : (
                    <>
                      <circle cx={CH.L + 24} cy={cutY} r="15" fill="transparent" />
                      <circle
                        cx={CH.L + 24}
                        cy={cutY}
                        r="9"
                        fill="var(--color-ink)"
                        stroke="var(--color-surface)"
                        strokeWidth="2"
                      />
                      <path
                        d={`M${CH.L + 24} ${cutY - 3.5}l-3 -3h6zM${CH.L + 24} ${cutY + 3.5}l-3 3h6z`}
                        fill="var(--color-surface)"
                      />
                    </>
                  )}
                </g>
              </g>
            )
          }
        >
          {cand &&
            (feature === 0 ? (
              <>
                <rect
                  x={CH.L}
                  y={CH.T}
                  width={Math.max(0, cutX - CH.L)}
                  height={CH.H - CH.T - CH.B}
                  fill={tint}
                />
                <rect
                  x={cutX}
                  y={CH.T}
                  width={Math.max(0, CH.W - CH.R - cutX)}
                  height={CH.H - CH.T - CH.B}
                  fill={tintB}
                />
                <line
                  x1={cutX}
                  x2={cutX}
                  y1={CH.T}
                  y2={CH.H - CH.B}
                  stroke="var(--color-ink)"
                  strokeWidth="2.5"
                />
                <BoxText x={CH.L + 6} y={CH.T + 16} text={labelA} />
                <BoxText x={CH.W - CH.R - 6} y={CH.T + 16} text={labelB} end />
              </>
            ) : (
              <>
                <rect
                  x={CH.L}
                  y={cutY}
                  width={CH.W - CH.L - CH.R}
                  height={Math.max(0, CH.H - CH.B - cutY)}
                  fill={tint}
                />
                <rect
                  x={CH.L}
                  y={CH.T}
                  width={CH.W - CH.L - CH.R}
                  height={Math.max(0, cutY - CH.T)}
                  fill={tintB}
                />
                <line
                  x1={CH.L}
                  x2={CH.W - CH.R}
                  y1={cutY}
                  y2={cutY}
                  stroke="var(--color-ink)"
                  strokeWidth="2.5"
                />
                <BoxText x={CH.L + 6} y={CH.H - CH.B - 8} text={labelA} />
                <BoxText x={CH.L + 6} y={CH.T + 16} text={labelB} />
              </>
            ))}
          <ClassPoints X={data.X} y={data.y} scale={SC} r={n > 100 ? 3.2 : 4.2} />
        </MapChart>
        <Legend items={[...CLASS_LEGEND]} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          { name: 'Box A', c: left, text: labelA },
          { name: 'Box B', c: right, text: labelB },
        ].map((b) => (
          <div
            key={b.name}
            className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2"
          >
            <div className="mb-1 text-xs text-muted">
              {b.name}: {plural(b.c[0], 'apple')}, {plural(b.c[1], 'orange')}
            </div>
            <StackBar
              apples={b.c[0]}
              oranges={b.c[1]}
              label={`${b.name}: ${b.c[0]} apples, ${b.c[1]} oranges`}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Mix before · Gini impurity"
          value={f2(before)}
          plain={`${mixWord(before)} (0 = all one kind, 0.5 = even mix)`}
        />
        <Card
          label="Mix after"
          value={f2(after)}
          plain="average of the two boxes, weighted by size"
        />
        <Card label="Gain" value={f2(gain)} plain="how much the mix fell" tone="good" />
        <Card
          label="Right if each box guesses its majority"
          value={`${rightCount} of ${n}`}
          plain={pct0(n ? rightCount / n : NaN)}
        />
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3">
        <SegmentedControl
          label="Fruit in the sample"
          options={N_OPTIONS.map((v) => ({ value: String(v), label: String(v) }))}
          value={String(n)}
          onChange={(v) => pageActions.setN(Number(v))}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={best} disabled={K === 0}>
          Best cut for this feature
        </Button>
        <Button onClick={pageActions.newFruit}>New fruit</Button>
        <Button
          onClick={() => {
            setFeature(0);
            setPick(null);
            pageActions.reset();
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

function BoxText({
  x,
  y,
  text,
  end = false,
}: {
  x: number;
  y: number;
  text: string;
  end?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize="13"
      fontWeight="600"
      textAnchor={end ? 'end' : 'start'}
      fill="var(--color-ink)"
      stroke="var(--color-surface)"
      strokeWidth="3.5"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

export function OneSplit() {
  return (
    <ClientOnly
      minHeight={1240}
      minHeightWide={1000}
      label="One split: slide a cut across the fruit and watch the mix"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
