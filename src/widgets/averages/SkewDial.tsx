import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { f0, f1, listNumbers } from './data';
import { MeanMark, MedianMark, MarkerLegend, ModeStar } from './Markers';
import { AXIS_MAX, BINS, SKEW_MAX, SKEW_MIN, skewName, skewSample } from './skewdata';
import type { SkewKind } from './skewdata';
import { ticks } from './stacking';
import {
  histogramCounts,
  histogramPeaks,
  mean,
  median,
  modes,
  skewLabel,
  skewness,
} from './stats';

const W = 400;
const H = 210;
const L = 14;
const R = W - 14;
const AXIS_Y = H - 40;
const TOP = 30;
const SEED_DEFAULT = 2;
const SKEW_DEFAULT = 0.6;
const r2 = (v: number) => Math.round(v * 100) / 100;
const x = (v: number) => r2(L + (v / AXIS_MAX) * (R - L));

type PresetId = 'scores' | 'loans' | 'dpd' | 'bimodal';

const PRESETS: {
  id: PresetId;
  label: string;
  kind: SkewKind;
  skew: number;
  unit: string;
}[] = [
  {
    id: 'scores',
    label: 'Test scores',
    kind: 'blend',
    skew: 0,
    unit: 'Marks (out of 100)',
  },
  {
    id: 'loans',
    label: 'Loan amounts',
    kind: 'blend',
    skew: 0.6,
    unit: 'Loan amount (₹ lakh)',
  },
  { id: 'dpd', label: 'Days past due', kind: 'dpd', skew: 0, unit: 'Max days past due' },
  {
    id: 'bimodal',
    label: 'Bimodal: two kinds of customers',
    kind: 'bimodal',
    skew: 0,
    unit: 'Monthly spend (₹ thousand)',
  },
];

function Inner() {
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [kind, setKind] = useState<SkewKind>('blend');
  const [skew, setSkew] = useState(SKEW_DEFAULT);
  const [preset, setPreset] = useState<PresetId | null>('loans');

  const values = useMemo(() => skewSample(kind, skew, seed), [kind, skew, seed]);
  const counts = useMemo(() => histogramCounts(values, 0, AXIS_MAX, BINS), [values]);
  const maxCount = Math.max(...counts);
  const m = mean(values);
  const med = median(values);
  const sk = skewness(values);
  const label = skewLabel(sk);
  const peaks = useMemo(() => histogramPeaks(counts), [counts]);
  const modeValues = useMemo(
    () =>
      kind === 'dpd' ? modes(values) : peaks.map((p) => ((p + 0.5) * AXIS_MAX) / BINS),
    [kind, values, peaks],
  );
  const twoPeaks = peaks.length >= 2;
  const nearMean = values.filter((v) => Math.abs(v - m) <= 4).length / values.length;
  const gap = m - med;
  const unit = PRESETS.find((p) => p.id === preset)?.unit ?? 'Value';

  const reading = twoPeaks
    ? `Two peaks. The mean (${f1(m)}) and median (${f1(med)}) both land between them, where ${nearMean * 100 < 1 ? 'almost no customers' : `only ${f0(nearMean * 100)}% of customers`} actually are.`
    : label === 'roughly symmetric'
      ? `Mean and median are about equal (gap ${f1(Math.abs(gap))}): ${label}.`
      : `Mean is ${f1(Math.abs(gap))} ${gap > 0 ? 'above' : 'below'} the median: ${label}.`;
  const modeText = modeValues.length
    ? listNumbers(modeValues.map((v) => Math.round(v)))
    : 'None';
  const summary = `${reading} Mean ${f1(m)}, median ${f1(med)}, ${modeValues.length > 1 ? 'peaks' : 'peak'} at ${modeText}.`;

  const choose = (p: (typeof PRESETS)[number]) => {
    setPreset(p.id);
    setKind(p.kind);
    setSkew(p.skew);
  };

  const barW = (R - L) / BINS;
  const bandH = AXIS_Y - TOP;

  return (
    <>
      <Slider
        label={`Skew: ${skewName(skew)}`}
        value={skew}
        min={SKEW_MIN}
        max={SKEW_MAX}
        step={0.05}
        format={(v) => (Math.abs(v) < 0.025 ? '0.0' : f1(v))}
        onChange={(v) => {
          setSkew(Math.round(v * 20) / 20);
          setKind('blend');
          setPreset(null);
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            aria-pressed={preset === p.id}
            className={preset === p.id ? 'border-accent font-semibold' : ''}
            onClick={() => choose(p)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <p className="m-0 mb-1 mt-3 text-xs text-muted">
        {unit}. {values.length} values, grouped into {BINS} bars.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${values.length} values: ${label}. Mean ${f1(m)}, median ${f1(med)}.`}
      >
        {counts.map((c, i) => {
          const h = maxCount ? (c / maxCount) * (bandH - 8) : 0;
          return (
            <rect
              key={i}
              x={r2(L + i * barW + 1)}
              y={r2(AXIS_Y - h)}
              width={r2(barW - 2)}
              height={r2(h)}
              fill="var(--color-muted)"
              fillOpacity="0.45"
              stroke="var(--color-muted)"
              strokeOpacity="0.7"
            />
          );
        })}
        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-ink)" />
        {ticks(0, AXIS_MAX, 20).map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={AXIS_Y}
              y2={AXIS_Y + 4}
              stroke="var(--color-ink)"
            />
            <text
              x={x(t)}
              y={AXIS_Y + 28}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-muted)"
            >
              {t}
            </text>
          </g>
        ))}
        <MedianMark x={x(med)} top={TOP - 8} bottom={AXIS_Y} />
        {modeValues.map((v) => {
          const bin = Math.min(BINS - 1, Math.floor((v / AXIS_MAX) * BINS));
          const h = maxCount ? ((counts[bin] as number) / maxCount) * (bandH - 8) : 0;
          return <ModeStar key={v} x={x(v)} y={Math.max(14, AXIS_Y - h - 12)} />;
        })}
        <MeanMark x={x(m)} y={AXIS_Y + 3} />
      </svg>
      <MarkerLegend />

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        {reading}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Metric label="▲ Mean" value={f1(m)} tone="accent" hint="follows the tail" />
        <Metric label="◆ Median" value={f1(med)} hint="stays with the crowd" />
        <Metric
          label={`★ Mode${modeValues.length > 1 ? 's (peaks)' : ''}`}
          value={modeText}
          hint={kind === 'dpd' ? 'the most common value' : 'where the tallest bar is'}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSeed(SEED_DEFAULT);
            setKind('blend');
            setSkew(SKEW_DEFAULT);
            setPreset('loans');
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle</Button>
      </div>
      <p role="status" className="sr-only">
        {summary}
      </p>
    </>
  );
}

export function SkewDial() {
  return (
    <ClientOnly
      minHeight={760}
      label="Skew dial: reshape a histogram and watch the mean, median and mode"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
