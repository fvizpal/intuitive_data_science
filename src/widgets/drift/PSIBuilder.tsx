import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { BUILD_STROKE, BigPsi, Legend, PAD, Reading, TODAY_FILL, W } from './charts';
import {
  IDEAL_BASE,
  SHIFT_MAX,
  SHIFT_MIN,
  getIdealCurve,
  getIdealEdges,
  slicedPsi,
} from './data';
import { bandInfo, fmtPct1, fmtPsi, sdShort } from './format';
import { PSI_FLOOR, PSI_INVESTIGATE, PSI_SIGNIFICANT, psi, shiftForPsi } from './psi';
import { pageActions, usePage } from './store';

const K = 10;

/** "574 to under 597", "below 574", "706 and up". */
export function sliceLabel(edges: readonly number[], i: number): string {
  const r = (v: number) => Math.round(v);
  if (edges.length === 0) return 'all scores';
  if (i === 0) return `below ${r(edges[0]!)}`;
  if (i === edges.length) return `${r(edges[i - 1]!)} and up`;
  return `${r(edges[i - 1]!)} to under ${r(edges[i]!)}`;
}

function SliceChart({
  edges,
  build,
  today,
  contributions,
  picked,
  onPick,
  swapped,
}: {
  edges: readonly number[];
  build: readonly number[];
  today: readonly number[];
  contributions: readonly number[];
  picked: number;
  onPick: (i: number) => void;
  swapped: boolean;
}) {
  const n = build.length;
  const refs = useRef<(SVGGElement | null)[]>([]);
  const H = 372;
  const top = 12;
  const baseY = 180;
  const cBase = 336;
  const colW = (W - PAD.l - PAD.r) / n;
  const yMax = Math.max(0.2, ...build, ...today) * 1.08;
  const y = (v: number) => baseY - (v / yMax) * (baseY - top);
  const cMax = Math.max(0.01, ...contributions);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : e.key === 'Home'
            ? -n
            : e.key === 'End'
              ? n
              : 0;
    if (!d) return;
    e.preventDefault();
    const j = Math.min(n - 1, Math.max(0, i + d));
    onPick(j);
    refs.current[j]?.focus();
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full select-none"
      role="group"
      aria-label={`Ten slices of the score line. ${swapped ? 'Outlined columns are today and solid columns are build time.' : 'Outlined columns are build time and solid columns are today.'} Use the arrow keys to move between slices.`}
    >
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={y(1 / n)}
        y2={y(1 / n)}
        stroke="var(--color-muted)"
        strokeDasharray="4 4"
      />
      <text
        x={W - PAD.r}
        y={y(1 / n) - 4}
        fontSize="16"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        10% per slice
      </text>
      {build.map((b, i) => {
        const x0 = PAD.l + i * colW;
        const sel = i === picked;
        return (
          <g
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="button"
            tabIndex={sel ? 0 : -1}
            aria-pressed={sel}
            aria-label={`Slice ${i + 1}, scores ${sliceLabel(edges, i)}: ${swapped ? 'today' : 'build time'} ${fmtPct1(b)}, ${swapped ? 'build time' : 'today'} ${fmtPct1(today[i]!)}`}
            style={{ cursor: 'pointer', outlineOffset: -2 }}
            onClick={() => onPick(i)}
            onFocus={() => onPick(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <rect
              x={x0}
              y={top - 4}
              width={colW}
              height={cBase - top + 34}
              fill={sel ? 'var(--color-grid)' : 'transparent'}
              opacity={sel ? 0.6 : 1}
            />
            <rect
              x={x0 + 6}
              y={y(b)}
              width={colW / 2 - 7}
              height={Math.max(0, baseY - y(b))}
              fill="none"
              stroke={BUILD_STROKE}
              strokeWidth="1.5"
            />
            <rect
              x={x0 + colW / 2 + 1}
              y={y(today[i]!)}
              width={colW / 2 - 7}
              height={Math.max(0, baseY - y(today[i]!))}
              fill={TODAY_FILL}
            />
            <text
              x={x0 + colW / 2}
              y={baseY + 18}
              fontSize="15"
              textAnchor="middle"
              fill="var(--color-ink)"
            >
              {i + 1}
            </text>
            <rect
              x={x0 + 8}
              y={cBase - (contributions[i]! / cMax) * 70}
              width={colW - 16}
              height={(contributions[i]! / cMax) * 70}
              fill="var(--color-neg)"
              opacity="0.85"
            />
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={baseY} y2={baseY} stroke="var(--color-grid)" />
      <line x1={PAD.l} x2={W - PAD.r} y1={cBase} y2={cBase} stroke="var(--color-grid)" />
      <text x={PAD.l} y={baseY + 38} fontSize="16" fill="var(--color-muted)">
        slice number, and the score where each slice starts
      </text>
      {edges.map((e, i) => (
        <text
          key={i}
          x={PAD.l + (i + 1) * colW}
          y={baseY + 56}
          fontSize="16"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {Math.round(e)}
        </text>
      ))}
      <text x={PAD.l} y={cBase + 20} fontSize="16" fill="var(--color-muted)">
        what each slice adds to PSI
      </text>
    </svg>
  );
}

const CX = { lo: SHIFT_MIN, hi: SHIFT_MAX };
const CH = { w: W, h: 230, l: 40, r: 14, t: 14, b: 40, yMax: 1.2 };
const cxOf = (s: number) => CH.l + ((s - CX.lo) / (CX.hi - CX.lo)) * (CH.w - CH.l - CH.r);
const cyOf = (v: number) =>
  CH.t + (1 - Math.min(v, CH.yMax) / CH.yMax) * (CH.h - CH.t - CH.b);

function ShiftCurve({ shift }: { shift: number }) {
  const curve = getIdealCurve();
  const edges = getIdealEdges();
  const at = (s: number) => curve[s - SHIFT_MIN]!.psi;
  const s1 = shiftForPsi(PSI_INVESTIGATE, edges, IDEAL_BASE);
  const s2 = shiftForPsi(PSI_SIGNIFICANT, edges, IDEAL_BASE);
  const path = curve
    .map(
      (p, i) => `${i ? 'L' : 'M'}${cxOf(p.shift).toFixed(1)} ${cyOf(p.psi).toFixed(1)}`,
    )
    .join('');
  const theory = curve
    .map(
      (p, i) =>
        `${i ? 'L' : 'M'}${cxOf(p.shift).toFixed(1)} ${cyOf((p.shift / IDEAL_BASE.sd) ** 2).toFixed(1)}`,
    )
    .join('');
  const cur = at(Math.max(SHIFT_MIN, Math.min(SHIFT_MAX, Math.round(shift))));
  const crossings = [s1, s2].flatMap((s) => (s === null ? [] : [-s, s]));
  return (
    <>
      <svg
        viewBox={`0 0 ${CH.w} ${CH.h}`}
        className="mt-1 block w-full select-none"
        role="img"
        aria-label={`PSI against size of shift if only the average moves. PSI reaches ${PSI_INVESTIGATE} at a ${s1?.toFixed(0)} point shift and ${PSI_SIGNIFICANT} at ${s2?.toFixed(0)} points. At the current shift of ${shift} points, PSI is ${fmtPsi(cur)}.`}
      >
        <defs>
          <clipPath id="curve-clip">
            <rect
              x={CH.l}
              y={CH.t}
              width={CH.w - CH.l - CH.r}
              height={CH.h - CH.t - CH.b}
            />
          </clipPath>
        </defs>
        {[0, 0.4, 0.8, 1.2].map((v) => (
          <g key={v}>
            <line
              x1={CH.l}
              x2={CH.w - CH.r}
              y1={cyOf(v)}
              y2={cyOf(v)}
              stroke="var(--color-grid)"
            />
            <text
              x={CH.l - 6}
              y={cyOf(v) + 5}
              fontSize="16"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              {v}
            </text>
          </g>
        ))}
        {[-80, -40, 0, 40, 80].map((s) => (
          <text
            key={s}
            x={cxOf(s)}
            y={CH.h - 18}
            fontSize="16"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {s > 0 ? `+${s}` : s}
          </text>
        ))}
        <text
          x={CH.w - CH.r}
          y={CH.h - 2}
          fontSize="16"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          points the average moved
        </text>
        {[
          { v: PSI_INVESTIGATE, dash: '6 4', label: '0.1 investigate' },
          { v: PSI_SIGNIFICANT, dash: '2 3', label: '0.25 significant shift' },
        ].map((b) => (
          <g key={b.v}>
            <line
              x1={CH.l}
              x2={CH.w - CH.r}
              y1={cyOf(b.v)}
              y2={cyOf(b.v)}
              stroke="var(--color-ink)"
              strokeDasharray={b.dash}
              strokeWidth="1.5"
            />
            <text x={CH.l + 4} y={cyOf(b.v) - 4} fontSize="15" fill="var(--color-ink)">
              {b.label}
            </text>
          </g>
        ))}
        <g clipPath="url(#curve-clip)">
          <path
            d={theory}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="2"
            strokeDasharray="7 5"
          />
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        </g>
        {crossings.map((s) => (
          <circle
            key={s}
            cx={cxOf(s)}
            cy={cyOf(at(Math.round(s)))}
            r="4.5"
            fill="var(--color-bg)"
            stroke="var(--color-ink)"
            strokeWidth="2"
          />
        ))}
        <circle
          cx={cxOf(shift)}
          cy={cyOf(cur)}
          r="8"
          fill="var(--color-accent)"
          stroke="var(--color-bg)"
          strokeWidth="2"
        />
        <text
          x={cxOf(0)}
          y={CH.t + 16}
          fontSize="16"
          textAnchor="middle"
          fill="var(--color-ink)"
        >
          if only the average moves
        </text>
      </svg>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="0"
              x2="26"
              y1="4"
              y2="4"
              stroke="var(--color-accent)"
              strokeWidth="3"
            />
          </svg>
          PSI
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="0"
              x2="26"
              y1="4"
              y2="4"
              stroke="var(--color-muted)"
              strokeWidth="2"
              strokeDasharray="7 5"
            />
          </svg>
          rule of thumb: (shift in standard deviations) squared
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="6" fill="var(--color-accent)" />
          </svg>
          where you are now
        </li>
      </ul>
      <p className="m-0 mt-2 text-sm">
        In this example, PSI reaches 0.1 at about a {s1 === null ? '—' : Math.round(s1)}
        -point shift and 0.25 at about {s2 === null ? '—' : Math.round(s2)} points. In
        standard deviations: about {s1 === null ? '—' : sdShort(s1 / IDEAL_BASE.sd)} and{' '}
        {s2 === null ? '—' : sdShort(s2 / IDEAL_BASE.sd)}.
      </p>
    </>
  );
}

function Builder() {
  const { seed, shift, spreadMult, newSegmentShare } = usePage();
  const [swapped, setSwapped] = useState(false);
  const [pickedRaw, setPicked] = useState<number | null>(null);
  useEffect(() => pageActions.markPsiSeen(), []);

  const sliced = useMemo(
    () => slicedPsi(seed, { shift, spreadMult, newSegmentShare }, 'count', K),
    [seed, shift, spreadMult, newSegmentShare],
  );
  const result = sliced.result;
  const expected = swapped ? sliced.actual : sliced.expected;
  const actual = swapped ? sliced.expected : sliced.actual;
  const shown = useMemo(() => psi(expected, actual), [expected, actual]);
  const contributions = shown?.contributions ?? [];
  const total = shown?.total ?? null;

  const biggest = contributions.reduce(
    (best, c, i) => (c > (contributions[best] ?? -1) ? i : best),
    0,
  );
  const picked =
    pickedRaw !== null && pickedRaw < contributions.length ? pickedRaw : biggest;

  const info = total === null ? null : bandInfo(total);
  const buildName = swapped ? 'Today' : 'Build time';
  const todayName = swapped ? 'Build time' : 'Today';
  const e = expected[picked] ?? 0;
  const a = actual[picked] ?? 0;
  const eF = Math.max(e, PSI_FLOOR);
  const aF = Math.max(a, PSI_FLOOR);
  const c = contributions[picked] ?? 0;
  const worked = `${todayName} ${fmtPct1(a)} vs ${buildName.toLowerCase()} ${fmtPct1(e)}: (${aF.toFixed(3)} − ${eF.toFixed(3)}) × ln(${(aF / eF).toFixed(2)}) = ${c.toFixed(3)}`;

  const isDefault = shift === -20 && spreadMult === 1 && newSegmentShare === 0;
  const summary =
    total === null
      ? 'No data to compare.'
      : `${shift === 0 ? 'Average has not moved' : `Average moved ${Math.abs(shift)} points ${shift < 0 ? 'lower' : 'higher'}`}: PSI ${fmtPsi(total)}, ${info!.label.toLowerCase()}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <BigPsi value={total} />
        <Button aria-pressed={swapped} onClick={() => setSwapped((s) => !s)}>
          Swap build time and today
        </Button>
      </div>
      <p className="m-0 mt-1 text-sm font-semibold">
        {info ? info.reading : 'Nothing to compare yet.'}{' '}
        <span className="font-normal text-muted">
          PSI says how much changed, not whether it is good or bad.
        </span>
      </p>

      <Legend build={buildName} today={todayName} />
      <SliceChart
        edges={sliced.edges}
        build={expected}
        today={actual}
        contributions={contributions}
        picked={picked}
        onPick={setPicked}
        swapped={swapped}
      />

      <p className="m-0 mt-2 rounded-md bg-bg px-3 py-2 text-sm" aria-live="polite">
        <span className="font-semibold">
          Slice {picked + 1} ({sliceLabel(sliced.edges, picked)}).
        </span>{' '}
        {worked}
      </p>

      <div className="mt-4">
        <Slider
          label="How far the average score moved (points)"
          value={shift}
          min={-60}
          max={60}
          step={5}
          onChange={pageActions.setShift}
          format={(v) => (v > 0 ? `+${v}` : String(v))}
        />
      </div>

      <h4 className="mb-0 mt-5 text-sm font-semibold">PSI versus size of shift</h4>
      <ShiftCurve shift={shift} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        <Button
          onClick={() => {
            pageActions.reset();
            setSwapped(false);
            setPicked(null);
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>
        {result === null ? (
          'There is no data to compare.'
        ) : (
          <>
            {isDefault
              ? 'A 20-point drop is a borderline shift, so the middle prediction fits. '
              : `${info!.label}: ${info!.reading.toLowerCase()} `}
            Slice {biggest + 1} changed most: it holds {fmtPct1(actual[biggest] ?? 0)} of{' '}
            {todayName.toLowerCase()}&rsquo;s applicants against{' '}
            {fmtPct1(expected[biggest] ?? 0)} at {buildName.toLowerCase()}.
          </>
        )}
      </Reading>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function PSIBuilder() {
  return (
    <ClientOnly minHeight={890} label="PSI builder: how much each score slice drifted">
      {() => <Builder />}
    </ClientOnly>
  );
}
