import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Toggle } from '../../components/ui/Toggle';
import { getFitted } from './pipeline';
import { pageActions, usePage } from './store';
import { getTwinFit } from './twin';

const MIN = -0.5;
const MAX = 1.5;
const at = (v: number) =>
  `${((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100}%`;

function trustText(w: number): string {
  if (w < -0.005) return 'negative weight';
  return `${Math.round(w * 100)}% of full trust`;
}

function Inner() {
  const { seed } = usePage();
  const [twin, setTwin] = useState(false);
  const fitted = getFitted(seed);
  const twinFit = twin ? getTwinFit(fitted) : null;
  const model = twinFit ? twinFit.model : fitted.model;

  const labels = fitted.bins.map((b) => b.label);
  const rows = model.coefs.map((w, j) => ({
    key: j,
    label:
      twin && j === 0
        ? 'Bureau score (copy 1)'
        : twin && j === 4
          ? 'Bureau score (copy 2)'
          : labels[j]!,
    w,
    split: twin && (j === 0 || j === 4),
  }));
  // Keep the duplicate right under the original.
  if (twin) rows.splice(1, 0, rows.pop()!);

  const anyNegative = rows.some((r) => r.w < -0.005);
  const summary = rows.map((r) => `${r.label} weight ${r.w.toFixed(2)}`).join('. ');

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          label="Add a near-duplicate of bureau score"
          checked={twin}
          onChange={setTwin}
        />
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        <Button
          onClick={() => {
            setTwin(false);
            pageActions.resetSeed();
          }}
        >
          Reset
        </Button>
      </div>

      <div className="mt-4">
        <div className="relative h-5 text-xs text-muted" aria-hidden="true">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: at(1) }}
          >
            1.0 = full trust
          </span>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {rows.map((r) => {
            const lo = Math.min(0, r.w);
            const hi = Math.max(0, r.w);
            return (
              <li key={r.key}>
                <div className="flex flex-wrap justify-between gap-x-2 text-sm">
                  <span className="font-semibold">{r.label}</span>
                  <span className="font-mono">
                    {r.w < 0 ? '−' : ''}
                    {Math.abs(r.w).toFixed(2)} · {trustText(r.w)}
                  </span>
                </div>
                <div className="relative mt-1 h-5 rounded-sm bg-bg">
                  <div
                    className="absolute inset-y-0 rounded-sm transition-[left,width] duration-300"
                    style={{
                      left: at(lo),
                      width: `${((Math.min(MAX, hi) - Math.max(MIN, lo)) / (MAX - MIN)) * 100}%`,
                      minWidth: 2,
                      background: r.w < 0 ? 'var(--color-neg)' : 'var(--color-pos)',
                      backgroundImage: r.split
                        ? 'repeating-linear-gradient(45deg, transparent 0 4px, rgb(0 0 0 / 0.22) 4px 6px)'
                        : undefined,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-px bg-muted"
                    style={{ left: at(0) }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute -inset-y-1 border-l-2 border-dashed border-ink"
                    style={{ left: at(1) }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="m-0 mt-3 text-sm">
        {twin
          ? 'Two copies, shared credit: the model avoids counting the same evidence twice.'
          : 'Each weight is how much the model trusts that feature’s evidence. About 1.0 means take it at face value.'}
      </p>
      {twinFit && (
        <p className="m-0 mt-1 text-xs text-muted">
          The two copies correlate {twinFit.twinCorrelation.toFixed(2)}: almost the same
          information.
        </p>
      )}
      {anyNegative && (
        <p className="m-0 mt-2 rounded-md border-l-4 border-neg bg-bg p-2 text-sm text-neg">
          ▼ Negative weight: overlapping features, check before using.
        </p>
      )}
      <p className="m-0 mt-2 text-xs text-muted">
        Features that overlap? See <a href="/concepts/correlation/">correlation</a>.
      </p>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function WeighTheEvidence() {
  return (
    <ClientOnly
      minHeight={380}
      label="Weights the model gives each feature, with an option to add a near-duplicate"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
