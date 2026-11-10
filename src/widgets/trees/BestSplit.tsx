import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { niceMax, niceTicks, tickLabel } from '../sampling/charts';
import { Card, Chip, Reading, StickyControls, f2, fruitWorld, plural } from './charts';
import { makeFruit } from './data';
import { gain as gainOf, weightedImpurity } from './impurity';
import { pageActions, usePage } from './store';
import { splitCurve, type Candidate } from './tree';
import { range } from './view';

// ---------- panel A: two questions about 100 fruit ----------

type Box = { apples: number; oranges: number };
const QUESTIONS: { id: 'A' | 'B'; boxes: [Box, Box]; blurb: string }[] = [
  {
    id: 'A',
    blurb: 'two even boxes',
    boxes: [
      { apples: 35, oranges: 15 },
      { apples: 15, oranges: 35 },
    ],
  },
  {
    id: 'B',
    blurb: 'one pure box, one mixed',
    boxes: [
      { apples: 0, oranges: 20 },
      { apples: 50, oranges: 30 },
    ],
  },
];

const stats = (boxes: [Box, Box]) => {
  const l = [boxes[0].apples, boxes[0].oranges];
  const r = [boxes[1].apples, boxes[1].oranges];
  return {
    right: Math.max(...l) + Math.max(...r),
    mix: weightedImpurity(l, r),
    gain: gainOf([50, 50], l, r),
  };
};

/** Exact short form for the hand-checkable numbers: 0.42, 0.375, 0.125. */
const t3 = (v: number): string =>
  Number.isFinite(v) ? String(Number(v.toFixed(3))) : '—';

const STEP = 13;
const COLS = 10;

function DotBlock({ boxes, label }: { boxes: [Box, Box]; label: string }) {
  let y = 4;
  const parts: ReactNode[] = [];
  boxes.forEach((b, bi) => {
    const total = b.apples + b.oranges;
    const rows = Math.max(1, Math.ceil(total / COLS));
    const h = rows * STEP + 6;
    parts.push(
      <g key={bi}>
        <text x="2" y={y + 11} fontSize="11" fill="var(--color-muted)">
          Box {bi + 1}: {b.apples} apples, {b.oranges} oranges
        </text>
        <rect
          x="1"
          y={y + 16}
          width={COLS * STEP + 6}
          height={h}
          fill="none"
          stroke="var(--color-muted)"
          rx="3"
        />
        {Array.from({ length: total }, (_, i) => {
          const cx = 4 + (i % COLS) * STEP + STEP / 2;
          const cy = y + 16 + 3 + Math.floor(i / COLS) * STEP + STEP / 2;
          return i < b.apples ? (
            <circle key={i} cx={cx} cy={cy} r="4.2" fill="var(--color-pos)" />
          ) : (
            <polygon
              key={i}
              points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`}
              fill="none"
              stroke="var(--color-neg)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          );
        })}
      </g>,
    );
    y += h + 26;
  });
  return (
    <svg
      viewBox={`0 0 ${COLS * STEP + 8} ${y}`}
      className="block h-auto w-full max-w-[220px]"
      role="img"
      aria-label={label}
    >
      {parts}
    </svg>
  );
}

function PanelA() {
  const [measure, setMeasure] = useState<'mix' | 'accuracy'>('mix');
  useEffect(() => {
    pageActions.setScored(measure);
  }, [measure]);
  const s = QUESTIONS.map((q) => stats(q.boxes));
  const win = s[1]!.gain > s[0]!.gain ? 1 : 0;
  return (
    <section aria-label="Two candidate questions">
      <h3 className="m-0 mb-2 text-base font-semibold">Two candidate questions</h3>
      <p className="m-0 mb-2 text-sm text-muted">
        100 fruit: 50 apples, 50 oranges. Each question splits them into two boxes, and
        each box guesses its majority kind. The switch below chooses how to judge the
        questions. <strong>Accuracy</strong> asks: how many of the 100 does this get
        right? <strong>Mix</strong> asks: how clean are the two boxes? Lower mix is
        cleaner. Does either judge find a winner?
      </p>
      <StickyControls>
        <SegmentedControl
          label="Score by"
          options={[
            { value: 'mix', label: 'Mix (what trees use)' },
            { value: 'accuracy', label: 'Accuracy' },
          ]}
          value={measure}
          onChange={setMeasure}
        />
      </StickyControls>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {QUESTIONS.map((q, i) => {
          const st = s[i]!;
          const winner = measure === 'mix' && win === i;
          return (
            <div
              key={q.id}
              className={`min-w-0 rounded-md border-2 p-3 ${winner ? 'border-good' : 'border-grid'}`}
            >
              <div className="mb-1 text-sm font-semibold">
                {q.id}: {q.blurb}
                {winner && <span className="ml-2 text-good">✓ tree&rsquo;s choice</span>}
              </div>
              <DotBlock
                boxes={q.boxes}
                label={`Question ${q.id}: box 1 has ${q.boxes[0].apples} apples and ${q.boxes[0].oranges} oranges, box 2 has ${q.boxes[1].apples} apples and ${q.boxes[1].oranges} oranges`}
              />
              <div className="mt-2 grid gap-2">
                <Card
                  label="Right"
                  value={`${st.right} of 100`}
                  plain="each box guesses its majority"
                  tone={measure === 'accuracy' ? 'good' : 'ink'}
                />
                <Card
                  label="Mix after"
                  value={t3(st.mix)}
                  plain="lower is purer"
                  tone={winner ? 'good' : 'ink'}
                />
                <Card
                  label="Gain"
                  value={t3(st.gain)}
                  plain="mix before (0.50) minus mix after"
                  tone={winner ? 'good' : 'ink'}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Chip>By mix, B wins. By accuracy, they tie.</Chip>
      <Reading>
        {measure === 'mix'
          ? `Mix gives B a gain of ${t3(s[1]!.gain)} against ${t3(s[0]!.gain)} for A, because B peels off 20 pure oranges. A tree picks B. This is the answer to the Predict question: “B: one pure box, one mixed”.`
          : `Both questions get 70 of 100 right, so accuracy cannot choose between them. Switch to Mix to see what a tree uses: it breaks the tie in favour of B.`}
      </Reading>
    </section>
  );
}

// ---------- panel B: try every cut ----------

const W = 600;
const H = 250;
const L = 52;
const R = 12;
const T = 16;
const B = 42;
const PW = W - L - R;
const PH = H - T - B;

function bestOf(curve: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of curve)
    if (c.valid && (best === null || c.gain > best.gain + 1e-12)) best = c;
  return best;
}

function PanelB() {
  const { seed, n } = usePage();
  const [feature, setFeature] = useState<0 | 1>(1);
  const [minLeaf, setMinLeaf] = useState(1);
  const world = fruitWorld(false);
  const data = useMemo(() => makeFruit(seed, n), [seed, n]);
  const curves = useMemo(
    () => splitCurve(data.X, data.y, range(n), { minLeaf }),
    [data, n, minLeaf],
  );
  const bests = [bestOf(curves[0] ?? []), bestOf(curves[1] ?? [])];
  const yMax = niceMax(Math.max(0.05, ...curves.flat().map((c) => c.gain)));
  const lo = feature === 0 ? world.x0 : world.y0;
  const hi = feature === 0 ? world.x1 : world.y1;
  const px = (v: number) => L + ((v - lo) / (hi - lo)) * PW;
  const py = (g: number) => T + (1 - g / yMax) * PH;
  const cur = curves[feature] ?? [];
  const valid = cur.filter((c) => c.valid).length;
  const bestHere = bests[feature];
  const fmtCut = (f: 0 | 1, t: number) => world.value[f](t);
  const names = ['weight', 'skin shade'] as const;
  const choice: 0 | 1 | null =
    bests[0] && bests[1]
      ? bests[1].gain > bests[0].gain + 1e-12
        ? 1
        : 0
      : bests[0]
        ? 0
        : bests[1]
          ? 1
          : null;

  const reading =
    choice === null
      ? 'No cut is allowed with this smallest box size.'
      : `${([1, 0] as const)
          .filter((f) => bests[f])
          .map((f, i) =>
            i === 0
              ? `${f === 1 ? 'Skin shade' : 'Weight'} at ${fmtCut(f, bests[f]!.threshold)} lowers the mix by ${f2(bests[f]!.gain)}`
              : `${f === 1 ? 'skin shade' : 'weight'} at ${fmtCut(f, bests[f]!.threshold)} by ${f2(bests[f]!.gain)}`,
          )
          .join(', ')}. The tree asks about ${names[choice]} first.${
          minLeaf > 1
            ? ` Smallest box ${minLeaf}: ${valid} of ${cur.length} candidate cuts on ${names[feature]} remain.`
            : ''
        }`;

  const ticks = niceTicks(lo, hi, feature === 0 ? 4 : 5);
  const gTicks = niceTicks(0, yMax, 4);
  const line = cur
    .map(
      (c, i) => `${i ? 'L' : 'M'}${px(c.threshold).toFixed(1)} ${py(c.gain).toFixed(1)}`,
    )
    .join('');

  return (
    <section aria-label="Try every cut" className="mt-6">
      <h3 className="m-0 mb-2 text-base font-semibold">Try every cut</h3>
      <p className="m-0 mb-2 text-sm text-muted">
        The tree lines the fruit up by one feature and tries a cut between every pair of
        neighbours. Each dot is one cut. Its height is its <strong>gain</strong>: how much
        cleaner the two boxes are. The tree takes the highest dot, after checking both
        features.
      </p>
      <StickyControls>
        <SegmentedControl
          label="Feature on the chart"
          options={[
            { value: '0', label: 'Weight' },
            { value: '1', label: 'Skin shade' },
          ]}
          value={String(feature)}
          onChange={(v) => setFeature(v === '0' ? 0 : 1)}
        />
        <div className="mt-2">
          <Slider
            label="Smallest box allowed (minimum leaf size)"
            value={minLeaf}
            min={1}
            max={15}
            step={1}
            onChange={(v) => setMinLeaf(Math.round(v))}
            format={(v) => `${v} fruit`}
          />
        </div>
      </StickyControls>
      <div>
        <p className="m-0 mb-1 text-xs text-muted">
          <strong>Smallest box</strong> (minimum leaf size): the fewest fruit a box may
          hold. A cut that would leave a smaller box is banned and turns grey. Tiny boxes
          can look pure by luck, so a minimum stops the tree trusting them.
        </p>
        <p className="m-0 text-xs text-muted">
          {minLeaf === 1
            ? `All ${cur.length} candidate cuts on ${names[feature]} are allowed.`
            : `${valid} of ${cur.length} candidate cuts on ${names[feature]} remain.`}
        </p>
      </div>

      <div className="mt-3">
        <p className="m-0 mb-1 text-xs text-muted">
          ↑ Gain: how much a cut lowers the mix
        </p>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`Gain for every cut on ${names[feature]}. ${reading}`}
        >
          <rect
            x={L}
            y={T}
            width={PW}
            height={PH}
            fill="var(--color-surface)"
            stroke="var(--color-grid)"
          />
          {gTicks.map((g) => (
            <g key={g}>
              <line x1={L} x2={L + PW} y1={py(g)} y2={py(g)} stroke="var(--color-grid)" />
              <text
                x={L - 6}
                y={py(g) + 5}
                fontSize="14"
                textAnchor="end"
                fill="var(--color-muted)"
              >
                {tickLabel(g)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text
              key={t}
              x={px(t)}
              y={T + PH + 20}
              fontSize="14"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {tickLabel(t)}
            </text>
          ))}
          <text
            x={L + PW}
            y={H - 4}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {feature === 0 ? 'Cut position: weight (g)' : 'Cut position: skin shade'}
          </text>
          <path
            d={line}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="1.2"
            opacity="0.5"
          />
          {cur.map((c, i) => (
            <circle
              key={i}
              cx={px(c.threshold)}
              cy={py(c.gain)}
              r={c.valid ? 3 : 2.6}
              fill={c.valid ? 'var(--color-accent)' : 'var(--color-surface)'}
              stroke={c.valid ? 'var(--color-accent)' : 'var(--color-muted)'}
              strokeWidth="1.2"
              opacity={c.valid ? 1 : 0.55}
            />
          ))}
          {bestHere && (
            <g>
              <line
                x1={px(bestHere.threshold)}
                x2={px(bestHere.threshold)}
                y1={py(bestHere.gain)}
                y2={T + PH}
                stroke="var(--color-good)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <rect
                x={px(bestHere.threshold) - 6}
                y={py(bestHere.gain) - 6}
                width="12"
                height="12"
                transform={`rotate(45 ${px(bestHere.threshold)} ${py(bestHere.gain)})`}
                fill="var(--color-good)"
                stroke="var(--color-surface)"
                strokeWidth="1.5"
              />
              <text
                x={Math.min(L + PW - 4, Math.max(L + 4, px(bestHere.threshold)))}
                y={Math.max(T + 12, py(bestHere.gain) - 12)}
                fontSize="13"
                fontWeight="600"
                textAnchor={px(bestHere.threshold) > L + PW * 0.7 ? 'end' : 'start'}
                fill="var(--color-ink)"
                stroke="var(--color-surface)"
                strokeWidth="3.5"
                paintOrder="stroke"
              >
                Best: {fmtCut(feature, bestHere.threshold)}
              </text>
            </g>
          )}
        </svg>
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 p-0 text-xs text-muted">
          <li>● allowed cut</li>
          <li>○ greyed out: a box would be too small</li>
          <li>◆ best cut</li>
        </ul>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([0, 1] as const).map((f) => {
          const b = bests[f];
          return (
            <Card
              key={f}
              label={`Best cut on ${names[f]}${choice === f ? ' · ✓ Tree’s choice' : ''}`}
              value={b ? fmtCut(f, b.threshold) : '—'}
              plain={b ? `gain ${f2(b.gain)}` : 'no cut is allowed'}
              tone={choice === f ? 'good' : 'ink'}
            />
          );
        })}
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {reading}
      </p>
      <p className="m-0 mt-2 text-xs text-muted">
        {plural(n, 'fruit', 'fruit')} in the sample. A cut sits halfway between two
        neighbouring different values.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newFruit}>New fruit</Button>
        <Button
          onClick={() => {
            setFeature(1);
            setMinLeaf(1);
            pageActions.reset();
          }}
        >
          Reset
        </Button>
      </div>
    </section>
  );
}

export function BestSplit() {
  return (
    <ClientOnly
      minHeight={2500}
      minHeightWide={1800}
      label="The best split: compare two questions, then try every cut"
    >
      {() => (
        <>
          <PanelA />
          <PanelB />
        </>
      )}
    </ClientOnly>
  );
}
