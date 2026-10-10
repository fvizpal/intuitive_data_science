import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { MarkerLegend, MeanMark } from '../averages/Markers';
import { histogramCounts, percentileRank } from '../averages/stats';
import { W, f0, f1, pct1, signed1 } from './charts';
import { CLASS_N, SUBJECTS, marksSample } from './data';
import { normalCdf, zScore } from './dist';

const H = 150;
const L = 14;
const R = W - 14;
const TOP = 30;
const AXIS_Y = 112;
const BINS = 25;
const Z_LO = -4;
const Z_HI = 6;

type Subject = (typeof SUBJECTS)[keyof typeof SUBJECTS];
type ShapeName = 'circle' | 'square';

function Shape({
  shape,
  x,
  y,
  r = 8,
}: {
  shape: ShapeName;
  x: number;
  y: number;
  r?: number;
}) {
  return shape === 'circle' ? (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill="var(--color-ink)"
      stroke="var(--color-bg)"
      strokeWidth="2"
    />
  ) : (
    <rect
      x={x - r}
      y={y - r}
      width={2 * r}
      height={2 * r}
      fill="var(--color-ink)"
      stroke="var(--color-bg)"
      strokeWidth="2"
    />
  );
}

function Row({
  subject,
  marks,
  shape,
  value,
  onChange,
}: {
  subject: Subject;
  marks: number[];
  shape: ShapeName;
  value: number;
  onChange: (v: number) => void;
}) {
  const counts = useMemo(() => histogramCounts(marks, 0, 100, BINS), [marks]);
  const top = Math.max(1, ...counts);
  const x = (v: number) => L + (Math.min(100, Math.max(0, v)) / 100) * (R - L);
  const barW = (R - L) / BINS;
  const z = zScore(value, subject.mean, subject.sd);
  const beat = percentileRank(marks, value);
  const bell = normalCdf(value, subject.mean, subject.sd);
  const ticks = [0, 20, 40, 60, 80, 100];
  return (
    <div className="mt-4 first:mt-0">
      <h4 className="m-0 mb-1 flex items-center gap-2 text-sm font-semibold">
        <svg width="16" height="16" aria-hidden="true">
          <Shape shape={shape} x={8} y={8} r={6} />
        </svg>
        {subject.name}: class average {subject.mean}, SD {subject.sd}
      </h4>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`${subject.name} marks of ${marks.length} students, average ${subject.mean}. A mark of ${f0(value)} is marked.`}
      >
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
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={AXIS_Y + 20}
            fontSize="17"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        ))}
        <MeanMark x={x(subject.mean)} y={TOP - 18} />
        <line
          x1={x(value)}
          x2={x(value)}
          y1={TOP + 6}
          y2={AXIS_Y}
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeDasharray="5 3"
        />
        <Shape shape={shape} x={x(value)} y={AXIS_Y} />
        <text x={R} y={14} fontSize="17" textAnchor="end" fill="var(--color-muted)">
          students per bar · marks out of 100
        </text>
      </svg>
      <Slider
        label={`${subject.name} mark`}
        value={value}
        min={0}
        max={100}
        step={1}
        onChange={onChange}
        format={f0}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
        <Metric
          wrap
          label="z-score"
          value={z === null ? '—' : signed1(z)}
          tone="accent"
          hint={
            z === null
              ? 'No spread, so no z-score'
              : Math.abs(z) < 0.05
                ? 'exactly the class average'
                : `${f1(Math.abs(z))} SD ${z > 0 ? 'above' : 'below'} the class average`
          }
        />
        <Metric
          wrap
          label="Beat this share of the class"
          value={pct1(beat)}
          hint={`a mark of ${f0(value)} beats ${pct1(beat)} of students (a bell curve says ${pct1(bell)})`}
        />
      </div>
    </div>
  );
}

const PRESETS = [
  { label: 'Ravi and Meena', maths: 85, english: 70 },
  { label: 'Both exactly average', maths: 60, english: 55 },
  { label: 'Same mark, 70 in both', maths: 70, english: 70 },
];

function Inner() {
  const maths = useMemo(
    () =>
      marksSample(SUBJECTS.maths.seed, CLASS_N, SUBJECTS.maths.mean, SUBJECTS.maths.sd),
    [],
  );
  const english = useMemo(
    () =>
      marksSample(
        SUBJECTS.english.seed,
        CLASS_N,
        SUBJECTS.english.mean,
        SUBJECTS.english.sd,
      ),
    [],
  );
  const [m, setM] = useState(PRESETS[0]!.maths);
  const [e, setE] = useState(PRESETS[0]!.english);
  const zm = zScore(m, SUBJECTS.maths.mean, SUBJECTS.maths.sd);
  const ze = zScore(e, SUBJECTS.english.mean, SUBJECTS.english.sd);

  // Shared axis of standard deviations.
  const AH = 104;
  const ax = (z: number) =>
    L + ((Math.min(Z_HI, Math.max(Z_LO, z)) - Z_LO) / (Z_HI - Z_LO)) * (R - L);
  const dots: { label: string; z: number | null; y: number; shape: ShapeName }[] = [
    { label: 'Maths', z: zm, y: 36, shape: 'circle' },
    { label: 'English', z: ze, y: 62, shape: 'square' },
  ];
  const verdict =
    zm === null || ze === null || Math.abs(zm - ze) < 0.1
      ? 'The two marks are equally unusual.'
      : ze > zm
        ? `The English mark of ${f0(e)} is the rarer result.`
        : `The Maths mark of ${f0(m)} is the rarer result.`;
  const summary = `Maths ${f0(m)}: z ${zm === null ? 'not available' : signed1(zm)}. English ${f0(e)}: z ${ze === null ? 'not available' : signed1(ze)}. ${verdict}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            aria-pressed={p.maths === m && p.english === e}
            className={
              p.maths === m && p.english === e ? 'border-accent font-semibold' : ''
            }
            onClick={() => {
              setM(p.maths);
              setE(p.english);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Row
        subject={SUBJECTS.maths}
        marks={maths}
        shape="circle"
        value={m}
        onChange={setM}
      />
      <Row
        subject={SUBJECTS.english}
        marks={english}
        shape="square"
        value={e}
        onChange={setE}
      />
      <MarkerLegend median={false} mode={false} />

      <h4 className="m-0 mb-1 mt-4 text-sm font-semibold">
        Both on one scale: standard deviations from the class average
      </h4>
      <svg
        viewBox={`0 0 ${W} ${AH}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${AH}` }}
        role="img"
        aria-label={`Shared z-score axis. Maths z ${zm === null ? 'n/a' : signed1(zm)}, English z ${ze === null ? 'n/a' : signed1(ze)}`}
      >
        <line x1={L} x2={R} y1={84} y2={84} stroke="var(--color-grid)" />
        {[-3, -2, -1, 0, 1, 2, 3, 4, 5].map((z) => (
          <g key={z}>
            <line
              x1={ax(z)}
              x2={ax(z)}
              y1="22"
              y2="84"
              stroke="var(--color-grid)"
              strokeDasharray={z === 0 ? undefined : '2 4'}
            />
            <text
              x={ax(z)}
              y="102"
              fontSize="17"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {z === 0 ? 'avg' : signed1(z).replace('.0', '')}
            </text>
          </g>
        ))}
        {dots.map(
          (d) =>
            d.z !== null && (
              <g key={d.label}>
                <Shape shape={d.shape} x={ax(d.z)} y={d.y} />
                <text
                  x={ax(d.z) + (ax(d.z) > R - 130 ? -14 : 14)}
                  y={d.y + 6}
                  fontSize="18"
                  fontWeight="600"
                  textAnchor={ax(d.z) > R - 130 ? 'end' : 'start'}
                  fill="var(--color-ink)"
                >
                  {d.label} {signed1(d.z)}
                </text>
              </g>
            ),
        )}
      </svg>
      <p className="m-0 mt-2 text-sm font-semibold">{verdict}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setM(PRESETS[0]!.maths);
            setE(PRESETS[0]!.english);
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

export function ZScoreCompare() {
  return (
    <ClientOnly
      minHeight={900}
      label="Z-score compare: set a Maths mark and an English mark and see both as standard deviations from their class averages"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
