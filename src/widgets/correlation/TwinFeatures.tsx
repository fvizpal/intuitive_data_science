import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { bootstrap, fmt, ols1, ols2, pearson, std } from './corr';
import { twinData } from './data';
import { pixelScale } from './ScatterPlot';

const SIM_DEFAULT = 0.98;
const HISTORY = 20;
const SEED_DEFAULT = 1;
const B_MIN = -3;
const B_MAX = 4;
const UNSTABLE_SD = 0.25;

interface Fit {
  b1: number;
  b2: number;
}

const clampB = (b: number) => Math.min(B_MAX, Math.max(B_MIN, b));
/** Position along the bar track, in percent. */
const pct = (b: number) => ((clampB(b) - B_MIN) / (B_MAX - B_MIN)) * 100;

function BetaBar({
  name,
  caption,
  value,
  truth,
  dashed,
}: {
  name: string;
  caption: string;
  value: number;
  /** The credit this feature truly deserves; drawn as a tick. */
  truth: number;
  dashed?: boolean;
}) {
  const zero = pct(0);
  const end = pct(value);
  return (
    <div className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className="leading-tight">
        <span className="font-mono font-semibold">{name}</span>
        <span className="block text-xs text-muted">{caption}</span>
      </span>
      <div className="relative h-5 rounded-sm bg-bg">
        <div
          className={`absolute top-0.5 bottom-0.5 rounded-sm transition-[left,width] duration-300 ease-out ${
            dashed ? 'border-2 border-dashed border-ink' : 'bg-accent'
          }`}
          style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-ink"
          style={{ left: `${zero}%` }}
        />
        <div
          className="absolute -top-1 -bottom-1 w-0.5 bg-good"
          style={{ left: `${pct(truth)}%` }}
          title="True credit"
        />
      </div>
      <span className="text-right font-mono tabular-nums">{fmt(value)}</span>
    </div>
  );
}

function HistoryChart({ fits, first }: { fits: Fit[]; first: number }) {
  const W = 400;
  const H = 150;
  const pad = { l: 28, r: 8, t: 8, b: 22 };
  const sx = pixelScale([0, HISTORY - 1], [pad.l, W - pad.r]);
  const sy = pixelScale([B_MIN, B_MAX], [H - pad.b, pad.t]);
  const line = (f: (fit: Fit) => number) =>
    fits.map((fit, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(clampB(f(fit)))}`).join('');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Beta estimates over the last ${fits.length} retrains`}
    >
      {[-2, 0, 2, 4].map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={sy(v)}
            y2={sy(v)}
            stroke="var(--color-grid)"
          />
          <text
            x={pad.l - 4}
            y={sy(v) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--color-muted)"
          >
            {v}
          </text>
        </g>
      ))}
      <text
        x={W - pad.r}
        y={H - 6}
        textAnchor="end"
        fontSize="11"
        fill="var(--color-muted)"
      >
        retrain {first + fits.length - 1} →
      </text>
      <path
        d={line((f) => f.b1 + f.b2)}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth="2"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      <path
        d={line((f) => f.b2)}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <path
        d={line((f) => f.b1)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
      />
      {fits.map((f, i) => (
        <g key={i}>
          <circle cx={sx(i)} cy={sy(clampB(f.b1))} r="3" fill="var(--color-accent)" />
          <rect
            x={sx(i) - 2.5}
            y={sy(clampB(f.b2)) - 2.5}
            width="5"
            height="5"
            fill="var(--color-ink)"
          />
        </g>
      ))}
    </svg>
  );
}

export function TwinFeatures() {
  const [sim, setSim] = useState(SIM_DEFAULT);
  const [count, setCount] = useState(HISTORY);
  const [dropped, setDropped] = useState(false);
  const [seed, setSeed] = useState(SEED_DEFAULT);

  const data = useMemo(() => twinData(seed, sim), [seed, sim]);
  const first = Math.max(1, count - HISTORY + 1);
  const fits = useMemo(() => {
    const idx = data.y.map((_, i) => i);
    const out: Fit[] = [];
    for (let k = first; k <= count; k++) {
      const b = bootstrap(idx, seed * 100_003 + k);
      const x1 = b.map((i) => data.x1[i]!);
      const y = b.map((i) => data.y[i]!);
      if (dropped) {
        out.push({ b1: ols1(x1, y), b2: 0 });
      } else {
        const f = ols2(
          x1,
          b.map((i) => data.x2[i]!),
          y,
        );
        out.push({ b1: f.beta1, b2: f.beta2 });
      }
    }
    return out;
  }, [data, first, count, dropped, seed]);

  const latest = fits[fits.length - 1] ?? { b1: 0, b2: 0 };
  const r12 = pearson(data.x1, data.x2);
  const spread = std(fits.map((f) => f.b1));
  const sumSpread = std(fits.map((f) => f.b1 + f.b2));
  const status = dropped
    ? 'x2 dropped: β1 settles near 1 and x1 gets all the credit.'
    : spread > UNSTABLE_SD
      ? 'Betas are unstable: the model cannot decide who deserves the credit.'
      : 'Betas are calm: each feature brings its own information.';

  return (
    <div
      role="group"
      aria-label="Twin features: retrain a two-feature regression and watch the coefficients"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <Slider
        label="How similar are x1 and x2"
        value={sim}
        min={0}
        max={0.999}
        step={0.001}
        format={(v) => v.toFixed(3)}
        onChange={setSim}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setCount((c) => c + 1)}>
          Retrain on a new sample
        </Button>
        <Toggle label="Drop x2" checked={dropped} onChange={setDropped} />
      </div>

      <p className="mb-1 mt-3 text-sm">
        <strong>Credit the model gives each feature</strong> (β). The green tick marks the
        true credit: x1 deserves all of it (1), x2 none (0).
      </p>
      <div className="flex flex-col gap-2">
        <BetaBar name="β1" caption="credit to x1" value={latest.b1} truth={1} />
        <BetaBar name="β2" caption="credit to x2" value={latest.b2} truth={0} dashed />
      </div>

      <div className="mt-3">
        <HistoryChart fits={fits} first={first} />
        <p className="m-0 flex flex-wrap gap-x-4 text-xs text-muted">
          <span>
            <span className="text-accent">●━</span> β1 (credit to x1)
          </span>
          <span>■ ╌ β2 (credit to x2)</span>
          <span>··· β1 + β2 (total credit)</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Similarity of x1, x2" value={fmt(r12, 3)} />
        <Metric
          label="β1 wobble"
          value={fmt(spread)}
          tone={spread > UNSTABLE_SD ? 'neg' : 'ink'}
        />
        <Metric
          label="Total credit (β1 + β2)"
          value={fmt(latest.b1 + latest.b2)}
          tone="accent"
        />
        <Metric label="Total wobble" value={fmt(sumSpread)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSim(SIM_DEFAULT);
            setCount(HISTORY);
            setDropped(false);
            setSeed(SEED_DEFAULT);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
      </div>
      <p role="status" className="mb-0 mt-2 min-h-10 text-sm font-semibold">
        <span aria-hidden="true">{!dropped && spread > UNSTABLE_SD ? '⚠ ' : '● '}</span>
        {status}
        <span className="font-normal text-muted">
          {' '}
          Latest fit: β1 {fmt(latest.b1)}, β2 {fmt(latest.b2)}, sum{' '}
          {fmt(latest.b1 + latest.b2)}.
        </span>
      </p>
    </div>
  );
}
