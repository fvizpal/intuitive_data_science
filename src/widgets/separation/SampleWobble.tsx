import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { PAD, W, two } from './charts';
import { createPoolBuilder, POOL_SIZE } from './pool';
import type { PoolData } from './pool';
import { drawSamples, summarize } from './sampling';
import type { SampleResult } from './sampling';

const SIZES = [500, 1000, 2000, 5000] as const;
const DEFAULT_SIZE_INDEX = 1;
const SAMPLES = 40;

type PoolState =
  { status: 'loading' } | { status: 'ready'; pool: PoolData } | { status: 'error' };

// One pool per page load, shared by every mount.
let poolPromise: Promise<PoolData> | null = null;

function loadPool(): Promise<PoolData> {
  if (poolPromise) return poolPromise;
  poolPromise = new Promise<PoolData>((resolve, reject) => {
    const fallback = () => {
      const builder = createPoolBuilder();
      const idle: (cb: () => void) => void =
        typeof requestIdleCallback === 'function'
          ? (cb) => requestIdleCallback(cb)
          : (cb) => setTimeout(cb, 0);
      const tick = () => {
        try {
          if (builder.step()) resolve(builder.result());
          else idle(tick);
        } catch (e) {
          reject(e);
        }
      };
      idle(tick);
    };
    if (typeof Worker === 'undefined') return fallback();
    try {
      const worker = new Worker(new URL('./pool.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<PoolData>) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        fallback();
      };
      worker.postMessage('build');
    } catch {
      fallback();
    }
  });
  poolPromise.catch(() => {
    poolPromise = null;
  });
  return poolPromise;
}

function usePool(): PoolState {
  const [state, setState] = useState<PoolState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadPool().then(
      (pool) => live && setState({ status: 'ready', pool }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

const LO = 0.1;
const HI = 0.9;
const SW = (v: number) =>
  PAD.l +
  8 +
  ((Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * (W - PAD.l - PAD.r - 16);

function Strip({
  title,
  values,
  reference,
}: {
  title: string;
  values: readonly number[];
  reference: number;
}) {
  const s = summarize(values);
  const H = 128;
  const AXIS = 82;
  if (!s) return null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full select-none"
      role="img"
      aria-label={`${title} of ${values.length} samples: from ${two(s.min)} to ${two(s.max)}, mean ${two(s.mean)}; on the data it was built on ${two(reference)}`}
    >
      <text x={PAD.l} y="18" fontSize="22" fontWeight="700" fill="var(--color-ink)">
        {title}
      </text>
      <text x={W - PAD.r} y="18" fontSize="18" textAnchor="end" fill="var(--color-muted)">
        range {two(s.min)} to {two(s.max)} · mean {two(s.mean)}
      </text>
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <g key={t}>
          <line x1={SW(t)} x2={SW(t)} y1="28" y2={AXIS} stroke="var(--color-grid)" />
          <text
            x={SW(t)}
            y={AXIS + 18}
            fontSize="15"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={AXIS} y2={AXIS} stroke="var(--color-grid)" />
      {/* min to max */}
      <line
        x1={SW(s.min)}
        x2={SW(s.max)}
        y1={AXIS - 4}
        y2={AXIS - 4}
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={SW(v)}
          cy={40 + (i % 5) * 7}
          r="5"
          fill="color-mix(in srgb, var(--color-accent) 60%, transparent)"
          stroke="var(--color-accent)"
        />
      ))}
      {/* mean: a diamond, so it is not just another dot */}
      <path
        d={`M${SW(s.mean)} ${AXIS - 18} l7 7 l-7 7 l-7 -7 Z`}
        fill="var(--color-ink)"
      />
      {/* where the score looked on the data it was built on */}
      <line
        x1={SW(reference)}
        x2={SW(reference)}
        y1="26"
        y2={AXIS}
        stroke="var(--color-neg)"
        strokeWidth="2.5"
        strokeDasharray="6 4"
      />
    </svg>
  );
}

function Wobble({ pool }: { pool: PoolData }) {
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const [round, setRound] = useState(0);
  const size = SIZES[sizeIndex]!;

  const badRate = useMemo(() => {
    let bads = 0;
    for (let i = 0; i < pool.flags.length; i++) bads += 1 - pool.flags[i]!;
    return bads / pool.flags.length;
  }, [pool]);

  const samples: SampleResult[] = useMemo(
    () => drawSamples(pool.scores, pool.flags, size, SAMPLES, round + 1),
    [pool, size, round],
  );
  const ginis = samples.map((r) => r.gini);
  const kss = samples.map((r) => r.ks);
  const g = summarize(ginis);
  const aboutBads = Math.round(size * badRate);

  const caption = g
    ? `With about ${aboutBads} defaulters, Gini ranged from ${two(g.min)} to ${two(g.max)}.`
    : 'No samples to show.';

  return (
    <>
      <Strip title="Gini" values={ginis} reference={pool.reference.gini} />
      <Strip title="KS" values={kss} reference={pool.reference.ks} />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="color-mix(in srgb, var(--color-accent) 60%, transparent)"
              stroke="var(--color-accent)"
            />
          </svg>
          one sample
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <path d="M7 0 l7 7 l-7 7 l-7 -7 Z" fill="var(--color-ink)" />
          </svg>
          mean
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="0"
              x2="26"
              y1="4"
              y2="4"
              stroke="var(--color-neg)"
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />
          </svg>
          on the data it was built on
        </li>
      </ul>

      <p className="m-0 mt-3 text-sm font-semibold">{caption}</p>

      <div className="mt-3">
        <Slider
          label="Sample size (applicants)"
          value={sizeIndex}
          min={0}
          max={SIZES.length - 1}
          step={1}
          onChange={setSizeIndex}
          format={(v) => SIZES[Math.round(v)]!.toLocaleString('en-US')}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setRound((r) => r + 1)}>
          Draw {SAMPLES} new samples
        </Button>
        <Button
          onClick={() => {
            setSizeIndex(DEFAULT_SIZE_INDEX);
            setRound(0);
          }}
        >
          Reset
        </Button>
      </div>
      <p className="m-0 mt-3 text-xs text-muted">
        Samples are drawn from one pool of {POOL_SIZE.toLocaleString('en-US')}, so at
        large sizes they overlap and look steadier than truly independent samples would.
      </p>
      <p className="sr-only" role="status">
        {caption} Mean Gini {two(g?.mean)}. On the data it was built on: Gini{' '}
        {two(pool.reference.gini)}, KS {two(pool.reference.ks)}.
      </p>
    </>
  );
}

function Inner() {
  const state = usePool();
  if (state.status === 'ready') return <Wobble pool={state.pool} />;
  if (state.status === 'error')
    return (
      <p className="m-0 text-sm">
        This browser could not build the sample pool. The rest of the page still works.
      </p>
    );
  return (
    <div role="status" aria-label="Building the applicant pool">
      <div className="h-[128px] animate-pulse rounded-md bg-grid" />
      <div className="mt-2 h-[128px] animate-pulse rounded-md bg-grid" />
      <p className="m-0 mt-2 text-xs text-muted">Scoring 20,000 applicants…</p>
    </div>
  );
}

export function SampleWobble() {
  return (
    <ClientOnly
      minHeight={450}
      label="Reality check: draw many samples and see how much Gini and KS wobble"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
