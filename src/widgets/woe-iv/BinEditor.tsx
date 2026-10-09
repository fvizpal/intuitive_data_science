import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { ClientOnly } from './ClientOnly';
import { FeaturePicker } from './FeaturePicker';
import { WoeBars } from './WoeBars';
import {
  FEATURES,
  READING_COLOR,
  analyze,
  binLabel,
  signed,
  woeReading,
} from './features';
import type { RankedKey } from './features';
import {
  MAX_BINS,
  MIN_BINS,
  addSplit,
  edgeToMerge,
  moveEdge,
  presetEqualCount,
  presetEqualWidth,
  removeEdge,
} from './binning';
import type { EdgeSpace } from './binning';
import { getLoans, usePage } from './store';
import { binWarnings, isMonotonic, ivStrength, woeSequence } from './woe';

const KEYS: RankedKey[] = [
  'bureau_score',
  'years_in_business',
  'monthly_turnover_lakh',
  'max_dpd_6m',
];
/** Long-tailed features are drawn up to their 99th percentile. */
const CLIPPED = new Set<RankedKey>(['monthly_turnover_lakh', 'max_dpd_6m']);

const W = 400;
const H = 228;
const L = 12;
const R = W - 12;
const BASE = 168;
const TOP = 40;
const BARS = 40;
/** Start simple: with ~4% defaults, more bins quickly run out of defaulters. */
const START_BINS = 3;

function Editor({ feature, seed }: { feature: RankedKey; seed: number }) {
  const loans = getLoans(seed);
  const meta = FEATURES[feature];
  const values = loans.columns[feature];

  const data = useMemo(() => {
    const finite = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    const lo = finite[0] as number;
    const hi = finite[finite.length - 1] as number;
    const q99 = finite[Math.floor(finite.length * 0.99)] as number;
    const hiDisp = CLIPPED.has(feature) ? q99 : hi;
    const space: EdgeSpace = { lo, hiDisp, step: meta.step, decimals: meta.decimals };
    const counts = new Array<number>(BARS).fill(0);
    for (const v of finite) {
      const b = Math.min(BARS - 1, Math.floor(((v - lo) / (hiDisp - lo)) * BARS));
      counts[b] = (counts[b] as number) + 1;
    }
    return { finite, lo, hi, hiDisp, space, counts, maxCount: Math.max(...counts) };
  }, [values, feature, meta]);
  const { finite, lo, hi, hiDisp, space } = data;

  const [inner, setInner] = useState<number[]>(() =>
    presetEqualCount(finite, START_BINS, space),
  );
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const handleRefs = useRef<(SVGGElement | null)[]>([]);
  const refocus = useRef<number | null>(null);

  useEffect(() => {
    if (refocus.current !== null) {
      handleRefs.current[refocus.current]?.focus();
      refocus.current = null;
    }
  }, [inner]);

  const fullEdges = useMemo(() => [lo, ...inner, hi], [lo, inner, hi]);
  const analysis = useMemo(
    () => analyze(loans, feature, fullEdges),
    [loans, feature, fullEdges],
  );
  const nBins = inner.length + 1;
  const warnings = useMemo(() => binWarnings(analysis.bins), [analysis]);
  const flagged = useMemo(() => new Set(warnings.map((w) => w.index)), [warnings]);
  const monotonic = isMonotonic(woeSequence(analysis.bins));
  const strength = ivStrength(analysis.iv);
  const nonEmptyCounts = analysis.bins.slice(0, nBins).map((b) => b.count);

  const x = (v: number) => L + ((Math.min(v, hiDisp) - lo) / (hiDisp - lo)) * (R - L);
  const toValue = (clientX: number, rect: DOMRect) =>
    lo + (((clientX - rect.left) * (W / rect.width) - L) / (R - L)) * (hiDisp - lo);

  const apply = (next: number[], message: string) => {
    setInner(next);
    setNote(message);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null || !svgRef.current) return;
    setInner((cur) =>
      moveEdge(
        cur,
        drag,
        toValue(e.clientX, svgRef.current!.getBoundingClientRect()),
        space,
      ),
    );
  };

  const onHandleKey = (e: KeyboardEvent, j: number) => {
    const big = e.shiftKey ? 5 : 1;
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp'
    ) {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1;
      setInner((cur) =>
        moveEdge(cur, j, (cur[j] as number) + dir * big * space.step, space),
      );
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (inner.length + 1 <= MIN_BINS) {
        setNote(`Need at least ${MIN_BINS} bins.`);
        return;
      }
      refocus.current = Math.max(0, Math.min(j, inner.length - 2));
      setSel(null);
      apply(removeEdge(inner, j), 'Split removed.');
    }
  };

  const reset = () => {
    setSel(null);
    apply(
      presetEqualCount(finite, START_BINS, space),
      `Back to ${START_BINS} equal-count bins.`,
    );
  };

  const bars = data.counts.map((c, i) => {
    const bw = (R - L) / BARS;
    const h = Math.sqrt(c / data.maxCount) * (BASE - TOP);
    return { x: L + i * bw, w: bw, h };
  });

  const regions = fullEdges.slice(0, -1).map((a, i) => ({
    a,
    b: i === nBins - 1 ? hiDisp : (fullEdges[i + 1] as number),
    bin: analysis.bins[i]!,
  }));

  const missing = analysis.bins[nBins];
  const summary = `${nBins} bins, total IV ${analysis.iv.toFixed(3)} (${strength}). ${
    monotonic ? 'WoE goes steadily one way.' : 'WoE zig-zags.'
  }${warnings.length ? ` ${warnings.length} bin${warnings.length > 1 ? 's' : ''} too small to trust.` : ''}`;

  return (
    <>
      <div className="mb-3 text-sm text-muted">
        Drag the diamonds (or focus one and press ← →, Shift for bigger steps, Delete to
        remove).
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}`, touchAction: 'pan-y' }}
        role="group"
        aria-label={`Histogram of ${meta.label} with ${nBins} bins. Bin edges can be dragged.`}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        {regions.map(({ a, b, bin }, i) => {
          const r = woeReading(bin.woe);
          const warn = flagged.has(i);
          return (
            <g key={i}>
              <rect
                x={x(a)}
                y={TOP - 14}
                width={Math.max(0, x(b) - x(a))}
                height={BASE - TOP + 14}
                fill={READING_COLOR[r]}
                fillOpacity={bin.count > 0 ? 0.13 : 0}
                stroke={warn ? 'var(--color-neg)' : 'none'}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              {bin.count > 0 && x(b) - x(a) > 34 && (
                <text
                  x={(x(a) + x(b)) / 2}
                  y={TOP - 3}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  {signed(bin.woe)}
                </text>
              )}
            </g>
          );
        })}
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x + 0.5}
            y={BASE - b.h}
            width={Math.max(0, b.w - 1)}
            height={b.h}
            fill="var(--color-muted)"
            fillOpacity="0.55"
          />
        ))}
        <line x1={L} x2={R} y1={BASE} y2={BASE} stroke="var(--color-ink)" />
        <text x={L} y={BASE + 14} fontSize="10" fill="var(--color-muted)">
          {lo.toFixed(meta.decimals)}
        </text>
        <text
          x={R}
          y={BASE + 14}
          fontSize="10"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {hiDisp.toFixed(meta.decimals)}
          {hiDisp < hi ? '+' : ''}
        </text>
        {inner.map((e, j) => {
          const ex = x(e);
          const active = sel === j || drag === j;
          return (
            <g
              key={j}
              ref={(el) => {
                handleRefs.current[j] = el;
              }}
              role="slider"
              tabIndex={0}
              aria-label={`Bin edge ${j + 1} of ${inner.length}`}
              aria-valuemin={
                j > 0 ? (inner[j - 1] as number) + space.step : lo + space.step
              }
              aria-valuemax={
                j < inner.length - 1
                  ? (inner[j + 1] as number) - space.step
                  : hiDisp - space.step
              }
              aria-valuenow={e}
              aria-valuetext={`${e.toFixed(meta.decimals)}`}
              onKeyDown={(ev) => onHandleKey(ev, j)}
              onFocus={() => setSel(j)}
              style={{ outline: 'none' }}
            >
              <rect
                x={ex - 15}
                y={TOP - 14}
                width="30"
                height={H - TOP + 14}
                fill="transparent"
                style={{ cursor: 'ew-resize', touchAction: 'none' }}
                onPointerDown={(ev) => {
                  ev.preventDefault();
                  svgRef.current?.setPointerCapture(ev.pointerId);
                  setDrag(j);
                  setSel(j);
                }}
              />
              <line
                x1={ex}
                x2={ex}
                y1={TOP - 14}
                y2={BASE + 18}
                stroke="var(--color-ink)"
                strokeWidth={active ? 2.5 : 1.5}
                pointerEvents="none"
              />
              <path
                d={`M${ex},${BASE + 20} l9,9 l-9,9 l-9,-9 Z`}
                fill="var(--color-accent)"
                stroke="var(--color-ink)"
                strokeWidth={active ? 2.5 : 1.5}
                pointerEvents="none"
              />
              <text
                x={ex}
                y={BASE + 52}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--color-ink)"
                pointerEvents="none"
              >
                {e.toFixed(meta.decimals)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="m-0 text-xs text-muted">
        Grey bars: how many people have each value (square-root scale).
        {hiDisp < hi &&
          ` Drawn up to the 99th percentile; the last bin runs to ${hi.toFixed(meta.decimals)}.`}{' '}
        Shaded bins: teal ▲ safer, coral ▼ riskier.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={nBins >= MAX_BINS}
          onClick={() => apply(addSplit(inner, finite, hi, space), 'Split added.')}
        >
          Add split
        </Button>
        <Button
          disabled={nBins <= MIN_BINS}
          onClick={() => {
            const j =
              sel !== null && sel < inner.length ? sel : edgeToMerge(nonEmptyCounts);
            setSel(null);
            apply(removeEdge(inner, j), 'Split removed.');
          }}
        >
          Remove split
        </Button>
        <Button
          onClick={() => apply(presetEqualWidth(nBins, space), 'Equal-width bins.')}
        >
          Equal width
        </Button>
        <Button
          onClick={() =>
            apply(presetEqualCount(finite, nBins, space), 'Equal-count bins.')
          }
        >
          Equal count
        </Button>
        <Button onClick={reset}>Reset</Button>
      </div>

      <h4 className="mb-1 mt-4 text-sm font-semibold">Evidence in your bins</h4>
      <WoeBars
        bins={analysis.bins}
        edges={fullEdges}
        meta={meta}
        flagged={flagged}
        label={`Weight of evidence of your ${nBins} ${meta.label} bins`}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric
          label="Total IV"
          value={analysis.iv.toFixed(3)}
          tone="accent"
          hint={`${strength} predictor`}
        />
        <Metric
          label="Bins"
          value={String(nBins)}
          hint={
            missing && missing.count > 0
              ? `+ Missing (${missing.count})`
              : 'no missing values'
          }
        />
      </div>
      <p
        className="m-0 mt-3 rounded-md border-l-4 bg-bg p-2 text-sm font-semibold"
        style={{ borderColor: monotonic ? 'var(--color-pos)' : 'var(--color-neg)' }}
      >
        <span aria-hidden="true">{monotonic ? '✓ ' : '⚠ '}</span>
        {monotonic
          ? 'WoE goes steadily one way: good for a scorecard.'
          : 'WoE zig-zags: bins may be too fine.'}
      </p>
      {warnings.length > 0 && (
        <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm">
          {warnings.map((w) => (
            <li key={w.index}>
              <span className="text-neg" aria-hidden="true">
                ⚠{' '}
              </span>
              <strong>{binLabel(meta, fullEdges, w.index)}</strong>:{' '}
              {w.fewBads
                ? 'Too few defaulters: this WoE is noisy.'
                : 'Too few people: this WoE is noisy.'}
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {summary} {note}
      </p>
      <p className="mb-0 mt-2 text-xs text-muted" aria-hidden="true">
        {summary}
      </p>
    </>
  );
}

function Inner() {
  const { seed } = usePage();
  const [feature, setFeature] = useState<RankedKey>('bureau_score');
  return (
    <>
      <FeaturePicker keys={KEYS} value={feature} onChange={setFeature} />
      <div className="mt-3">
        <Editor key={`${feature}-${seed}`} feature={feature} seed={seed} />
      </div>
    </>
  );
}

export function BinEditor() {
  return (
    <ClientOnly
      minHeight={980}
      label="Bin editor: move the bin edges and watch the weight of evidence and information value change"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
