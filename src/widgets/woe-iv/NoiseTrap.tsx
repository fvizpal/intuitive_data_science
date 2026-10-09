import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Slider } from '../../components/ui/Slider';
import { ClientOnly } from './ClientOnly';
import { getLoans, usePage } from './store';
import { IV_THRESHOLDS, ivVsBins } from './woe';

const K_MIN = 2;
const K_MAX = 30;
const K_DEFAULT = 5;
const W = 400;
const H = 264;
const PAD = { l: 42, r: 16, t: 18, b: 44 };

const iv3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—');

function Inner() {
  const { seed } = usePage();
  const [k, setK] = useState(K_DEFAULT);
  const [resample, setResample] = useState(0);
  const dataSeed = resample === 0 ? seed : seed * 1009 + resample;
  const loans = getLoans(dataSeed);

  const lines = useMemo(
    () => ({
      noise: ivVsBins(loans.columns.noise_feature, loans.defaulted, K_MAX),
      bureau: ivVsBins(loans.columns.bureau_score, loans.defaulted, K_MAX),
    }),
    [loans],
  );

  const yMax = Math.max(
    0.2,
    Math.ceil(Math.max(...lines.bureau.map((p) => p.iv)) * 10) / 10 + 0.1,
  );
  const x = (v: number) => PAD.l + ((v - K_MIN) / (K_MAX - K_MIN)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const path = (pts: { k: number; iv: number }[]) =>
    pts
      .map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)},${y(p.iv).toFixed(1)}`)
      .join('');

  const noiseNow = lines.noise.find((p) => p.k === k)!.iv;
  const bureauNow = lines.bureau.find((p) => p.k === k)!.iv;
  const noiseEnd = lines.noise[lines.noise.length - 1]!.iv;
  const looksUseful = noiseNow >= IV_THRESHOLDS.notUseful;
  const ticks = Array.from(
    { length: Math.floor(yMax / 0.2 + 1e-9) + 1 },
    (_, i) => i * 0.2,
  );

  return (
    <>
      <Slider
        label="Number of equal-count bins"
        value={k}
        min={K_MIN}
        max={K_MAX}
        step={1}
        format={(v) => String(Math.round(v))}
        onChange={(v) => setK(Math.round(v))}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label="Information value against number of bins for the random number and for the bureau score"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-grid)"
            />
            <text
              x={PAD.l - 5}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-muted)"
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {[2, 10, 20, 30].map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - PAD.b + 14}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        ))}
        <text
          x={(PAD.l + W - PAD.r) / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--color-muted)"
        >
          number of bins →
        </text>
        <text x={4} y={12} fontSize="11" fill="var(--color-muted)">
          IV ↑
        </text>
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(IV_THRESHOLDS.notUseful)}
          y2={y(IV_THRESHOLDS.notUseful)}
          stroke="var(--color-neg)"
          strokeDasharray="2 3"
        />
        <text
          x={x(15)}
          y={y(IV_THRESHOLDS.notUseful) - 5}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-neg)"
        >
          below 0.02 = “not useful”
        </text>
        <line
          x1={x(k)}
          x2={x(k)}
          y1={PAD.t}
          y2={H - PAD.b}
          stroke="var(--color-ink)"
          strokeOpacity="0.5"
        />

        <path
          d={path(lines.bureau)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
        />
        <path
          d={path(lines.noise)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />

        <circle
          cx={x(k)}
          cy={y(bureauNow)}
          r="5"
          fill="var(--color-accent)"
          stroke="var(--color-bg)"
          strokeWidth="1.5"
        />
        <rect
          x={x(k) - 4.5}
          y={y(noiseNow) - 4.5}
          width="9"
          height="9"
          fill="var(--color-ink)"
          stroke="var(--color-bg)"
          strokeWidth="1.5"
        />

        <text
          x={x(K_MAX) - 4}
          y={y(lines.bureau[lines.bureau.length - 1]!.iv) - 8}
          textAnchor="end"
          fontSize="11"
          fontWeight="600"
          fill="var(--color-accent)"
        >
          ● Bureau score (real signal)
        </text>
        <text
          x={x(K_MAX) - 4}
          y={y(noiseEnd) - 8}
          textAnchor="end"
          fontSize="11"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          ■ Random number (no signal)
        </text>
      </svg>

      <p className="m-0 mt-3 text-sm" role="status">
        With <strong>{k}</strong> bins the random number scores IV{' '}
        <strong>{iv3(noiseNow)}</strong>. It knows nothing.{' '}
        {looksUseful ? (
          <span className="font-semibold text-neg">
            <span aria-hidden="true">⚠ </span>It looks weakly useful but is not.
          </span>
        ) : (
          <span className="font-semibold">
            <span aria-hidden="true">✓ </span>Still below 0.02, correctly “not useful”.
          </span>
        )}
      </p>
      <p className="m-0 mt-1 text-sm text-muted">
        The bureau score scores IV {iv3(bureauNow)} on the same bins: much higher than
        noise.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setResample((r) => r + 1)}>Resample data</Button>
        <Button
          onClick={() => {
            setK(K_DEFAULT);
            setResample(0);
          }}
        >
          Reset
        </Button>
        <span className="self-center text-xs text-muted">
          {resample === 0 ? 'Original sample' : `Resample #${resample}`}
        </span>
      </div>
    </>
  );
}

export function NoiseTrap() {
  return (
    <ClientOnly
      minHeight={560}
      label="Noise trap: information value of a random number and of the bureau score as the number of bins grows"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
