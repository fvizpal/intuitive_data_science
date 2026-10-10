import { useId, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { CrowdHistogram, Legend, SeparationControl, pct, two, whole } from './charts';
import { bandLabel, cutoffRates } from './metrics';
import { SCORE_HI, SCORE_LO, getModel, shares } from './model';
import { pageActions, usePage } from './store';

// Square plot inside a 480 x 450 viewBox.
const VW = 480;
const VH = 450;
const OX = 78;
const OY = 22;
const S = 360;
const px = (x: number) => OX + x * S;
const py = (y: number) => OY + (1 - y) * S;
/** A surface-colored outline so labels stay readable over hatching. */
const HALO = {
  stroke: 'var(--color-surface)',
  strokeWidth: 5,
  paintOrder: 'stroke',
  strokeLinejoin: 'round',
} as const;

function Inner() {
  const { seed, separation, cutoff } = usePage();
  const m = getModel(seed, separation);
  const [showGini, setShowGini] = useState(false);
  const [showKs, setShowKs] = useState(false);
  const hatch = useId();

  const paths = useMemo(() => {
    const pts = m.roc.map((p) => `${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`);
    const line = `M${pts.join(' L')}`;
    return {
      line,
      area: `${line} L${px(1)} ${py(0)} L${px(0)} ${py(0)} Z`,
      gini: `${line} L${px(0)} ${py(0)} Z`,
    };
  }, [m]);
  const g = useMemo(() => shares(m.goods), [m]);
  const b = useMemo(() => shares(m.bads), [m]);
  const rates = cutoffRates(m.goods, m.bads, cutoff);
  const ksPoint = m.roc.find((p) => p.cutoff === m.ksCutoff);
  if (!rates || !ksPoint) {
    return <p className="m-0 text-sm">Need both goods and bads to draw this.</p>;
  }
  const max = Math.max(0.001, ...g, ...b);
  const ksLeft = ksPoint.x > 0.5;
  const dotX = px(rates.goodsRejected);
  const dotY = py(rates.badsRejected);
  const band = bandLabel(m.auc);
  const summary = `Separation ${separation.toFixed(1)}: KS ${two(m.ks)}, AUC ${two(m.auc)}, Gini ${two(m.gini)}. At cutoff ${whole(cutoff)} you reject ${pct(rates.badsRejected)} of bads and ${pct(rates.goodsRejected)} of goods.`;

  return (
    <>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="mx-auto block w-full max-w-md select-none"
        role="img"
        aria-label={`ROC curve: share of bads rejected against share of goods rejected. ${summary}`}
      >
        <defs>
          <pattern id={hatch} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect
              width="7"
              height="7"
              fill="color-mix(in srgb, var(--color-accent) 14%, transparent)"
            />
            <circle cx="3.5" cy="3.5" r="1.5" fill="var(--color-accent)" />
          </pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={px(0)}
              x2={px(1)}
              y1={py(t)}
              y2={py(t)}
              stroke="var(--color-grid)"
            />
            <line
              x1={px(t)}
              x2={px(t)}
              y1={py(0)}
              y2={py(1)}
              stroke="var(--color-grid)"
            />
            <text
              x={px(0) - 8}
              y={py(t) + 5}
              fontSize="15"
              textAnchor="end"
              fill="var(--color-muted)"
            >
              {t * 100}%
            </text>
            <text
              x={px(t)}
              y={py(0) + 20}
              fontSize="15"
              textAnchor="middle"
              fill="var(--color-muted)"
            >
              {t * 100}%
            </text>
          </g>
        ))}
        <text
          x={px(0.5)}
          y={VH - 24}
          fontSize="17"
          textAnchor="middle"
          fill="var(--color-ink)"
        >
          % of goods rejected
        </text>
        <text
          x={px(0.5)}
          y={VH - 6}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          false positive rate
        </text>
        <text
          transform={`translate(16 ${py(0.5)}) rotate(-90)`}
          fontSize="17"
          textAnchor="middle"
          fill="var(--color-ink)"
        >
          % of bads rejected
        </text>
        <text
          transform={`translate(34 ${py(0.5)}) rotate(-90)`}
          fontSize="14"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          true positive rate
        </text>

        <path d={paths.area} fill="var(--color-accent)" opacity="0.1" />
        {showGini && <path d={paths.gini} fill={`url(#${hatch})`} />}

        <line
          x1={px(0)}
          y1={py(0)}
          x2={px(1)}
          y2={py(1)}
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
        <text
          x={px(0.78)}
          y={py(0.78) + 26}
          fontSize="15"
          fill="var(--color-muted)"
          textAnchor="middle"
        >
          Coin flip
        </text>
        <path d={paths.line} fill="none" stroke="var(--color-accent)" strokeWidth="3.5" />

        {showGini && (
          <text
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill="var(--color-ink)"
            {...HALO}
          >
            <tspan x={px(0.66)} y={py(0.76)}>
              Gini = 2 ×
            </tspan>
            <tspan x={px(0.66)} dy="20">
              this area
            </tspan>
          </text>
        )}
        {showKs && (
          <g>
            <line
              x1={px(ksPoint.x)}
              x2={px(ksPoint.x)}
              y1={py(ksPoint.x)}
              y2={py(ksPoint.y)}
              stroke="var(--color-ink)"
              strokeWidth="4"
            />
            <line
              x1={px(ksPoint.x) - 6}
              x2={px(ksPoint.x) + 6}
              y1={py(ksPoint.x)}
              y2={py(ksPoint.x)}
              stroke="var(--color-ink)"
              strokeWidth="3"
            />
            <line
              x1={px(ksPoint.x) - 6}
              x2={px(ksPoint.x) + 6}
              y1={py(ksPoint.y)}
              y2={py(ksPoint.y)}
              stroke="var(--color-ink)"
              strokeWidth="3"
            />
            <text
              y={py((ksPoint.x + ksPoint.y) / 2) + (ksLeft ? 0 : 0)}
              fontSize="15"
              fontWeight="600"
              textAnchor={ksLeft ? 'end' : 'start'}
              fill="var(--color-ink)"
              {...HALO}
            >
              <tspan x={px(ksPoint.x) + (ksLeft ? -10 : 10)}>KS = {two(m.ks)}:</tspan>
              <tspan x={px(ksPoint.x) + (ksLeft ? -10 : 10)} dy="17">
                farthest point
              </tspan>
              <tspan x={px(ksPoint.x) + (ksLeft ? -10 : 10)} dy="17">
                from the diagonal
              </tspan>
            </text>
          </g>
        )}

        <circle
          cx={dotX}
          cy={dotY}
          r="15"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <circle cx={dotX} cy={dotY} r="6" fill="var(--color-ink)" />
      </svg>
      <p className="m-0 text-center text-xs text-muted">
        Dot = your cutoff {whole(cutoff)}: rejects {pct(rates.badsRejected)} of bads and{' '}
        {pct(rates.goodsRejected)} of goods.
      </p>

      <div className="mt-2">
        <CrowdHistogram
          goods={g}
          bads={b}
          max={max}
          height={130}
          cut={cutoff}
          onCut={pageActions.setCutoff}
          shade
          ariaLabel={`Score histograms with the shared cutoff at ${whole(cutoff)}`}
        />
        <Legend />
      </div>

      <div className="mt-3">
        <Slider
          label="Cutoff score (rejects scores below it)"
          value={Math.min(SCORE_HI, Math.max(SCORE_LO, cutoff))}
          min={SCORE_LO}
          max={SCORE_HI}
          step={1}
          onChange={pageActions.setCutoff}
          format={whole}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4">
        <Toggle label="Show Gini" checked={showGini} onChange={setShowGini} />
        <Toggle label="Show KS" checked={showKs} onChange={setShowKs} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric wrap label="AUC" value={two(m.auc)} tone="accent" hint={band} />
        <Metric wrap label="Gini" value={two(m.gini)} tone="accent" />
        <Metric wrap label="KS" value={two(m.ks)} tone="accent" />
      </div>
      <ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-sm">
        <li>
          <strong>AUC {two(m.auc)}</strong>: a good outranks a bad {pct(m.auc)} of the
          time ({band}).
        </li>
        <li>
          <strong>Gini {two(m.gini)}</strong>: 0 = coin flip, 1 = perfect.
        </li>
        <li>
          <strong>KS {two(m.ks)}</strong>: the biggest gap between the two curves.
        </li>
      </ul>

      <div className="mt-3 border-t border-grid pt-3">
        <SeparationControl compact />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={pageActions.reset}>Reset</Button>
          <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function ROCBuilder() {
  return (
    <ClientOnly
      minHeight={1000}
      label="ROC curve: slide the cutoff and see AUC, Gini and KS on one picture"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
