import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import type { Pt } from './bowl';
import { BowlSvg, Card, Label, Reading, StarMark, TryThis, sx, sy } from './charts';
import {
  maxSafeLrQuad,
  olsFromNormalEquations,
  runQuadratic,
  stretchOf,
  type QuadRun,
} from './general';
import { aboutStretch, fmtSteps } from './format';
import { houseH, houseRows, makeHouses } from './houses';

const SEED = 42;
const SHARE = 0.9;
const SQFT_TO_SQM = 0.09290304;

const UNITS = [
  { value: 'sqkm', label: 'Square km', name: 'square km', factor: SQFT_TO_SQM * 1e-6 },
  { value: 'sqm', label: 'Square metres', name: 'square metres', factor: SQFT_TO_SQM },
  { value: 'sqft', label: 'Square feet', name: 'square feet', factor: 1 },
] as const;
type UnitKey = (typeof UNITS)[number]['value'];
const DEFAULT_UNIT: UnitKey = 'sqft';
const ROWS_SHOWN = 4;

const houses = makeHouses(SEED);

interface Fit {
  stretch: number;
  run: QuadRun;
}

const cache = new Map<string, Fit>();
function fitFor(unit: (typeof UNITS)[number], std: boolean): Fit {
  const key = `${unit.value}|${std}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows: Pt[] = std
    ? houseRows(houses, true)
    : houseRows(houses, false).map((r): Pt => [r[0] * unit.factor, r[1]]);
  const y = Array.from(houses.priceC);
  const w = olsFromNormalEquations(rows, y);
  const H = std ? houseH(houses, true) : hFromRows(rows);
  const lr = SHARE * maxSafeLrQuad(H);
  const fit = { stretch: stretchOf(H), run: runQuadratic(H, [0, 0], w, lr) };
  cache.set(key, fit);
  return fit;
}

function hFromRows(rows: Pt[]) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const r of rows) {
    a += r[0] * r[0];
    b += r[0] * r[1];
    c += r[1] * r[1];
  }
  const n = rows.length || 1;
  return [
    [a / n, b / n],
    [b / n, c / n],
  ] as const;
}

/** A number as a person would write it: grouped thousands, or exponent form when tiny. */
function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a < 0.000001) return v.toExponential(1);
  if (a < 0.01) return v.toFixed(6);
  if (a >= 100) return Math.round(v).toLocaleString('en-US');
  return String(Number(v.toPrecision(3)));
}

/** The picture can show a stretch up to 100; thinner hills are drawn at 100. */
const DRAW_CAP = 100;

function Inner() {
  const [unitKey, setUnitKey] = useState<UnitKey>(DEFAULT_UNIT);
  const [std, setStd] = useState(false);
  const unit = UNITS.find((u) => u.value === unitKey) ?? UNITS[2];
  const { stretch, run } = fitFor(unit, std);
  const steps = fmtSteps(run.steps, run.capped, run.diverged);
  const stretchText =
    stretch >= 1e6 ? 'over 1,000,000' : `about ${aboutStretch(stretch)}`;
  const drawn = Math.min(Math.max(stretch, 1), DRAW_CAP);

  const sdArea = std ? 1 : houses.sds.area * unit.factor;
  const sdRooms = std ? 1 : houses.sds.rooms;
  const shownRows = Array.from({ length: ROWS_SHOWN }, (_, i) => ({
    area: std ? houses.areaZ[i]! : houses.area[i]! * unit.factor,
    rooms: std ? houses.roomsZ[i]! : houses.rooms[i]!,
  }));

  const reading = std
    ? `Standardized: stretch ${stretchText}, ${steps} steps, whichever units you started with. Same houses, same model, same answer.`
    : run.steps === null
      ? `Area in ${unit.name}: stretch ${stretchText}. 100000 steps and still not 99% of the way down.`
      : `Area in ${unit.name}: stretch ${stretchText}. It takes ${steps} steps to get 99% of the way down.`;
  const summary = `${std ? 'Standardized' : `Area in ${unit.name}`}: stretch ${stretchText}, ${steps} steps to 99% of the way down.`;

  return (
    <>
      <p className="m-0 mb-2 text-sm">
        Same 200 houses, same model. Only the units change.
      </p>
      <TryThis>
        Switch the area from square feet to square metres to square km. Then turn
        Standardize on.
      </TryThis>

      <SegmentedControl
        label="Measure the house area in:"
        options={UNITS.map((u) => ({ value: u.value, label: u.label }))}
        value={unitKey}
        onChange={setUnitKey}
      />
      <div className="mt-2">
        <Toggle label="Standardize the features" checked={std} onChange={setStd} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="pb-1 text-left text-xs text-muted">
            The numbers the model sees for the first {ROWS_SHOWN} houses
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="border-b border-grid pb-1 pr-3 font-medium">
                {std ? 'Area (standardized)' : `Area (${unit.name})`}
              </th>
              <th className="border-b border-grid pb-1 font-medium">
                {std ? 'Bedrooms (standardized)' : 'Bedrooms'}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {shownRows.map((r, i) => (
              <tr key={i}>
                <td className="border-b border-grid py-1 pr-3">{fmtVal(r.area)}</td>
                <td className="border-b border-grid py-1">{fmtVal(r.rooms)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs">
              <td className="pr-3 pt-1 text-muted">
                Typical spread: <span className="font-mono">{fmtVal(sdArea)}</span>
              </td>
              <td className="pt-1 text-muted">
                Typical spread: <span className="font-mono">{fmtVal(sdRooms)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h4 className="mb-1 mt-4 text-sm font-semibold">How narrow the hill is</h4>
      <BowlSvg
        kappa={drawn}
        label={`The hill the model has to walk down, at stretch ${stretchText}. The narrower the hill, the more steps it takes.`}
        xLabel="knob 1 →"
        yLabel="knob 2 ↑"
        overlay={
          stretch > DRAW_CAP ? (
            <Label x={594} y={26} anchor="end" size={12} fill="var(--color-muted)">
              Drawn at stretch 100. The real hill is thinner.
            </Label>
          ) : null
        }
      >
        <StarMark x={sx(0)} y={sy(0)} label="Bottom" />
      </BowlSvg>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card
          label="Stretch"
          value={stretchText}
          plain="How many times more sensitive one knob is than the other."
        />
        <Card
          label="Steps until 99% of the way down"
          value={steps}
          plain="The loss has dropped 99% of the way to its lowest."
        />
      </div>
      <p className="m-0 mt-2 text-xs text-muted">
        Each time the learning rate is set to 90% of the biggest safe one, so every
        setting gets a fair try.
      </p>

      <div className="mt-3">
        <Button
          onClick={() => {
            setUnitKey(DEFAULT_UNIT);
            setStd(false);
          }}
        >
          Reset
        </Button>
      </div>

      <Reading>{reading}</Reading>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
    </>
  );
}

export function ChangeUnits() {
  return (
    <ClientOnly
      minHeight={1040}
      minHeightWide={980}
      label="Change the units: the same houses and model, with the area measured in different units"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
