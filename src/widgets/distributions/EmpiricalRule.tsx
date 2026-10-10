import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { MarkerLegend, MeanMark } from '../averages/Markers';
import { Handle, Hatch, W, f0, pct1, signed1 } from './charts';
import { normalPdf, shareReading, tailAbove } from './dist';
import { pageActions, usePage } from './store';

const H = 372;
const L = 14;
const R = W - 14;
const TOP = 132;
const AXIS_Y = 282;
const Z_MAX = 4;
/** The class from the page's example. */
const MEAN = 60;
const SD = 10;
const CLASS_SIZE = 1000;
const x = (z: number) => L + ((z + Z_MAX) / (2 * Z_MAX)) * (R - L);
const fromX = (vx: number) => ((vx - L) / (R - L)) * 2 * Z_MAX - Z_MAX;
const PEAK = normalPdf(0, 0, 1);
const y = (z: number) => AXIS_Y - (normalPdf(z, 0, 1) / PEAK) * (AXIS_Y - TOP);

/** Area under the standard bell between z0 and z1, as an SVG path. */
function area(z0: number, z1: number): string {
  if (!(z1 > z0)) return '';
  const pts: string[] = [];
  const steps = Math.max(2, Math.ceil((z1 - z0) / 0.05));
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    pts.push(`L${x(z).toFixed(1)} ${y(z).toFixed(1)}`);
  }
  return `M${x(z0).toFixed(1)} ${AXIS_Y} ${pts.join(' ')} L${x(z1).toFixed(1)} ${AXIS_Y} Z`;
}

const CURVE = (() => {
  const pts: string[] = [];
  for (let z = -Z_MAX; z <= Z_MAX + 1e-9; z += 0.05)
    pts.push(`${pts.length ? 'L' : 'M'}${x(z).toFixed(1)} ${y(z).toFixed(1)}`);
  return pts.join(' ');
})();

/** The rule's round numbers. The exact shares are 68.3%, 95.4% and 99.7%. */
const BAND_LABEL: Record<number, string> = { 1: '68%', 2: '95%', 3: '99.7%' };

const BANDS = [
  { k: 1, fill: 0.34, row: 96 },
  { k: 2, fill: 0.22, row: 66 },
  { k: 3, fill: 0.12, row: 36 },
] as const;

function Inner() {
  const { z } = usePage();
  const [on, setOn] = useState<Record<number, boolean>>({ 1: true, 2: false, 3: false });
  const svgRef = useRef<SVGSVGElement>(null);
  const hatch = useId();

  const expected3 = Math.round(2 * tailAbove(3) * CLASS_SIZE);

  const higherThan = 1 - tailAbove(z);
  const tail = tailAbove(z);
  const mark = Math.round(MEAN + z * SD);
  const zText = `${signed1(z)} SD`;
  const line1 = `Higher than ${pct1(higherThan)} of students`;
  const line2 = `${tail < 0.5 ? 'Only ' : ''}${pct1(tail)} of students score higher: ${shareReading(tail)}`;
  const summary = `A mark of ${mark} is ${zText} from the class average of ${MEAN}. ${line1}. ${line2}.`;

  const toggle = (k: number) => {
    pageActions.touch();
    setOn((o) => ({ ...o, [k]: !o[k] }));
  };

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Bell curve of class marks, average ${MEAN}, SD ${SD}, with a marker at a mark of ${mark} (${zText}). ${line1}. ${line2}.`}
      >
        <defs>
          <Hatch id={hatch} />
        </defs>
        {[...BANDS]
          .reverse()
          .map(
            (b) =>
              on[b.k] && (
                <path
                  key={b.k}
                  d={area(-b.k, b.k)}
                  fill={`color-mix(in srgb, var(--color-accent) ${b.fill * 100}%, transparent)`}
                />
              ),
          )}
        <path d={area(z, Z_MAX)} fill={`url(#${hatch})`} />
        <path d={CURVE} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-grid)" />

        {BANDS.map(
          (b) =>
            on[b.k] && (
              <g key={b.k}>
                <line
                  x1={x(-b.k)}
                  x2={x(b.k)}
                  y1={b.row}
                  y2={b.row}
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                />
                <line
                  x1={x(-b.k)}
                  x2={x(-b.k)}
                  y1={b.row - 5}
                  y2={b.row + 5}
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                />
                <line
                  x1={x(b.k)}
                  x2={x(b.k)}
                  y1={b.row - 5}
                  y2={b.row + 5}
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                />
                <text
                  x={x(0)}
                  y={b.row - 7}
                  textAnchor="middle"
                  fontSize="19"
                  fontWeight="700"
                  fill="var(--color-ink)"
                >
                  {BAND_LABEL[b.k]} within {b.k} SD
                </text>
              </g>
            ),
        )}

        {[-3, -2, -1, 0, 1, 2, 3].map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={AXIS_Y}
              y2={AXIS_Y + 5}
              stroke="var(--color-grid)"
            />
            <text
              x={x(t)}
              y={AXIS_Y + 44}
              fontSize="17"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {t === 0 ? 'mean' : signed1(t).replace('.0', '')}
            </text>
            {
              <text
                x={x(t)}
                y={AXIS_Y + 64}
                fontSize="17"
                textAnchor="middle"
                fill="var(--color-ink)"
              >
                {f0(MEAN + t * SD)}
              </text>
            }
          </g>
        ))}
        <text x={L + 2} y={H - 6} fontSize="17" fill="var(--color-muted)">
          top: SDs from the average · bottom: marks
        </text>

        <MeanMark x={x(0)} y={TOP - 22} />
        <Handle
          svgRef={svgRef}
          x={x(z)}
          y={AXIS_Y + 14}
          value={z}
          min={-Z_MAX}
          max={Z_MAX}
          step={0.1}
          fromX={fromX}
          onChange={(v) => pageActions.setZ(v)}
          label="A student's mark"
          valueText={`${mark} marks, ${zText}`}
        />
        <line
          x1={x(z)}
          x2={x(z)}
          y1={y(z)}
          y2={AXIS_Y + 4}
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
      <MarkerLegend median={false} mode={false} />

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Bands to show">
        {BANDS.map((b) => (
          <Button
            key={b.k}
            aria-pressed={on[b.k]}
            className={on[b.k] ? 'border-accent font-semibold' : ''}
            onClick={() => toggle(b.k)}
          >
            {b.k} SD band
          </Button>
        ))}
      </div>

      <div className="mt-3">
        <Slider
          label="A student's mark"
          value={MEAN + z * SD}
          min={MEAN - Z_MAX * SD}
          max={MEAN + Z_MAX * SD}
          step={1}
          onChange={(m) => pageActions.setZ((m - MEAN) / SD)}
          format={(m) => `${f0(m)} marks`}
        />
      </div>
      <p className="m-0 mt-2 text-base font-semibold">{line1}</p>
      <p className="m-0 text-base font-semibold">{line2}</p>
      <p className="m-0 text-sm text-muted">
        A mark of {mark} is {zText} from the class average of {MEAN}.
      </p>
      <p className="m-0 mt-2 text-xs text-muted">
        In a class of {CLASS_SIZE.toLocaleString('en-US')} students, about {expected3}{' '}
        land beyond 3 SD (above {MEAN + 3 * SD} or below {MEAN - 3 * SD}) even if marks
        are perfectly bell-shaped.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setOn({ 1: true, 2: false, 3: false });
            pageActions.resetZ();
          }}
        >
          Reset
        </Button>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function EmpiricalRule() {
  return (
    <ClientOnly
      minHeight={560}
      label="68-95-99.7 rule: show bands at 1, 2 and 3 standard deviations and drag a student's mark to see how unusual it is"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
