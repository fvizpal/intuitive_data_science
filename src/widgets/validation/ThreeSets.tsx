import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import {
  Curve,
  HourChart,
  OffChart,
  TruthLine,
  exitsOf,
  px,
  py,
} from '../biasvar/charts';
import { expectedError, fitPoly, gridPredictions, rmse } from '../biasvar/fit';
import {
  FitSwatch,
  Note,
  Reading,
  RoleLegend,
  RoleMark,
  StatCard,
  TruthSwatch,
  fmtErr,
} from './charts';
import { pageActions, usePage } from './store';
import { bestDegree, splitIndices, temperaturePool, type Shares } from './validation';

const PRESETS: { value: string; label: string; shares: Shares }[] = [
  { value: '60', label: '60 / 20 / 20', shares: { train: 0.6, val: 0.2, test: 0.2 } },
  { value: '70', label: '70 / 15 / 15', shares: { train: 0.7, val: 0.15, test: 0.15 } },
  { value: '80', label: '80 / 10 / 10', shares: { train: 0.8, val: 0.1, test: 0.1 } },
];
const POOLS = [30, 60, 120].map((v) => ({ value: String(v), label: String(v) }));
const NOISE = 2;

const pick = (v: ArrayLike<number>, idx: number[]) => idx.map((i) => v[i]!);

/** How the final exam compares with the mock test, in plain words. */
function compare(exam: number, mock: number): string {
  const r = exam / Math.max(mock, 1e-9);
  if (r < 0.9) return 'lower, which happens when the final exam is a lucky draw';
  if (r <= 1.15) return 'about the same, which is what you hope for';
  if (r <= 1.6) return 'a bit higher, which is normal';
  return 'much higher: the mock test flattered this degree';
}

function Inner() {
  const { seed } = usePage();
  const [pool, setPool] = useState(60);
  const [preset, setPreset] = useState('60');
  const [degree, setDegree] = useState(1);
  const [showTruth, setShowTruth] = useState(false);
  const [locked, setLocked] = useState<number | null>(null);

  const shares = PRESETS.find((p) => p.value === preset)!.shares;
  const data = useMemo(() => temperaturePool(seed, pool, NOISE), [seed, pool]);
  const sets = useMemo(() => {
    const sp = splitIndices(pool, shares, seed + 7);
    return {
      tx: pick(data.x, sp.train),
      ty: pick(data.y, sp.train),
      vx: pick(data.x, sp.val),
      vy: pick(data.y, sp.val),
      ex: pick(data.x, sp.test),
      ey: pick(data.y, sp.test),
    };
  }, [data, pool, shares, seed]);
  const cap = Math.max(1, Math.min(12, sets.tx.length - 1));
  const d = Math.min(degree, cap);

  // One row per degree, built once per (seed, pool, split); the slider only reads it.
  const rows = useMemo(() => {
    const out: { train: number; val: number; test: number; real: number }[] = [];
    for (let k = 1; k <= cap; k++) {
      const m = fitPoly(sets.tx, sets.ty, k);
      out.push({
        train: rmse(m, sets.tx, sets.ty),
        val: rmse(m, sets.vx, sets.vy),
        test: rmse(m, sets.ex, sets.ey),
        real: expectedError(m, NOISE),
      });
    }
    return out;
  }, [sets, cap]);
  const curve = useMemo(() => {
    const values = gridPredictions(fitPoly(sets.tx, sets.ty, d));
    return { values, exits: exitsOf(values) };
  }, [sets, d]);

  const row = rows[d - 1]!;
  const best = bestDegree(rows.map((r) => r.val)) ?? 1;
  const isLocked = locked !== null;
  const stale = isLocked && locked !== d;
  const lockedRow = locked !== null ? rows[locked - 1] : undefined;

  const summary = `Degree ${d}: practice error ${fmtErr(row.train)}, mock test error ${fmtErr(row.val)}${
    isLocked ? `, final exam error ${fmtErr(row.test)}` : ''
  }`;

  const reset = () => {
    setPool(60);
    setPreset('60');
    setDegree(1);
    setShowTruth(false);
    setLocked(null);
  };
  const startOver = () => {
    pageActions.newData();
    setDegree(1);
    setLocked(null);
  };

  const tickFrac = cap > 1 ? (best - 1) / (cap - 1) : 0;
  const r = pool > 60 ? 3.1 : 3.8;

  return (
    <>
      <Slider
        label="Degree: how flexible the curve is"
        value={d}
        min={1}
        max={cap}
        step={1}
        onChange={(v) => setDegree(Math.max(1, Math.min(cap, Math.round(v))))}
        format={String}
      />
      {/* Tick under the track at the degree with the lowest mock test error. */}
      <div
        className="pointer-events-none relative h-2"
        aria-hidden="true"
        style={{ marginLeft: 8, marginRight: 8 }}
      >
        <span
          className="absolute top-0 h-2 w-0.5 -translate-x-1/2 bg-ink"
          style={{ left: `${tickFrac * 100}%` }}
        />
      </div>
      <p className="m-0 text-xs text-muted">
        <span aria-hidden="true">| </span>Best on the mock test: degree {best}. Degree 1
        is a straight line; higher degrees bend more.
      </p>
      {cap < 12 && (
        <p className="m-0 mt-1 text-xs text-muted">
          With {sets.tx.length} points the most flexible curve allowed is degree {cap}.
        </p>
      )}

      <div className="mt-3">
        <HourChart
          label={`Temperature through the day: ${sets.tx.length} practice points, ${sets.vx.length} mock test points, ${sets.ex.length} final exam points and a degree ${d} curve. ${summary}.`}
          overlay={<OffChart exits={curve.exits} />}
        >
          {showTruth && (
            <>
              <TruthLine label={false} />
              <text
                x={px(0.6)}
                y={py(14.2)}
                fontSize="14"
                fill="var(--color-muted)"
                stroke="var(--color-surface)"
                strokeWidth="4"
                paintOrder="stroke"
              >
                Truth
              </text>
            </>
          )}
          {sets.tx.map((x, i) => (
            <RoleMark key={`t${i}`} role="train" x={px(x)} y={py(sets.ty[i]!)} r={r} />
          ))}
          {sets.vx.map((x, i) => (
            <RoleMark key={`v${i}`} role="val" x={px(x)} y={py(sets.vy[i]!)} r={r} />
          ))}
          {sets.ex.map((x, i) => (
            <RoleMark
              key={`e${i}`}
              role="test"
              x={px(x)}
              y={py(sets.ey[i]!)}
              r={r - 0.4}
            />
          ))}
          <Curve values={curve.values} width={3.2} />
        </HourChart>
        <RoleLegend
          extra={[
            [FitSwatch, 'the fit, trained on practice problems only'],
            ...(showTruth
              ? ([[TruthSwatch, 'Truth']] as [typeof TruthSwatch, string][])
              : []),
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Practice problems error"
          value={`${fmtErr(row.train)} °C`}
          plain="average gap on the points it learned from (training error)"
        />
        <StatCard
          label="Mock test error"
          value={`${fmtErr(row.val)} °C`}
          plain={
            d === best
              ? 'the lowest mock test error of all degrees'
              : 'average gap on points it has not seen (validation error)'
          }
        />
        <StatCard
          label="Final exam error"
          value={isLocked ? `${fmtErr(row.test)} °C` : 'Hidden until you lock in'}
          tone={isLocked ? 'plain' : 'hidden'}
          plain={
            isLocked
              ? 'one look, at the end (test error)'
              : 'you get one look, so choose first'
          }
        />
      </div>

      {stale && (
        <Note icon="⚠">
          <span>
            You&rsquo;ve seen the final exam. Picking again now turns it into practice.
          </span>{' '}
          <Button className="ml-1 mt-1" onClick={startOver}>
            Start over with new data
          </Button>
        </Note>
      )}

      <Reading>
        {!isLocked ? (
          <>
            Degree {d}: practice {fmtErr(row.train)}, mock test {fmtErr(row.val)}.{' '}
            {d === best
              ? 'This is the lowest mock test error. Locking in will reveal the final exam.'
              : `Degree ${best} has the lowest mock test error (${fmtErr(rows[best - 1]!.val)}).`}
          </>
        ) : (
          <>
            Degree {locked}: final exam {fmtErr(lockedRow!.test)} vs mock test{' '}
            {fmtErr(lockedRow!.val)}: {compare(lockedRow!.test, lockedRow!.val)}. Real
            error on new data: <strong>{fmtErr(lockedRow!.real)}</strong> (only a
            simulation can know this; a real project can&rsquo;t).
          </>
        )}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={isLocked} onClick={() => setLocked(d)}>
          Lock in this degree and sit the final exam
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SegmentedControl
          label="Points in the pool"
          options={POOLS}
          value={String(pool)}
          onChange={(v) => {
            setPool(Number(v));
            setLocked(null);
          }}
        />
        <SegmentedControl
          label="Split: practice / mock test / final exam"
          options={PRESETS}
          value={preset}
          onChange={(v) => {
            setPreset(v);
            setLocked(null);
          }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Toggle
          label="Show what the world really does"
          checked={showTruth}
          onChange={setShowTruth}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            pageActions.newData();
            setLocked(null);
          }}
        >
          New data
        </Button>
        <Button onClick={reset}>Reset</Button>
      </div>
    </>
  );
}

export function ThreeSets() {
  return (
    <ClientOnly
      minHeight={1080}
      minHeightWide={920}
      label="Three sets: practice, mock test and final exam"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
