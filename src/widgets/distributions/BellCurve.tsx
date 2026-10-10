import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { normalSample } from '../../lib/datasets';
import { MarkerLegend, MeanMark } from '../averages/Markers';
import { Handle, Hatch, W, f0, pct } from './charts';
import { histogram, normalCdf, normalPdf, shareBetween, shareReading } from './dist';
import { pageActions, usePage } from './store';

const H = 310;
const L = 14;
const R = W - 14;
const TOP = 66;
const AXIS_Y = 234;
const X_MIN = 120;
const X_MAX = 210;
const MEAN_DEFAULT = 165;
const SD_DEFAULT = 7;
const A_DEFAULT = 158;
const B_DEFAULT = 172;
const SAMPLE_N = 1000;
const x = (v: number) => L + ((v - X_MIN) / (X_MAX - X_MIN)) * (R - L);
const fromX = (vx: number) => X_MIN + ((vx - L) / (R - L)) * (X_MAX - X_MIN);
const snap = (v: number) => Math.round(Math.min(X_MAX, Math.max(X_MIN, v)));

function Inner() {
  const { seed } = usePage();
  const [sd, setSd] = useState(SD_DEFAULT);
  const [mean, setMean] = useState(MEAN_DEFAULT);
  const [a, setA] = useState(A_DEFAULT);
  const [b, setB] = useState(B_DEFAULT);
  const [real, setReal] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const hatch = useId();

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const inside = shareBetween(lo, hi, mean, sd);
  const left = normalCdf(lo, mean, sd);
  const right = 1 - normalCdf(hi, mean, sd);

  const peak = normalPdf(mean, mean, sd);
  const plotH = AXIS_Y - TOP;
  const y = (v: number) => AXIS_Y - (normalPdf(v, mean, sd) / peak) * plotH;

  const sample = useMemo(() => normalSample(seed, SAMPLE_N, mean, sd), [seed, mean, sd]);
  const sampleIn = useMemo(
    () => sample.filter((v) => v >= lo && v <= hi).length,
    [sample, lo, hi],
  );
  const bars = useMemo(() => {
    const h = histogram(sample, {
      binWidth: sd / 4,
      min: mean - 5 * sd,
      max: mean + 5 * sd,
    });
    return h ? h.bins : [];
  }, [sample, mean, sd]);

  // Curve and its pieces: one point every 4 viewBox pixels is plenty.
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    for (let px = L; px <= R; px += 4) out.push([px, y(fromX(px))]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mean, sd]);
  const curve = pts
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py.toFixed(1)}`)
    .join(' ');
  const piece = (from: number, to: number) => {
    const f = Math.max(L, x(from));
    const t = Math.min(R, x(to));
    if (!(t > f)) return '';
    const inner = pts.filter(([px]) => px > f && px < t);
    const line = [
      [f, y(fromX(f))] as [number, number],
      ...inner,
      [t, y(fromX(t))] as [number, number],
    ];
    return `M${f} ${AXIS_Y} ${line.map(([px, py]) => `L${px} ${py.toFixed(1)}`).join(' ')} L${t} ${AXIS_Y} Z`;
  };

  const summary = `Mean height ${f0(mean)} cm, SD ${f0(sd)} cm. ${pct(inside)} of men are between ${f0(lo)} and ${f0(hi)} cm tall.`;
  const ticks = [130, 140, 150, 160, 170, 180, 190, 200];

  return (
    <>
      <Slider
        label="Spread (SD, cm): how much heights differ"
        value={sd}
        min={2}
        max={15}
        step={1}
        onChange={setSd}
        format={f0}
      />
      <div className="mt-2">
        <Slider
          label="Center (mean, cm): the average height"
          value={mean}
          min={150}
          max={180}
          step={1}
          onChange={setMean}
          format={f0}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button aria-pressed={sd === 3} onClick={() => setSd(3)}>
          Tight
        </Button>
        <Button aria-pressed={sd === 12} onClick={() => setSd(12)}>
          Wide
        </Button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Bell curve of men's heights with mean ${f0(mean)} cm and SD ${f0(sd)} cm. ${pct(inside)} of men are between ${f0(lo)} and ${f0(hi)} cm tall.`}
      >
        <defs>
          <Hatch id={hatch} />
        </defs>
        <text x="6" y="16" fontSize="17" fill="var(--color-muted)">
          share of men (area under the curve)
        </text>

        {real &&
          bars.map((bar, i) => {
            const h = (bar.count / (SAMPLE_N * (sd / 4)) / peak) * plotH;
            return (
              <rect
                key={i}
                x={x(bar.x0)}
                y={AXIS_Y - h}
                width={Math.max(0, x(bar.x1) - x(bar.x0) - 0.5)}
                height={h}
                fill="var(--color-muted)"
                opacity="0.3"
              />
            );
          })}

        <path d={piece(X_MIN, lo)} fill={`url(#${hatch})`} />
        <path d={piece(hi, X_MAX)} fill={`url(#${hatch})`} />
        <path
          d={piece(lo, hi)}
          fill="color-mix(in srgb, var(--color-accent) 35%, transparent)"
        />
        <path d={curve} fill="none" stroke="var(--color-accent)" strokeWidth="3" />

        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-grid)" />
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={AXIS_Y + 44}
            fontSize="17"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        ))}
        <text x={R} y={H - 4} fontSize="17" textAnchor="end" fill="var(--color-muted)">
          Height (cm)
        </text>

        <line
          x1={x(mean)}
          x2={x(mean)}
          y1={TOP - 2}
          y2={AXIS_Y}
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <MeanMark x={x(mean)} y={TOP - 18} />

        <text x={L + 4} y="38" fontSize="19" fontWeight="600" fill="var(--color-neg)">
          shorter {pct(left)}
        </text>
        <text
          x={R - 4}
          y="38"
          fontSize="19"
          fontWeight="600"
          textAnchor="end"
          fill="var(--color-neg)"
        >
          taller {pct(right)}
        </text>
        <text
          x={Math.min(R - 90, Math.max(L + 90, x((lo + hi) / 2)))}
          y="38"
          fontSize="19"
          fontWeight="700"
          textAnchor="middle"
          fill="var(--color-ink)"
        >
          between {pct(inside)}
        </text>

        <Handle
          svgRef={svgRef}
          x={x(lo)}
          y={AXIS_Y + 14}
          value={lo}
          min={X_MIN}
          max={hi}
          step={1}
          fromX={fromX}
          onChange={(v) => setA(Math.min(snap(v), hi))}
          label="Lower height (cm)"
          valueText={`${f0(lo)} cm`}
        />
        <Handle
          svgRef={svgRef}
          x={x(hi)}
          y={AXIS_Y + 14}
          value={hi}
          min={lo}
          max={X_MAX}
          step={1}
          fromX={fromX}
          onChange={(v) => setB(Math.max(snap(v), lo))}
          label="Upper height (cm)"
          valueText={`${f0(hi)} cm`}
          shape="square"
        />
      </svg>
      <MarkerLegend median={false} mode={false} />
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 rounded-sm"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
            }}
          />
          between the handles
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 rounded-sm border border-neg"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent 0 3px, var(--color-neg) 3px 5px)',
            }}
          />
          tails
        </li>
      </ul>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric
          wrap
          label="Between the handles"
          value={pct(inside)}
          tone="accent"
          hint={shareReading(inside)}
        />
        <Metric
          wrap
          label="Shorter than the left handle"
          value={pct(left)}
          tone="neg"
          hint={shareReading(left)}
        />
        <Metric
          wrap
          label="Taller than the right handle"
          value={pct(right)}
          tone="neg"
          hint={shareReading(right)}
        />
      </div>
      <p className="m-0 mt-2 text-sm font-semibold">
        {lo === hi
          ? 'The handles meet, so the shaded range is empty: 0%.'
          : `${pct(inside)} of men are between ${f0(lo)} and ${f0(hi)} cm tall.`}
      </p>
      {real && (
        <p className="m-0 text-sm">
          In this sample of 1,000 men: {pct(sampleIn / SAMPLE_N)} ({sampleIn} of{' '}
          {SAMPLE_N.toLocaleString('en-US')}). The curve is the smooth version of these
          bars.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle
          label={`Show ${SAMPLE_N.toLocaleString('en-US')} real men`}
          checked={real}
          onChange={setReal}
        />
        <Button
          onClick={() => {
            setSd(SD_DEFAULT);
            setMean(MEAN_DEFAULT);
            setA(A_DEFAULT);
            setB(B_DEFAULT);
            setReal(false);
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

export function BellCurve() {
  return (
    <ClientOnly
      minHeight={640}
      label="Bell curve of heights: change the average and spread, and drag two handles to see what share of men falls between them"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
