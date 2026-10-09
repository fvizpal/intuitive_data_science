import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { fmt, pearson, rank, spearman } from './corr';
import type { Pair } from './corr';
import { DATASETS, pvsDataset } from './data';
import type { DatasetId } from './data';
import { ScatterPlot } from './ScatterPlot';
import type { MarkStyle } from './ScatterPlot';

const SEED_DEFAULT = 1;
const EASE = 0.15;
/** Display space is [0, 1] with a small margin. */
const DOMAIN = [-0.06, 1.06] as const;

const CAPTIONS: Record<DatasetId, string> = {
  linear: 'A straight-line pattern: Pearson and Spearman agree.',
  curved:
    'Always rising, so the order is perfect and Spearman is 1.00. Pearson is lower because the points do not sit on a straight line.',
  ushape:
    'A perfect pattern, yet both measures say about 0: it goes down, then up, and correlation only catches one-directional patterns.',
  outlier:
    'One point created a strong Pearson correlation out of pure noise. In ranks, it is just one step above the rest.',
};

const RANK_CAPTIONS: Partial<Record<DatasetId, string>> = {
  curved:
    'In ranks the curve straightens into a perfect diagonal. That is all Spearman sees.',
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function bounds(v: readonly number[]): [number, number] {
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
}

const POINT: MarkStyle = { color: 'var(--color-accent)', shape: 'circle' };
const OUTLIER: MarkStyle = {
  color: 'var(--color-accent)',
  shape: 'square',
  hollow: true,
};

export function PearsonVsSpearman() {
  const [id, setId] = useState<DatasetId>('curved');
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [edited, setEdited] = useState<Pair[] | null>(null);
  const [showRanks, setShowRanks] = useState(false);
  const [animT, setT] = useState(0);
  const tRef = useRef(0);
  // Reduced motion: jump straight to the final state instead of animating.
  const t = prefersReducedMotion() ? (showRanks ? 1 : 0) : animT;

  const original = useMemo(() => pvsDataset(id, seed), [id, seed]);
  const values = edited ?? original;
  // Fixed value bounds per dataset, so dragging never rescales the axes.
  const xb = useMemo(() => bounds(original.map((p) => p.x)), [original]);
  const yb = useMemo(() => bounds(original.map((p) => p.y)), [original]);

  const xs = values.map((p) => p.x);
  const ys = values.map((p) => p.y);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);

  const display = useMemo(() => {
    const rx = rank(xs);
    const ry = rank(ys);
    const n1 = Math.max(1, values.length - 1);
    return values.map((p, i) => {
      const vx = (p.x - xb[0]) / (xb[1] - xb[0]);
      const vy = (p.y - yb[0]) / (yb[1] - yb[0]);
      const kx = (rx[i]! - 1) / n1;
      const ky = (ry[i]! - 1) / n1;
      return { x: vx + (kx - vx) * t, y: vy + (ky - vy) * t };
    });
    // xs and ys derive from values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, xb, yb, t]);

  // Ease toward value (0) or rank (1) positions.
  useEffect(() => {
    const target = showRanks ? 1 : 0;
    if (prefersReducedMotion()) {
      tRef.current = target;
      return;
    }
    let raf = 0;
    const tick = () => {
      const next = tRef.current + (target - tRef.current) * EASE;
      tRef.current = Math.abs(target - next) < 0.002 ? target : next;
      setT(tRef.current);
      if (tRef.current !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showRanks]);

  const canDrag = !showRanks && t === 0;
  const onDrag = (i: number, nx: number, ny: number) => {
    const x = xb[0] + nx * (xb[1] - xb[0]);
    const y = yb[0] + ny * (yb[1] - yb[0]);
    setEdited(values.map((p, j) => (j === i ? { x, y } : p)));
  };

  const pick = (next: DatasetId) => {
    setId(next);
    setEdited(null);
  };

  const caption = edited
    ? 'You moved a point. Pearson reacts to how far points sit; Spearman only to whether their order changed.'
    : (showRanks && RANK_CAPTIONS[id]) || CAPTIONS[id];
  const label = DATASETS.find((d) => d.id === id)?.label ?? '';

  return (
    <div
      role="group"
      aria-label="Pearson versus Spearman: switch datasets and view the points as values or as ranks"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dataset">
        {DATASETS.map((d) => (
          <Button
            key={d.id}
            role="radio"
            aria-checked={id === d.id}
            className={id === d.id ? 'border-accent font-semibold' : ''}
            onClick={() => pick(d.id)}
          >
            {d.label}
          </Button>
        ))}
      </div>
      <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showRanks}
          onChange={(e) => setShowRanks(e.target.checked)}
          className="size-5 accent-accent"
        />
        Show ranks instead of values
      </label>

      <div className="mt-2">
        <ScatterPlot
          points={display}
          xDomain={DOMAIN}
          yDomain={DOMAIN}
          xLabel={showRanks ? 'rank of x' : 'x'}
          yLabel={showRanks ? 'rank of y' : 'y'}
          label={`${label} dataset, shown as ${showRanks ? 'ranks' : 'values'}`}
          style={(i) => (id === 'outlier' && i === values.length - 1 ? OUTLIER : POINT)}
          radius={5.5}
          onDrag={canDrag ? onDrag : undefined}
        />
      </div>
      <p className="m-0 min-h-5 text-xs text-muted">
        {canDrag
          ? 'Drag any point and watch both numbers.'
          : 'Dragging is off in rank mode. Untick “Show ranks” to drag.'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Pearson r (values)" value={fmt(r)} tone="accent" />
        <Metric label="Spearman ρ (order)" value={fmt(rho)} />
      </div>
      <p className="mb-0 mt-3 min-h-16 text-sm">{caption}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setId('curved');
            setSeed(SEED_DEFAULT);
            setEdited(null);
            setShowRanks(false);
          }}
        >
          Reset
        </Button>
        <Button
          onClick={() => {
            setSeed((s) => s + 1);
            setEdited(null);
          }}
        >
          Reshuffle data
        </Button>
      </div>
      <p role="status" className="sr-only">
        {label}: Pearson {fmt(r)}, Spearman {fmt(rho)}.
      </p>
    </div>
  );
}
