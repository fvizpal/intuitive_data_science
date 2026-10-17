import { useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import {
  CutoffAxis,
  CutoffHandle,
  CutoffSlider,
  PAD,
  ShareSlider,
  pct,
  two,
  xOf,
} from './charts';
import { N_SMALL, getMail } from './mail';
import { FLAG_NOTHING, pageActions, usePage } from './store';
import { metrics, type Metrics } from './threshold';

const W = 600;
const H = 330;
const TOP = 40;
const BASE = 262;
const py = (v: number) => BASE - v * (BASE - TOP);

// Compact precision-versus-recall chart.
const W2 = 400;
const PAD2 = { l: 48, r: 32 };
const px2 = (recall: number) => PAD2.l + recall * (W2 - PAD2.l - PAD2.r);

/** Path through the points, lifting the pen where a value is undefined. */
function pathOf(pts: ({ x: number; y: number } | null)[]): string {
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

function YAxis({ w, pad }: { w: number; pad: { l: number; r: number } }) {
  return (
    <>
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={py(v)}
            y2={py(v)}
            stroke="var(--color-grid)"
          />
          <text
            x={pad.l - 6}
            y={py(v) + 6}
            textAnchor="end"
            fontSize="16"
            fill="var(--color-muted)"
          >
            {v * 100}%
          </text>
        </g>
      ))}
    </>
  );
}

function Inner() {
  const { seed, cutoff, share } = usePage();
  const mail = getMail(seed, N_SMALL, share);
  const leftRef = useRef<SVGSVGElement>(null);
  const [showBest, setShowBest] = useState(false);

  const rows = useMemo(() => mail.curve.map((r) => metrics(r)), [mail]);
  const m: Metrics = rows[cutoff]!;
  const best = mail.bestF1;
  const bestM = best ? rows[best.threshold]! : null;

  // First cutoff where nothing is flagged: the precision line ends there.
  const firstEmpty = rows.findIndex((r) => r.flagged === 0);

  const recallPts = rows.map((r, t) =>
    r.recall === null ? null : { x: xOf(t), y: py(r.recall) },
  );
  const precPts = rows.map((r, t) =>
    r.precision === null ? null : { x: xOf(t), y: py(r.precision) },
  );
  const marks = Array.from({ length: 11 }, (_, i) => i * 10);

  const prCurve = pathOf(
    rows.map((r) =>
      r.precision === null || r.recall === null
        ? null
        : { x: px2(r.recall), y: py(r.precision) },
    ),
  );

  let reading: string;
  if (m.recall === null) {
    reading = 'This mail has no spam, so recall is undefined.';
  } else if (m.precision === null) {
    reading = `Cutoff ${cutoff}: nothing flagged, so precision is undefined and you catch ${pct(m.recall)} of spam.`;
  } else if (m.precision + 0.2 < m.recall) {
    reading = `Cutoff ${cutoff}: you catch ${pct(m.recall)} of spam, but only ${pct(m.precision)} of flagged mail is spam.`;
  } else if (m.recall + 0.2 < m.precision) {
    reading = `Cutoff ${cutoff}: ${pct(m.precision)} of flagged mail is spam, but you catch only ${pct(m.recall)} of spam.`;
  } else {
    reading = `Cutoff ${cutoff}: you catch ${pct(m.recall)} of spam, and ${pct(m.precision)} of flagged mail is spam.`;
  }
  const bestReading =
    best && bestM
      ? ` Best balance at about ${best.threshold}: recall ${pct(bestM.recall)}, precision ${pct(bestM.precision)}.`
      : '';
  const summary = `Cutoff ${cutoff}: caught ${mail.curve[cutoff]!.tp} spam, ${mail.curve[cutoff]!.fp} false alarms, recall ${pct(m.recall)}, precision ${pct(m.precision)}.`;

  const bx = best ? xOf(best.threshold) : 0;
  const bestLeft = best ? cutoff >= best.threshold : false;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
        <svg
          ref={leftRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full select-none"
          role="img"
          aria-label={`Recall and precision against the cutoff, cutoff at ${cutoff}`}
        >
          <YAxis w={W} pad={PAD} />

          <CutoffAxis y={BASE} label="cutoff" />

          {/* best balance (F1) */}
          {best && (
            <g>
              <line
                x1={bx}
                x2={bx}
                y1={TOP}
                y2={BASE}
                stroke="var(--color-good)"
                strokeWidth="2"
                strokeDasharray="2 4"
              />
              <path
                d={`M${bx} ${BASE - 18} l8 8 l-8 8 l-8 -8 Z`}
                fill="var(--color-good)"
              />
              <text
                x={bestLeft ? bx - 10 : bx + 10}
                y={TOP - 12}
                textAnchor={bestLeft ? 'end' : 'start'}
                fontSize="17"
                fontWeight="600"
                fill="var(--color-good)"
              >
                Best balance (F1): {best.threshold}
              </text>
            </g>
          )}

          <path
            d={pathOf(recallPts)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3.5"
          />
          <path
            d={pathOf(precPts)}
            fill="none"
            stroke="var(--color-neg)"
            strokeWidth="3.5"
            strokeDasharray="9 5"
          />
          {marks.map((t) => {
            const r = rows[t]!;
            return (
              <g key={t}>
                {r.recall !== null && (
                  <circle
                    cx={xOf(t)}
                    cy={py(r.recall)}
                    r="5"
                    fill="var(--color-accent)"
                  />
                )}
                {r.precision !== null && (
                  <rect
                    x={xOf(t) - 4.5}
                    y={py(r.precision) - 4.5}
                    width="9"
                    height="9"
                    fill="var(--color-surface)"
                    stroke="var(--color-neg)"
                    strokeWidth="2.5"
                  />
                )}
              </g>
            );
          })}
          {firstEmpty > 0 && firstEmpty <= FLAG_NOTHING && (
            <text
              x={Math.min(xOf(firstEmpty) + 4, W - PAD.r)}
              y={py(rows[firstEmpty - 1]?.precision ?? 0) + 26}
              textAnchor="end"
              fontSize="16"
              fill="var(--color-neg)"
            >
              no flags
            </text>
          )}
          <CutoffHandle
            svgRef={leftRef}
            cutoff={cutoff}
            top={TOP}
            bottom={BASE}
            onChange={pageActions.setCutoff}
          />
        </svg>

        <svg
          viewBox={`0 0 ${W2} ${H}`}
          className="block w-full select-none"
          role="img"
          aria-label={`Precision against recall; the dot is at cutoff ${cutoff}`}
        >
          <YAxis w={W2} pad={PAD2} />
          <text x={PAD2.l - 38} y={20} fontSize="16" fill="var(--color-muted)">
            precision
          </text>
          <line
            x1={PAD2.l}
            x2={W2 - PAD2.r}
            y1={BASE}
            y2={BASE}
            stroke="var(--color-grid)"
          />
          {[0, 0.5, 1].map((v) => (
            <text
              key={v}
              x={px2(v)}
              y={BASE + 22}
              textAnchor="middle"
              fontSize="16"
              fill="var(--color-muted)"
            >
              {v * 100}%
            </text>
          ))}
          <text
            x={W2 - PAD2.r}
            y={BASE + 44}
            textAnchor="end"
            fontSize="16"
            fill="var(--color-muted)"
          >
            recall (spam caught)
          </text>
          <path d={prCurve} fill="none" stroke="var(--color-muted)" strokeWidth="3" />
          {bestM && bestM.recall !== null && bestM.precision !== null && (
            <path
              d={`M${px2(bestM.recall)} ${py(bestM.precision) - 9} l8 9 l-8 9 l-8 -9 Z`}
              fill="var(--color-good)"
            />
          )}
          {m.recall !== null && m.precision !== null && (
            <circle
              cx={px2(m.recall)}
              cy={py(m.precision)}
              r="9"
              fill="var(--color-ink)"
              stroke="var(--color-surface)"
              strokeWidth="2.5"
            />
          )}
          {m.precision === null && (
            <text x={PAD2.l + 8} y={TOP + 24} fontSize="16" fill="var(--color-neg)">
              nothing flagged
            </text>
          )}
        </svg>
      </div>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="30" height="12" aria-hidden="true">
            <line
              x1="0"
              x2="30"
              y1="6"
              y2="6"
              stroke="var(--color-accent)"
              strokeWidth="3.5"
            />
            <circle cx="15" cy="6" r="4.5" fill="var(--color-accent)" />
          </svg>
          Recall (solid, circles)
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="30" height="12" aria-hidden="true">
            <line
              x1="0"
              x2="30"
              y1="6"
              y2="6"
              stroke="var(--color-neg)"
              strokeWidth="3.5"
              strokeDasharray="7 4"
            />
            <rect
              x="10.5"
              y="1.5"
              width="9"
              height="9"
              fill="var(--color-surface)"
              stroke="var(--color-neg)"
              strokeWidth="2.5"
            />
          </svg>
          Precision (dashed, squares)
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <path d="M7 0 l7 7 l-7 7 l-7 -7 Z" fill="var(--color-good)" />
          </svg>
          Best balance (F1)
        </li>
      </ul>

      <div className="mt-3">
        <CutoffSlider />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          aria-pressed={cutoff === 30}
          variant={cutoff === 30 ? 'primary' : 'secondary'}
          onClick={() => pageActions.setCutoff(30)}
        >
          Catch more spam (30)
        </Button>
        <Button
          aria-pressed={cutoff === 75}
          variant={cutoff === 75 ? 'primary' : 'secondary'}
          onClick={() => pageActions.setCutoff(75)}
        >
          Flag only sure things (75)
        </Button>
        <Button
          aria-pressed={!!best && cutoff === best.threshold}
          variant={best && cutoff === best.threshold ? 'primary' : 'secondary'}
          disabled={!best}
          onClick={() => best && pageActions.setCutoff(best.threshold)}
        >
          Best balance (F1)
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card
          label="Recall"
          value={pct(m.recall)}
          hint={
            m.recall === null
              ? 'No spam in this mail, so undefined'
              : `caught ${pct(m.recall)} of spam`
          }
        />
        <Card
          label="Precision"
          value={pct(m.precision)}
          hint={
            m.precision === null
              ? 'Nothing flagged, so precision is undefined'
              : `${pct(m.precision)} of flagged mail is spam`
          }
        />
        <Card
          label="False alarm rate"
          value={pct(m.falseAlarmRate)}
          hint={
            m.falseAlarmRate === null
              ? 'No good mail, so undefined'
              : `${pct(m.falseAlarmRate)} of good mail wrongly flagged`
          }
        />
        <button
          type="button"
          aria-pressed={showBest}
          onClick={() => setShowBest((v) => !v)}
          className={`min-w-0 rounded-md border px-3 py-2 text-left ${showBest ? 'border-accent border-2' : 'border-grid'} bg-bg`}
        >
          <div className="text-xs text-muted">F1</div>
          <div className="font-mono text-xl font-semibold tabular-nums">{two(m.f1)}</div>
          <div className="text-xs leading-tight text-muted">
            {m.f1 === null
              ? 'Undefined here'
              : 'one number that rewards both (tap to see the best)'}
          </div>
        </button>
      </div>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        <span className="text-muted">What you&apos;re seeing: </span>
        {reading}
        {showBest && bestReading}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={pageActions.reset}>Reset</Button>
        <Button onClick={pageActions.newMail}>New mail</Button>
      </div>
      <div className="mt-3 border-t border-grid pt-3">
        <ShareSlider />
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs leading-tight text-muted">{hint}</div>
    </div>
  );
}

export function PrecisionVsRecall() {
  return (
    <ClientOnly
      minHeight={1000}
      minHeightWide={800}
      label="Recall and precision against the cutoff, and precision against recall"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
