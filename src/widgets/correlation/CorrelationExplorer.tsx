import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { describeR, fmt, genCorrelated, pearson } from './corr';
import { PRESETS } from './data';
import { ScatterPlot } from './ScatterPlot';
import type { MarkStyle } from './ScatterPlot';

const N = 60;
const RHO_DEFAULT = 0.6;
const SEED_DEFAULT = 1;
const DOMAIN = [-3.3, 3.3] as const;

export function CorrelationExplorer() {
  const [rho, setRho] = useState(RHO_DEFAULT);
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [presetId, setPresetId] = useState<string | null>(null);

  const points = useMemo(() => genCorrelated(seed, N, rho, { exact: true }), [seed, rho]);
  const r = pearson(
    points.map((p) => p.x),
    points.map((p) => p.y),
  );
  const preset = PRESETS.find((p) => p.id === presetId);
  const tone = r > 0.05 ? 'pos' : r < -0.05 ? 'neg' : 'muted';
  const mark: MarkStyle = {
    color: `var(--color-${tone})`,
    shape: tone === 'pos' ? 'circle' : tone === 'neg' ? 'triangle' : 'square',
  };
  const words = describeR(r);
  const xLabel = preset?.xLabel ?? 'x';
  const yLabel = preset?.yLabel ?? 'y';

  return (
    <div
      role="group"
      aria-label="Correlation explorer: set the correlation and watch the cloud of points change"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <Slider
        label="Correlation"
        value={rho}
        min={-1}
        max={1}
        step={0.05}
        format={(v) => fmt(v)}
        onChange={(v) => {
          setRho(Math.round(v * 20) / 20);
          setPresetId(null);
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            aria-pressed={presetId === p.id}
            className={presetId === p.id ? 'border-accent' : ''}
            onClick={() => {
              setRho(p.rho);
              setPresetId(p.id);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-start">
        <ScatterPlot
          points={points}
          xDomain={DOMAIN}
          yDomain={DOMAIN}
          xLabel={xLabel}
          yLabel={yLabel}
          label={`Scatter of ${N} points, ${yLabel} against ${xLabel}`}
          style={() => mark}
        />
        <Metric label="r" value={fmt(r)} tone={tone} hint={words} large />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setRho(RHO_DEFAULT);
            setSeed(SEED_DEFAULT);
            setPresetId(null);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
      </div>
      <p role="status" className="mb-0 mt-2 text-sm text-muted">
        r = {fmt(r)}: {words}.
      </p>
    </div>
  );
}
