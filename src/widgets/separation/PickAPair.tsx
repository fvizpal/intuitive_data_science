import { useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import {
  GOOD_FILL,
  Legend,
  PAD,
  ScoreAxis,
  SeparationControl,
  W,
  pct,
  scoreToX,
} from './charts';
import { pickPairs, runningMean } from './metrics';
import { getModel } from './model';
import { pageActions, usePage } from './store';

const MAX_DRAWS = 5000;
const SHOW_EXACT_AFTER = 300;

function Inner() {
  const { seed, separation, draws: n } = usePage();
  const m = getModel(seed, separation);
  const pairs = useMemo(
    () => pickPairs(m.goods, m.bads, MAX_DRAWS, seed + 1000),
    [m, seed],
  );
  const running = useMemo(() => runningMean(pairs), [pairs]);

  const draw = (k: number) => pageActions.setPairDraws(Math.min(MAX_DRAWS, n + k));
  const last = n > 0 ? pairs[n - 1]! : null;
  const share = n > 0 ? running[n - 1]! : 0;
  const wins = Math.round(share * n * 2) / 2;
  const tally =
    n === 0
      ? 'No draws yet.'
      : `Good scored higher in ${wins} of ${n} draw${n === 1 ? '' : 's'} (${pct(share)}).`;
  const exact = n >= SHOW_EXACT_AFTER;

  // Pair strip: two lanes on one score axis.
  const LANE_G = 38;
  const LANE_B = 78;
  const AXIS = 112;
  // Running chart geometry
  const CH = 190;
  const C_TOP = 14;
  const C_BASE = 150;
  const cy = (v: number) => C_BASE - v * (C_BASE - C_TOP);
  const span = Math.max(n, 100);
  const cx = (i: number) => PAD.l + 34 + (i / span) * (W - PAD.l - PAD.r - 34);
  const step = Math.max(1, Math.ceil(n / 300));
  const pts: string[] = [];
  for (let i = 0; i < n; i += step)
    pts.push(`${cx(i + 1).toFixed(1)} ${cy(running[i]!).toFixed(1)}`);
  if (n > 0 && (n - 1) % step !== 0)
    pts.push(`${cx(n).toFixed(1)} ${cy(running[n - 1]!).toFixed(1)}`);

  const verdict = last
    ? last.goodWins === 1
      ? 'Good wins'
      : last.goodWins === 0
        ? 'Bad wins'
        : 'Tie'
    : '';
  const summary = `${tally}${exact ? ` Exact AUC ${m.auc.toFixed(2)}.` : ''}`;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} 150`}
        className="block w-full select-none"
        role="img"
        aria-label={
          last
            ? `Latest pair: good scored ${last.good}, bad scored ${last.bad}. ${verdict}.`
            : 'Score line. Draw a pair to see one good and one bad customer.'
        }
      >
        <text x={PAD.l} y={LANE_G + 6} fontSize="17" fill="var(--color-muted)">
          good
        </text>
        <text x={PAD.l} y={LANE_B + 6} fontSize="17" fill="var(--color-muted)">
          bad
        </text>
        <line
          x1={PAD.l + 50}
          x2={W - PAD.r}
          y1={LANE_G}
          y2={LANE_G}
          stroke="var(--color-grid)"
          strokeDasharray="3 4"
        />
        <line
          x1={PAD.l + 50}
          x2={W - PAD.r}
          y1={LANE_B}
          y2={LANE_B}
          stroke="var(--color-grid)"
          strokeDasharray="3 4"
        />
        <ScoreAxis y={AXIS} label={false} />
        {last && (
          <g key={n} className="pair-drop">
            {[
              { x: scoreToX(last.good), y: LANE_G, win: last.goodWins >= 0.5 },
              { x: scoreToX(last.bad), y: LANE_B, win: last.goodWins <= 0.5 },
            ].map((d, i) => (
              <g key={i}>
                <line
                  x1={d.x}
                  x2={d.x}
                  y1={d.y}
                  y2={AXIS}
                  stroke="var(--color-muted)"
                  strokeDasharray="2 3"
                />
                {i === 0 ? (
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r="9"
                    fill={GOOD_FILL}
                    stroke="var(--color-ink)"
                    strokeWidth="1.5"
                  />
                ) : (
                  <rect
                    x={d.x - 9}
                    y={d.y - 9}
                    width="18"
                    height="18"
                    fill="var(--color-neg)"
                    stroke="var(--color-ink)"
                    strokeWidth="1.5"
                  />
                )}
                {d.win && last.goodWins !== 0.5 && (
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r="17"
                    fill="none"
                    stroke="var(--color-ink)"
                    strokeWidth="2.5"
                  />
                )}
              </g>
            ))}
            <text
              x={Math.min(
                W - 90,
                Math.max(PAD.l + 60, scoreToX((last.good + last.bad) / 2)),
              )}
              y="20"
              textAnchor="middle"
              fontSize="19"
              fontWeight="700"
              fill="var(--color-ink)"
            >
              {verdict}
            </text>
          </g>
        )}
      </svg>
      <Legend goods="Good (circle)" bads="Bad (square)" />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => draw(1)} disabled={n >= MAX_DRAWS}>
          Draw one pair
        </Button>
        <Button onClick={() => draw(100)} disabled={n >= MAX_DRAWS}>
          Draw 100
        </Button>
        <Button onClick={() => draw(1000)} disabled={n >= MAX_DRAWS}>
          Draw 1000
        </Button>
        <Button onClick={() => pageActions.setPairDraws(0)}>Reset</Button>
      </div>

      <p className="m-0 mt-3 text-sm font-semibold">{tally}</p>
      {n >= 100 && (
        <p className="m-0 text-xs text-muted">
          That is the answer to the prediction at the top.
        </p>
      )}

      <svg
        viewBox={`0 0 ${W} ${CH}`}
        className="mt-2 block w-full select-none"
        role="img"
        aria-label={`Running percentage of draws the good scored higher: ${pct(share)} after ${n} draws`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.l + 34}
              x2={W - PAD.r}
              y1={cy(t)}
              y2={cy(t)}
              stroke="var(--color-grid)"
            />
            <text
              x={PAD.l + 28}
              y={cy(t) + 5}
              fontSize="15"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              {t * 100}%
            </text>
          </g>
        ))}
        {pts.length > 0 && (
          <path
            d={`M${pts.join(' L')}`}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
          />
        )}
        {exact && (
          <>
            <line
              x1={PAD.l + 34}
              x2={W - PAD.r}
              y1={cy(m.auc)}
              y2={cy(m.auc)}
              stroke="var(--color-ink)"
              strokeWidth="2"
              strokeDasharray="8 5"
            />
            <text
              x={W - PAD.r}
              y={cy(m.auc) - 7}
              fontSize="17"
              fontWeight="600"
              textAnchor="end"
              fill="var(--color-ink)"
            >
              AUC (exact) {m.auc.toFixed(2)}
            </text>
          </>
        )}
        <text
          x={W - PAD.r}
          y={CH - 12}
          fontSize="15"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          number of draws (running % where good won)
        </text>
      </svg>

      <div className="mt-3 border-t border-grid pt-3">
        <SeparationControl compact />
        <p className="m-0 mt-1 text-xs text-muted">
          Changing the knob restarts the draws.
        </p>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function PickAPair() {
  return (
    <ClientOnly
      minHeight={520}
      label="Pick a pair: draw a random good and a random bad and see which scores higher"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
