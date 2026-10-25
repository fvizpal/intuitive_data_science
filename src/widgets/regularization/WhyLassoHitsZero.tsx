import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import {
  contourEllipse,
  errorLevel,
  lassoZeros,
  regionBoundary,
  regionRadius,
  sigmaOf,
  solve2D,
  type Pt,
} from './geometry';
import { Card, Label, LegendRow, Reading, fmtCoef, fmtLam, r1 } from './charts';
import type { Method } from './wide';

const LO = -1;
const HI = 3.5;
const W = 520;
const H = 470;
const L = 66;
const T = 18;
const S = 396; // plot side, equal scale on both axes
const x = (v: number) => L + ((v - LO) / (HI - LO)) * S;
const y = (v: number) => T + ((HI - v) / (HI - LO)) * S;
const DEFAULT_B: Pt = [2, 1];
const clampB = (v: number) => Math.max(LO, Math.min(HI, Math.round(v * 100) / 100));

const METHODS = [
  { value: 'ridge', label: 'Ridge' },
  { value: 'lasso', label: 'Lasso' },
] as const;
const RELATIONS = [
  { value: '0', label: 'Unrelated features (0)' },
  { value: '0.9', label: 'Overlapping (0.9)' },
  { value: '0.99', label: 'Twin features (0.99)' },
] as const;
type Rel = (typeof RELATIONS)[number]['value'];
const REL_NAME: Record<Rel, string> = {
  '0': 'Unrelated features',
  '0.9': 'Overlapping features',
  '0.99': 'Twin features',
};

/** A rectangle covering grid cells [i0, i1) in row j, as an SVG path. */
const cell = (i0: number, i1: number, j: number, step: number) => {
  const xa = r1(x(LO + i0 * step));
  const xb = r1(x(LO + i1 * step));
  const ya = r1(y(LO + (j + 1) * step));
  const yb = r1(y(LO + j * step));
  return `M${xa} ${ya}H${xb}V${yb}H${xa}Z`;
};

const path = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${r1(x(p[0]))} ${r1(y(p[1]))}`).join('') + 'Z';

export interface Plane {
  solution: Pt;
  kept: number;
  text: string;
}

/** The solution and a plain reading for one setting. */
export function describePlane(rel: Rel, method: Method, lambda: number, b: Pt): Plane {
  const solution = solve2D(sigmaOf(Number(rel)), b, lambda, method);
  const kept = solution.filter((v) => v !== 0).length;
  const f = (v: number) => (v === 0 ? '0' : fmtCoef(v));
  const w = `(${f(solution[0])}, ${f(solution[1])})`;
  const lam = fmtLam(lambda);
  const twin = rel === '0.99';
  let text: string;
  if (lambda === 0) {
    text = `Penalty 0: the dot sits on the least-squares point, weights ${w}.`;
  } else if (kept === 0) {
    text = `${REL_NAME[rel]}, ${method} at penalty ${lam}: the penalty removed both features.`;
  } else if (method === 'ridge') {
    text = twin
      ? `${REL_NAME[rel]}, penalty ${lam}: ridge shares the weight ${w}. Neither twin reaches zero.`
      : `${REL_NAME[rel]}, ridge at penalty ${lam}: both weights shrink to ${w}. Neither reaches zero. Ridge has no zero zone: drag the handle anywhere and no weight lands on 0.`;
  } else if (kept === 1) {
    const out = solution[0] === 0 ? 1 : 2;
    text = twin
      ? `${REL_NAME[rel]}, penalty ${lam}: lasso keeps one twin ${w}. Move the least-squares point and the surviving twin flips. Which twin lasso keeps is partly chance.`
      : `${REL_NAME[rel]}, lasso at penalty ${lam}: weights ${w}. The handle sits inside the shaded zone for feature ${out}, so the dot lands on the corner of the diamond and feature ${out} is out. Drag the handle out of the zone and its weight comes back.`;
  } else {
    text = `${REL_NAME[rel]}, lasso at penalty ${lam}: both features kept ${w}. The dot is on an edge of the diamond, not a corner.`;
  }
  return { solution, kept, text };
}

function Weight({ label, v }: { label: string; v: number }) {
  return (
    <Card
      label={label}
      value={
        <span className="inline-flex items-center gap-2">
          {fmtCoef(v)}
          {v === 0 && (
            <span
              className="rounded-full border border-ink px-1.5 text-xs font-bold leading-5"
              aria-label="exactly zero"
            >
              0
            </span>
          )}
        </span>
      }
      plain={v === 0 ? 'exactly zero: out of the model' : undefined}
    />
  );
}

function Inner() {
  const [method, setMethod] = useState<Method>('ridge');
  const [rel, setRel] = useState<Rel>('0');
  const [lambda, setLambda] = useState(0);
  const [b, setB] = useState<Pt>(DEFAULT_B);
  const [focus, setFocus] = useState(false);
  const [drag, setDrag] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const sigma = useMemo(() => sigmaOf(Number(rel)), [rel]);
  const plane = useMemo(
    () => describePlane(rel, method, lambda, b),
    [rel, method, lambda, b],
  );
  const sol = plane.solution;
  const geo = useMemo(() => {
    const level0 = errorLevel(sigma, b, [0, 0]);
    const levels = [0.08, 0.22, 0.45, 0.75].map((f) => f * level0);
    const solLevel = errorLevel(sigma, b, sol);
    return {
      contours: levels.map((lv) => path(contourEllipse(sigma, b, lv, 120))),
      solContour: solLevel > 1e-9 ? path(contourEllipse(sigma, b, solLevel, 160)) : null,
      region: path(regionBoundary(method, regionRadius(method, sol), 120)),
      radius: regionRadius(method, sol),
    };
  }, [sigma, b, sol, method]);

  const zones = useMemo(() => {
    if (method !== 'lasso' || lambda <= 0) return null;
    const STEP = 0.125;
    const n = Math.round((HI - LO) / STEP);
    const rows1: string[] = [];
    const rows2: string[] = [];
    for (let j = 0; j < n; j++) {
      let run1 = -1;
      let run2 = -1;
      for (let i = 0; i <= n; i++) {
        const z =
          i < n
            ? lassoZeros(sigma, [LO + (i + 0.5) * STEP, LO + (j + 0.5) * STEP], lambda)
            : [false, false];
        if (z[0] && run1 < 0) run1 = i;
        if (!z[0] && run1 >= 0) {
          rows1.push(cell(run1, i, j, STEP));
          run1 = -1;
        }
        if (z[1] && run2 < 0) run2 = i;
        if (!z[1] && run2 >= 0) {
          rows2.push(cell(run2, i, j, STEP));
          run2 = -1;
        }
      }
    }
    return { f1: rows1.join(''), f2: rows2.join('') };
  }, [method, lambda, sigma]);

  const moveTo = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const vy = ((e.clientY - r.top) / r.height) * H;
    setB([
      clampB(LO + ((vx - L) / S) * (HI - LO)),
      clampB(HI - ((vy - T) / S) * (HI - LO)),
    ]);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.25 : 0.05;
    const d: Pt | null =
      e.key === 'ArrowRight'
        ? [step, 0]
        : e.key === 'ArrowLeft'
          ? [-step, 0]
          : e.key === 'ArrowUp'
            ? [0, step]
            : e.key === 'ArrowDown'
              ? [0, -step]
              : null;
    if (!d) return;
    e.preventDefault();
    setB((p) => [clampB(p[0] + d[0]), clampB(p[1] + d[1])]);
  };

  const budgetLabel = method === 'ridge' ? 'Ridge budget' : 'Lasso budget';
  const summary = `${method === 'ridge' ? 'Ridge' : 'Lasso'}, penalty ${fmtLam(lambda)}: weights ${fmtCoef(sol[0])} and ${fmtCoef(sol[1])}, ${plane.kept} of 2 features kept`;
  const ticks = [-1, 0, 1, 2, 3];
  const rpx = (geo.radius * S) / (HI - LO);
  const labelX = Math.min(Math.max(x(0) + 8, L + 8), L + S - 110);
  const labelY = Math.max(T + 16, y(0) - rpx - 6);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-3 border-b border-grid bg-surface px-3 pb-2 pt-2 sm:-mx-4 sm:px-4">
        <Slider
          label="Penalty strength (lambda)"
          value={lambda}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => setLambda(Math.round(v * 100) / 100)}
          format={(v) => (v === 0 ? 'No penalty' : fmtLam(v))}
        />
        <p className="m-0 mt-1 text-xs text-muted">
          {`${method === 'ridge' ? 'Ridge' : 'Lasso'}: weights (${sol[0] === 0 ? '0' : fmtCoef(sol[0])}, ${sol[1] === 0 ? '0' : fmtCoef(sol[1])}), ${plane.kept} of 2 features kept`}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        <SegmentedControl
          label="Method"
          options={METHODS}
          value={method}
          onChange={(v) => setMethod(v as Method)}
        />
        <SegmentedControl
          label="How the features relate"
          options={RELATIONS}
          value={rel}
          onChange={(v) => setRel(v as Rel)}
        />
      </div>

      <div className="mt-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`Plane of the two weights. ${summary}. Drag the least-squares point, or focus it and use the arrow keys.`}
        >
          <defs>
            <clipPath id="whz-clip">
              <rect x={L} y={T} width={S} height={S} />
            </clipPath>
            <pattern id="whz-h" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect
                width="8"
                height="8"
                fill="color-mix(in srgb, var(--color-accent) 10%, transparent)"
              />
              <path
                d="M0 4H8"
                stroke="var(--color-accent)"
                strokeWidth="1.2"
                opacity="0.7"
              />
            </pattern>
            <pattern id="whz-v" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect
                width="8"
                height="8"
                fill="color-mix(in srgb, var(--color-neg) 10%, transparent)"
              />
              <path
                d="M4 0V8"
                stroke="var(--color-neg)"
                strokeWidth="1.2"
                opacity="0.7"
              />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={T}
                y2={T + S}
                stroke="var(--color-grid)"
                strokeWidth={t === 0 ? 1.8 : 1}
              />
              <line
                x1={L}
                x2={L + S}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-grid)"
                strokeWidth={t === 0 ? 1.8 : 1}
              />
              <text
                x={x(t)}
                y={T + S + 18}
                fontSize="14"
                textAnchor="middle"
                fill="var(--color-muted)"
              >
                {t}
              </text>
              <text
                x={L - 8}
                y={y(t) + 5}
                fontSize="14"
                textAnchor="end"
                fill="var(--color-muted)"
              >
                {t}
              </text>
            </g>
          ))}
          <text
            x={L + S}
            y={T + S + 38}
            fontSize="14"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            weight on feature 1 →
          </text>
          <text x={14} y={T + 4} fontSize="14" fill="var(--color-muted)">
            ↑ weight on feature 2
          </text>
          <g clipPath="url(#whz-clip)">
            {zones && <path d={zones.f2} fill="url(#whz-h)" />}
            {zones && <path d={zones.f1} fill="url(#whz-v)" />}
            {geo.contours.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--color-muted)"
                strokeWidth="1.3"
                opacity="0.7"
              />
            ))}
            <path
              d={geo.region}
              fill="color-mix(in srgb, var(--color-accent) 13%, transparent)"
              stroke="var(--color-ink)"
              strokeWidth="2.2"
              strokeDasharray="7 4"
            />
            {geo.solContour && (
              <path
                d={geo.solContour}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.6"
              />
            )}
            <line
              x1={x(b[0])}
              x2={x(sol[0])}
              y1={y(b[1])}
              y2={y(sol[1])}
              stroke="var(--color-ink)"
              strokeWidth="1.6"
              strokeDasharray="3 4"
            />
          </g>
          {geo.radius > 0.05 && (
            <Label x={labelX} y={labelY} size={14} weight={600}>
              {budgetLabel}
            </Label>
          )}
          <circle
            cx={r1(x(sol[0]))}
            cy={r1(y(sol[1]))}
            r="7.5"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
          <Label x={r1(x(sol[0])) + 12} y={r1(y(sol[1])) + 22} size={14} weight={600}>
            Solution
          </Label>
          <g
            tabIndex={0}
            role="application"
            aria-label={`Least-squares point: weight on feature 1 ${fmtCoef(b[0])}, on feature 2 ${fmtCoef(b[1])}. Arrow keys move it.`}
            onKeyDown={onKey}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            style={{ cursor: drag ? 'grabbing' : 'grab', outline: 'none' }}
          >
            {focus && (
              <circle
                cx={x(b[0])}
                cy={y(b[1])}
                r="19"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="3"
              />
            )}
            <circle
              cx={x(b[0])}
              cy={y(b[1])}
              r="24"
              fill="transparent"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag(true);
                moveTo(e);
              }}
              onPointerMove={(e) => drag && moveTo(e)}
              onPointerUp={() => setDrag(false)}
              onPointerCancel={() => setDrag(false)}
            />
            <rect
              x={x(b[0]) - 8}
              y={y(b[1]) - 8}
              width="16"
              height="16"
              transform={`rotate(45 ${x(b[0])} ${y(b[1])})`}
              fill="var(--color-surface)"
              stroke="var(--color-ink)"
              strokeWidth="2.6"
              pointerEvents="none"
            />
          </g>
          <Label
            x={Math.min(x(b[0]) + 14, L + S - 130)}
            y={Math.max(T + 16, y(b[1]) - 14)}
            size={13}
          >
            Least-squares point
          </Label>
        </svg>
        <LegendRow
          items={[
            [
              <g key="a">
                <rect
                  x="5"
                  y="3"
                  width="10"
                  height="10"
                  transform="rotate(45 10 8)"
                  fill="var(--color-surface)"
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                />
              </g>,
              'Least-squares point (drag me)',
            ],
            [
              <line
                key="b"
                x1="1"
                x2="17"
                y1="8"
                y2="8"
                stroke="var(--color-muted)"
                strokeWidth="1.4"
              />,
              'Error contours (same error along each oval)',
            ],
            [
              <line
                key="c"
                x1="1"
                x2="17"
                y1="8"
                y2="8"
                stroke="var(--color-ink)"
                strokeWidth="2.2"
                strokeDasharray="5 3"
              />,
              'Budget region',
            ],
            [
              <line
                key="d"
                x1="1"
                x2="17"
                y1="8"
                y2="8"
                stroke="var(--color-accent)"
                strokeWidth="2.6"
              />,
              'Lowest contour that touches it',
            ],
            [<circle key="e" cx="9" cy="8" r="5" fill="var(--color-ink)" />, 'Solution'],
            ...(zones
              ? ([
                  [
                    <rect
                      key="z2"
                      x="1"
                      y="3"
                      width="16"
                      height="10"
                      fill="url(#whz-h)"
                      stroke="var(--color-accent)"
                      strokeWidth="1"
                    />,
                    'Zero zone for feature 2: handle here, weight 2 is exactly 0',
                  ],
                  [
                    <rect
                      key="z1"
                      x="1"
                      y="3"
                      width="16"
                      height="10"
                      fill="url(#whz-v)"
                      stroke="var(--color-neg)"
                      strokeWidth="1"
                    />,
                    'Zero zone for feature 1: handle here, weight 1 is exactly 0',
                  ],
                ] as [ReactNode, string][])
              : []),
          ]}
        />
        <p className="m-0 mt-2 text-xs text-muted">
          {method === 'lasso'
            ? lambda > 0
              ? 'The shaded zones are the handle positions where lasso sets a weight to exactly 0. They grow as you raise the penalty.'
              : 'With no penalty there is no zero zone. Raise the penalty and zones appear.'
            : 'Ridge has no zero zone: wherever the handle goes, no weight lands exactly on 0.'}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Weight label="Weight on feature 1" v={sol[0]} />
        <Weight label="Weight on feature 2" v={sol[1]} />
        <Card
          label="Features kept"
          value={`${plane.kept} of 2`}
          plain="a weight of exactly 0 means the feature is out"
        />
      </div>
      <Reading>{plane.text}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setB([b[1], b[0]])}>Swap the two features</Button>
        <Button
          onClick={() => {
            setB(DEFAULT_B);
            setLambda(0);
            setMethod('ridge');
            setRel('0');
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function WhyLassoHitsZero() {
  return (
    <ClientOnly
      minHeight={1320}
      minHeightWide={1160}
      label="Why lasso hits zero: a plane of two weights with error contours and a budget region"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
