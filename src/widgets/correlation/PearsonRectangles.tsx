import { useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { fmt, genCorrelated, rectangleParts } from './corr';
import type { Pair } from './corr';
import { ScatterPlot } from './ScatterPlot';
import type { MarkStyle } from './ScatterPlot';

const N = 40;
const RHO_DEFAULT = 0.5;
const SEED_DEFAULT = 3;
const DOMAIN = [-3.3, 3.3] as const;

const AGREE: MarkStyle = { color: 'var(--color-pos)', shape: 'circle' };
const DISAGREE: MarkStyle = { color: 'var(--color-neg)', shape: 'triangle' };

export function PearsonRectangles() {
  const hatch = useId().replace(/:/g, '');
  const [rho, setRho] = useState(RHO_DEFAULT);
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [edited, setEdited] = useState<Pair[] | null>(null);

  const generated = useMemo(
    () => genCorrelated(seed, N, rho, { exact: true }),
    [seed, rho],
  );
  const points = edited ?? generated;
  const parts = rectangleParts(points);
  const agrees = (p: Pair) => (p.x - parts.mx) * (p.y - parts.my) >= 0;

  const onDrag = (i: number, x: number, y: number) =>
    setEdited(points.map((p, j) => (j === i ? { x, y } : p)));

  return (
    <div
      role="group"
      aria-label="Pearson as rectangles: each point draws a rectangle to the mean point"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <Slider
        label="Target correlation"
        value={rho}
        min={-1}
        max={1}
        step={0.05}
        format={(v) => fmt(v)}
        onChange={(v) => {
          setRho(Math.round(v * 20) / 20);
          setEdited(null);
        }}
      />
      <div className="mt-3">
        <ScatterPlot
          points={points}
          xDomain={DOMAIN}
          yDomain={DOMAIN}
          xLabel="x"
          yLabel="y"
          label={`Scatter of ${N} points with rectangles to the mean point`}
          style={(i) => (agrees(points[i]!) ? AGREE : DISAGREE)}
          onDrag={onDrag}
          under={({ sx, sy }) => (
            <g>
              <defs>
                <pattern
                  id={hatch}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="var(--color-neg)"
                    strokeWidth="1.5"
                    strokeOpacity="0.45"
                  />
                </pattern>
              </defs>
              {points.map((p, i) => {
                const a = agrees(p);
                const x = Math.min(sx(p.x), sx(parts.mx));
                const y = Math.min(sy(p.y), sy(parts.my));
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={Math.abs(sx(p.x) - sx(parts.mx))}
                    height={Math.abs(sy(p.y) - sy(parts.my))}
                    fill={a ? 'var(--color-pos)' : `url(#${hatch})`}
                    fillOpacity={a ? 0.1 : 1}
                    stroke={a ? 'var(--color-pos)' : 'var(--color-neg)'}
                    strokeOpacity="0.35"
                  />
                );
              })}
              <line
                x1={sx(parts.mx)}
                x2={sx(parts.mx)}
                y1={sy(DOMAIN[0])}
                y2={sy(DOMAIN[1])}
                stroke="var(--color-ink)"
                strokeDasharray="5 4"
              />
              <line
                x1={sx(DOMAIN[0])}
                x2={sx(DOMAIN[1])}
                y1={sy(parts.my)}
                y2={sy(parts.my)}
                stroke="var(--color-ink)"
                strokeDasharray="5 4"
              />
              <text
                x={sx(parts.mx) + 4}
                y={sy(DOMAIN[1]) + 12}
                fontSize="11"
                fill="var(--color-muted)"
              >
                mean x
              </text>
              <text
                x={sx(DOMAIN[1]) - 4}
                y={sy(parts.my) - 4}
                fontSize="11"
                textAnchor="end"
                fill="var(--color-muted)"
              >
                mean y
              </text>
            </g>
          )}
        />
      </div>
      <p className="m-0 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>
          <span className="text-pos">●</span> agreeing: both above or both below the mean
        </span>
        <span>
          <span className="text-neg">▲</span> disagreeing (hatched): one above, one below
        </span>
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric
          label="Agreeing area"
          value={fmt(parts.agree)}
          tone="pos"
          hint="✓ pushes r up"
        />
        <Metric
          label="Disagreeing area"
          value={fmt(parts.disagree)}
          tone="neg"
          hint="✗ pushes r down"
        />
        <Metric label="r = agree − disagree" value={fmt(parts.r)} tone="accent" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setRho(RHO_DEFAULT);
            setSeed(SEED_DEFAULT);
            setEdited(null);
          }}
        >
          Reset
        </Button>
        <Button
          onClick={() => {
            setSeed((s) => s + 1);
            setEdited(null);
          }}
        >
          Reshuffle data
        </Button>
      </div>
      <p role="status" className="mb-0 mt-2 text-sm text-muted">
        Agreeing area {fmt(parts.agree)} minus disagreeing area {fmt(parts.disagree)}{' '}
        gives r = {fmt(parts.r)}.{edited ? ' You moved a point.' : ''}
      </p>
    </div>
  );
}
