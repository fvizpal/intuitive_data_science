import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  BOX_LEGEND,
  CLASS_LEGEND,
  CHECKER_WORLD,
  Card,
  ClassPoints,
  Cuts,
  Legend,
  MapChart,
  Note,
  Patterns,
  Reading,
  StickyControls,
  Regions,
  YAxisName,
  f2,
  fillFor,
  fruitWorld,
  pct0,
  plural,
  questionText,
  scaleOf,
  type World,
} from './charts';
import { makeCheckerboard, makeFruit } from './data';
import { gini } from './impurity';
import { pageActions, usePage } from './store';
import {
  UNLIMITED,
  cutsOf,
  growTree,
  leafCount,
  lighten,
  mostMixedLeaf,
  nextBestLeaf,
  proposalFor,
  regionsOf,
  splitCurve,
  splitNode,
  trainingAccuracy,
  treeDepth,
  undoLast,
  type Tree,
} from './tree';
import { clamp, nearestIdx, sideCounts } from './view';

type Dataset = 'fruit' | 'checker';
type Grown = number | 'pure' | null;

interface Local {
  key: string;
  tree: Tree;
  sel: number | null;
  grown: Grown;
  msg: string | null;
}

const MAX_DRAWN = 15;
const COLW = 150;
const ROWH = 48;
const NW = 118;

function PillRow<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1">
      <span id={id} className="text-sm">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors ${
              value === o.value
                ? 'border-accent bg-accent text-bg'
                : 'border-grid bg-surface text-ink hover:border-accent'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Diagram({
  tree,
  world,
  selected,
  onSelect,
}: {
  tree: Tree;
  world: World;
  selected: number;
  onSelect: (id: number) => void;
}) {
  const prefix = `dg${useId().replace(/:/g, '')}`;
  const pos = new Map<number, { x: number; y: number }>();
  let leafIdx = 0;
  const walk = (id: number): number => {
    const n = tree.nodes[id]!;
    if (!n.split) {
      const y = leafIdx++ * ROWH + ROWH / 2 + 4;
      pos.set(id, { x: n.depth * COLW, y });
      return y;
    }
    const a = walk(n.left);
    const b = walk(n.right);
    const y = (a + b) / 2;
    pos.set(id, { x: n.depth * COLW, y });
    return y;
  };
  walk(0);
  const depth = treeDepth(tree);
  const vbW = depth * COLW + NW + 4;
  const vbH = leafIdx * ROWH + 8;
  const press = (id: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };
  return (
    <div className="overflow-x-auto rounded-md border border-grid bg-surface">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ minWidth: Math.min(vbW * 0.78, 760), aspectRatio: `${vbW} / ${vbH}` }}
        className="block h-auto w-full"
        role="group"
        aria-label="The tree: questions and boxes"
      >
        <Patterns prefix={prefix} />
        {tree.nodes.map((n) => {
          if (!n.split) return null;
          const p = pos.get(n.id)!;
          return [n.left, n.right].map((c, k) => {
            const q = pos.get(c)!;
            const mid = p.x + NW + (COLW - NW) / 2;
            return (
              <g key={`${n.id}-${c}`}>
                <path
                  d={`M${p.x + NW} ${p.y}H${mid}V${q.y}H${q.x}`}
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth="1.5"
                />
                <text
                  x={mid + 3}
                  y={q.y + (k === 0 ? -4 : 12)}
                  fontSize="11"
                  fill="var(--color-muted)"
                >
                  {k === 0 ? 'yes' : 'no'}
                </text>
              </g>
            );
          });
        })}
        {tree.nodes.map((n) => {
          const p = pos.get(n.id)!;
          if (n.split) {
            return (
              <g key={n.id}>
                <rect
                  x={p.x}
                  y={p.y - 14}
                  width={NW}
                  height="28"
                  rx="14"
                  fill="var(--color-bg)"
                  stroke="var(--color-ink)"
                  strokeWidth="1.5"
                />
                <text
                  x={p.x + NW / 2}
                  y={p.y + 4.5}
                  fontSize="12"
                  textAnchor="middle"
                  fill="var(--color-ink)"
                >
                  {questionText(world, n.split)}
                </text>
              </g>
            );
          }
          const top = Math.max(n.counts[0], n.counts[1]);
          const total = n.counts[0] + n.counts[1];
          const wA = total ? (n.counts[0] / total) * (NW - 12) : 0;
          const on = n.id === selected;
          const name = n.prediction === 1 ? 'Orange' : 'Apple';
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`Box ${n.id}: ${name}, ${top} of ${total}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={press(n.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={p.x}
                y={p.y - 19}
                width={NW}
                height="38"
                rx="4"
                fill={fillFor(prefix, n.prediction)}
                stroke="var(--color-muted)"
              />
              <text
                x={p.x + NW / 2}
                y={p.y - 3}
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                fill="var(--color-ink)"
                stroke="var(--color-surface)"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {name}: {top} of {total}
              </text>
              <rect
                x={p.x + 6}
                y={p.y + 5}
                width={NW - 12}
                height="7"
                fill="var(--color-grid)"
              />
              <rect
                x={p.x + 6}
                y={p.y + 5}
                width={wA}
                height="7"
                fill="var(--color-pos)"
              />
              <rect
                x={p.x + 6 + wA}
                y={p.y + 5}
                width={NW - 12 - wA}
                height="7"
                fill="none"
                stroke="var(--color-neg)"
                strokeWidth="1.2"
                strokeDasharray="2 1.5"
              />
              {on && (
                <rect
                  x={p.x - 2}
                  y={p.y - 21}
                  width={NW + 4}
                  height="42"
                  rx="5"
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="3"
                  strokeDasharray="7 5"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Inner() {
  const { seed, n } = usePage();
  const [dataset, setDataset] = useState<Dataset>('fruit');
  const [kg, setKg] = useState(false);
  const [ownFeature, setOwnFeature] = useState<0 | 1>(0);
  const [ownState, setOwnState] = useState<{ key: string; i: number } | null>(null);

  const data = useMemo(
    () => (dataset === 'fruit' ? makeFruit(seed, n) : makeCheckerboard(seed, 200)),
    [dataset, seed, n],
  );
  const N = data.X.length;
  const key = `${dataset}:${seed}:${n}`;
  const root = useMemo(() => growTree(data.X, data.y, { maxDepth: 0 }), [data]);
  const [local, setLocal] = useState<Local | null>(null);
  const cur: Local =
    local && local.key === key
      ? local
      : { key, tree: root, sel: null, grown: null, msg: null };
  const tree = cur.tree;
  const world =
    dataset === 'fruit' ? fruitWorld(kg && dataset === 'fruit') : CHECKER_WORLD;
  const SC = scaleOf(world);
  const bounds = { x0: world.x0, x1: world.x1, y0: world.y0, y1: world.y1 };
  const set = (patch: Partial<Local>) => setLocal({ ...cur, ...patch });

  const nextBest = nextBestLeaf(tree);
  const mixed = mostMixedLeaf(tree);
  const selId =
    cur.sel !== null && tree.nodes[cur.sel] && !tree.nodes[cur.sel]!.split
      ? cur.sel
      : (nextBest?.nodeId ?? mixed?.id ?? 0);
  const selNode = tree.nodes[selId]!;
  const leaves = leafCount(tree);
  const depth = treeDepth(tree);
  const acc = trainingAccuracy(tree);
  const right = Math.round(acc * N);
  const light = useMemo(() => lighten(tree), [tree]);
  const regions = regionsOf(light, bounds);
  const cuts = cutsOf(light, bounds);
  const drawn = leaves <= MAX_DRAWN;

  const doSplit = () => {
    if (selNode.counts[0] === 0 || selNode.counts[1] === 0)
      return set({ msg: 'This box is already pure.' });
    const p = proposalFor(tree, selId);
    if (!p) return set({ msg: 'No cut would help here.' });
    setLocal({
      key,
      tree: splitNode(tree, selId, p.split),
      sel: null,
      grown: null,
      msg: null,
    });
  };
  const growTo = (g: Grown) =>
    setLocal({
      key,
      tree: growTree(data.X, data.y, {
        maxDepth: g === 'pure' || g === null ? UNLIMITED : g,
      }),
      sel: null,
      grown: g,
      msg: null,
    });
  const forced = () =>
    setLocal({
      key,
      tree: growTree(data.X, data.y, {
        maxDepth: 2,
        forced: [{ nodeId: 0, feature: 0, threshold: 0.5 }],
      }),
      sel: null,
      grown: null,
      msg: null,
    });
  const undo = () =>
    setLocal({ key, tree: undoLast(tree), sel: null, grown: null, msg: null });
  const reset = () => {
    setLocal(null);
    setOwnState(null);
    setKg(false);
    pageActions.reset();
  };

  // "Try my own cut" for the selected box
  const ownCurve = useMemo(
    () =>
      splitCurve(data.X, data.y, selNode.rows, { features: [ownFeature] })[ownFeature] ??
      [],
    [data, selNode, ownFeature],
  );
  const ownKey = `${key}:${selId}:${ownFeature}`;
  const ownMid = nearestIdx(
    ownCurve,
    ownCurve.length
      ? (ownCurve[0]!.threshold + ownCurve[ownCurve.length - 1]!.threshold) / 2
      : 0,
  );
  const ownIdx = ownCurve.length
    ? clamp(ownState?.key === ownKey ? ownState.i : ownMid, 0, ownCurve.length - 1)
    : 0;
  const ownThr = ownCurve[ownIdx]?.threshold;
  const ownSides =
    ownThr !== undefined
      ? sideCounts(data.X, data.y, selNode.rows, ownFeature, ownThr)
      : null;
  const applyOwn = () => {
    if (ownThr === undefined) return set({ msg: 'No cut is possible in this box.' });
    const t = splitNode(tree, selId, { feature: ownFeature, threshold: ownThr });
    if (t === tree) return set({ msg: 'No cut is possible in this box.' });
    setLocal({ key, tree: t, sel: null, grown: null, msg: null });
  };

  // reading
  const unitName = dataset === 'fruit' ? 'fruit' : 'points';
  const rootBest = leaves === 1 ? proposalFor(tree, 0) : null;
  const isForcedDone =
    dataset === 'checker' &&
    tree.nodes[0]!.split?.feature === 0 &&
    tree.nodes[0]!.split?.threshold === 0.5 &&
    leaves === 4 &&
    right === N;
  let reading: string;
  if (isForcedDone) {
    reading = `Two cuts by hand: ${pct0(acc)}. A tree that only looks one step ahead could not see this.`;
  } else if (dataset === 'checker' && leaves === 1) {
    reading = `No single cut helps: the best first cut lowers the mix by only ${f2(rootBest?.gain ?? 0)}.`;
  } else {
    const splits = leaves - 1;
    const nb = nextBest ? tree.nodes[nextBest.nodeId]! : null;
    reading = `${plural(splits, 'split')}, ${plural(leaves, 'box', 'boxes')}, depth ${depth}. Training accuracy ${pct0(acc)}. ${
      nb
        ? `The next best cut is in the box with ${plural(nb.counts[0], 'apple')} and ${plural(nb.counts[1], 'orange')}.`
        : 'Every box is pure or cannot be split further.'
    }`;
  }
  const summary = `${plural(leaves, 'box', 'boxes')}, depth ${depth}, training accuracy ${pct0(acc)}`;
  const describe = (r: { nodeId: number; prediction: 0 | 1 }) => {
    const nd = tree.nodes[r.nodeId]!;
    return `${r.prediction === 1 ? 'Orange' : 'Apple'}, ${Math.max(...nd.counts)} of ${nd.counts[0] + nd.counts[1]}`;
  };

  const selRegion = regions.find((r) => r.nodeId === selId);

  return (
    <>
      <PillRow<Dataset>
        label="Data"
        options={[
          { value: 'fruit', label: 'Fruit (overlapping)' },
          { value: 'checker', label: 'Checkerboard' },
        ]}
        value={dataset}
        onPick={(v) => {
          setDataset(v);
          setLocal(null);
        }}
      />

      <StickyControls>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={doSplit}>
            Split the next box
          </Button>
          <Button onClick={undo} disabled={tree.history.length === 0}>
            Undo
          </Button>
          {dataset === 'checker' && (
            <Button onClick={forced}>Cut the middle, then split each side</Button>
          )}
        </div>
        {cur.msg && (
          <p className="m-0 mt-1 text-xs font-semibold" role="status">
            {cur.msg}
          </p>
        )}
        <div className="mt-2">
          <PillRow<number | 'pure'>
            label="Grow to depth"
            options={[
              ...[1, 2, 3, 4, 6].map((d) => ({ value: d, label: String(d) })),
              { value: 'pure', label: 'Until pure' },
            ]}
            value={cur.grown}
            onPick={growTo}
          />
        </div>
      </StickyControls>
      <p className="m-0 text-xs text-muted">
        {`Selected: box ${selId} (${plural(selNode.counts[0], 'apple')}, ${plural(selNode.counts[1], 'orange')}). A box is a group of ${unitName} that got the same answers. Click a box to pick it.`}
      </p>

      <div className="mt-3">
        <YAxisName>{world.yLabel}</YAxisName>
        <MapChart
          world={world}
          label={`${dataset === 'fruit' ? 'Fruit' : 'Checkerboard points'} split into boxes. ${summary}`}
        >
          <Patterns prefix="gt" />
          <Regions
            regions={regions}
            scale={SC}
            prefix="gt"
            selected={selId}
            onSelect={(id) => set({ sel: id, msg: null })}
            describe={describe}
          />
          <Cuts cuts={cuts} scale={SC} world={world} labels={leaves <= 8} />
          {selRegion && ownThr !== undefined && (
            <line
              x1={SC.px(ownFeature === 0 ? ownThr : selRegion.x0)}
              x2={SC.px(ownFeature === 0 ? ownThr : selRegion.x1)}
              y1={SC.py(ownFeature === 0 ? selRegion.y0 : ownThr)}
              y2={SC.py(ownFeature === 0 ? selRegion.y1 : ownThr)}
              stroke="var(--color-accent)"
              strokeWidth="2.4"
              strokeDasharray="2 4"
              strokeLinecap="round"
            />
          )}
          <ClassPoints X={data.X} y={data.y} scale={SC} r={N > 100 ? 3.2 : 4.2} />
        </MapChart>
        <Legend items={[...CLASS_LEGEND, ...BOX_LEGEND]} />
      </div>

      <div className="mt-3">
        {drawn ? (
          <Diagram
            tree={tree}
            world={world}
            selected={selId}
            onSelect={(id) => set({ sel: id, msg: null })}
          />
        ) : (
          <Note icon="ℹ">
            Too big to draw: {leaves} boxes. The map above still shows every box.
          </Note>
        )}
        <p className="m-0 mt-1 text-xs text-muted">
          Each question reads “feature &lt; value?”. Yes goes up, no goes down. Each end
          box says which kind wins there, and how many of its {unitName} are that kind.
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Boxes" value={String(leaves)} plain="end boxes the tree has made" />
        <Card label="Depth" value={String(depth)} plain="most questions asked in a row" />
        <Card
          label="Training accuracy"
          value={`${right} of ${N}`}
          plain={`${pct0(acc)} right if each box guesses its majority`}
        />
        <Card
          label={`${dataset === 'fruit' ? 'Fruit' : 'Points'} in the most mixed box`}
          value={mixed ? String(mixed.rows.length) : '—'}
          plain={mixed ? `mix ${f2(gini(mixed.counts))}` : 'no box'}
        />
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      {dataset === 'fruit' && (
        <div className="mt-3">
          <Toggle
            label="Measure weight in kg instead of grams"
            checked={kg}
            onChange={setKg}
          />
          {kg && (
            <p className="m-0 text-xs text-muted" role="status">
              Same boxes, same answers. Unlike gradient descent, trees ignore units.
            </p>
          )}
        </div>
      )}

      <details className="mt-3 rounded-md border border-grid bg-bg p-3">
        <summary className="cursor-pointer text-sm font-semibold">Try my own cut</summary>
        <div className="mt-2">
          <SegmentedControl
            label="Question about"
            options={[
              { value: '0', label: world.name[0] },
              { value: '1', label: world.name[1] },
            ]}
            value={String(ownFeature)}
            onChange={(v) => setOwnFeature(v === '1' ? 1 : 0)}
          />
          <div className="mt-2">
            <Slider
              label={`Cut in box ${selId}`}
              value={ownIdx}
              min={0}
              max={Math.max(0, ownCurve.length - 1)}
              step={1}
              onChange={(v) => setOwnState({ key: ownKey, i: Math.round(v) })}
              format={(i) =>
                ownCurve[i] ? world.value[ownFeature](ownCurve[i]!.threshold) : '—'
              }
            />
          </div>
          <p className="m-0 mt-1 text-xs text-muted">
            {ownSides
              ? `Yes: ${plural(ownSides.left[0], 'apple')}, ${plural(ownSides.left[1], 'orange')}. No: ${plural(ownSides.right[0], 'apple')}, ${plural(ownSides.right[1], 'orange')}.`
              : 'This box has no cut to try.'}
          </p>
          <div className="mt-2">
            <Button onClick={applyOwn} disabled={ownThr === undefined}>
              Apply cut
            </Button>
          </div>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newFruit}>New fruit</Button>
        <Button onClick={reset}>Reset</Button>
      </div>
    </>
  );
}

export function GrowTheTree() {
  return (
    <ClientOnly
      minHeight={1950}
      minHeightWide={1700}
      label="Growing a tree: split box after box and watch the map and the questions grow together"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
