import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { MarkerLegend, MeanMark, MedianMark } from '../averages/Markers';
import {
  histogramCounts,
  mean,
  median,
  skewLabel,
  skewness,
  std,
} from '../averages/stats';
import { W, f0, f1 } from './charts';
import { marksSample, pocketMoneySample } from './data';
import { beyondSD, boxCox, boxCoxOne } from './dist';
import { pageActions, usePage } from './store';

const N = 400;
const BINS = 25;
const H = 280;
const L = 14;
const R = W - 14;
const TOP = 40;
const AXIS_Y = 196;
const ANIM_MS = 600;

type Kind = 'pocket' | 'marks';

const KINDS: Record<
  Kind,
  { label: string; name: string; ticks: number[]; unit: string }
> = {
  pocket: {
    label: 'Pocket money',
    name: 'Pocket money',
    ticks: [5, 10, 20, 50, 100, 200, 500],
    unit: '₹',
  },
  marks: {
    label: 'Exam marks',
    name: 'Marks',
    ticks: [30, 40, 50, 60, 70, 80, 90],
    unit: 'marks',
  },
};

const r2 = (v: number) =>
  !Number.isFinite(v) ? '—' : `${v < -0.005 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function Inner() {
  const { seed } = usePage();
  const [kind, setKind] = useState<Kind>('pocket');
  const [lambda, setLambda] = useState(1);
  const raf = useRef<number | null>(null);

  const raw = useMemo(
    () => (kind === 'pocket' ? pocketMoneySample(seed, N) : marksSample(seed, N, 60, 10)),
    [kind, seed],
  );
  const t = useMemo(() => boxCox(raw, lambda), [raw, lambda]);
  const rawBeyond = useMemo(() => beyondSD(raw, 3), [raw]);

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  useEffect(() => stop, []);

  const glide = (to: number) => {
    stop();
    if (reducedMotion()) {
      setLambda(to);
      return;
    }
    const from = lambda;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ANIM_MS);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
      setLambda(from + (to - from) * e);
      raf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };

  const v = t.values;
  const m = mean(v);
  const med = median(v);
  const sd = std(v);
  const sk = skewness(v);
  const label = skewLabel(sk);
  const beyond = beyondSD(v, 3);
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const counts = useMemo(() => histogramCounts(v, lo, hi, BINS), [v, lo, hi]);
  const top = Math.max(1, ...counts);
  const span = hi - lo || 1;
  const x = (val: number) => L + ((val - lo) / span) * (R - L);
  const barW = (R - L) / BINS;

  const spec = KINDS[kind];
  const ticks = spec.ticks
    .map((orig) => ({ orig, pos: boxCoxOne(orig, lambda) }))
    .filter(
      (tk): tk is { orig: number; pos: number } =>
        tk.pos !== null && tk.pos >= lo && tk.pos <= hi,
    );

  const squashed = lambda < 0.02;
  const axisTitle =
    lambda > 0.98
      ? `${spec.name}${kind === 'pocket' ? ' (₹ per week)' : ''}`
      : squashed
        ? `${spec.name} on a log scale: each step is a multiple`
        : `${spec.name}, partly squashed (λ = ${f1(lambda)})`;

  const gap = m - med;
  const gapReading =
    Math.abs(gap) < 0.1 * sd
      ? 'mean and median nearly agree'
      : gap > 0
        ? 'mean is pulled above the median'
        : 'mean is pulled below the median';
  const unit = lambda > 0.98 ? spec.unit : squashed ? 'log units' : 'squashed units';
  const caption =
    kind === 'marks'
      ? 'Nothing to fix here.'
      : lambda > 0.98
        ? 'A long tail to the right. Squash it and watch the "outliers".'
        : beyond < rawBeyond
          ? `Many "outliers" were just the long tail: ${rawBeyond} became ${beyond}.`
          : 'Keep squashing.';
  const shape =
    label === 'tail to the right'
      ? 'long tail to the right'
      : label === 'tail to the left'
        ? 'long tail to the left'
        : 'roughly symmetric';
  const outlierIdx = v.filter((val) => Math.abs(val - m) > 3 * sd);
  const summary = `${spec.label}, λ ${f1(lambda)}: ${shape}. Mean minus median ${r2(gap)} ${unit}. ${beyond} of ${v.length} values beyond 3 SD (${rawBeyond} in the raw data). ${caption}`;

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Dataset">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <Button
            key={k}
            aria-pressed={kind === k}
            className={kind === k ? 'border-accent font-semibold' : ''}
            onClick={() => {
              stop();
              setKind(k);
              setLambda(1);
            }}
          >
            {KINDS[k].label}
          </Button>
        ))}
      </div>

      <div className="mt-3">
        <Slider
          label="Squash the long tail (1 = none, 0 = full log)"
          value={lambda}
          min={0}
          max={1}
          step={0.05}
          onChange={(val) => {
            stop();
            setLambda(Math.round(val * 20) / 20);
          }}
          format={(val) => f1(val)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => glide(lambda > 0.5 ? 0 : 1)}>
            {lambda > 0.5 ? 'Take the log' : 'Back to raw'}
          </Button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${v.length} ${spec.label.toLowerCase()} values: ${shape}. Mean ${r2(m)}, median ${r2(med)}.`}
      >
        <text x="6" y="16" fontSize="17" fill="var(--color-muted)">
          number of values per bar
        </text>
        {counts.map((c, i) => {
          const h = (c / top) * (AXIS_Y - TOP - 6);
          return (
            <rect
              key={i}
              x={L + i * barW + 0.5}
              y={AXIS_Y - h}
              width={Math.max(0, barW - 1)}
              height={h}
              fill="color-mix(in srgb, var(--color-accent) 40%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth="1"
            />
          );
        })}
        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-grid)" />
        {ticks.map((tk) => (
          <g key={tk.orig}>
            <line
              x1={x(tk.pos)}
              x2={x(tk.pos)}
              y1={AXIS_Y}
              y2={AXIS_Y + 5}
              stroke="var(--color-grid)"
            />
            <text
              x={x(tk.pos)}
              y={AXIS_Y + 22}
              fontSize="17"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {f0(tk.orig)}
            </text>
          </g>
        ))}
        {outlierIdx.map((val, i) => (
          <line
            key={i}
            x1={x(val)}
            x2={x(val)}
            y1={AXIS_Y + 30}
            y2={AXIS_Y + 44}
            stroke="var(--color-neg)"
            strokeWidth="2.5"
          />
        ))}
        <text x={R} y={H - 8} fontSize="17" textAnchor="end" fill="var(--color-muted)">
          {axisTitle}
        </text>
        <MedianMark x={x(med)} top={TOP - 6} bottom={AXIS_Y} />
        <MeanMark x={x(m)} y={TOP - 20} />
      </svg>
      <MarkerLegend mode={false} />
      <p className="m-0 mt-1 text-xs text-muted">
        <span className="text-neg" aria-hidden="true">
          |
        </span>{' '}
        coral ticks under the axis = values beyond 3 SD
        {t.excluded > 0
          ? ` · n excluded: ${t.excluded} (zero or negative, cannot be logged)`
          : ''}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric
          wrap
          label="Shape"
          value={shape === 'roughly symmetric' ? 'balanced' : 'tail'}
          tone="accent"
          hint={shape}
        />
        <Metric
          wrap
          label="Mean minus median"
          value={r2(gap)}
          hint={`${unit}: ${gapReading}`}
        />
        <Metric
          wrap
          label="Values beyond 3 SD"
          value={String(beyond)}
          tone="neg"
          hint={`of ${v.length} (raw data: ${rawBeyond})`}
        />
      </div>
      <p className="m-0 mt-2 text-sm font-semibold">{caption}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            stop();
            setKind('pocket');
            setLambda(1);
            pageActions.resetSeed();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function LogTransform() {
  return (
    <ClientOnly
      minHeight={620}
      label="Log transform: squash the long right tail of pocket money and see the bell shape appear"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
