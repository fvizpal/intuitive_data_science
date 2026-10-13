import { useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { Legend, PairHistogram, Reading } from './charts';
import {
  HIST_HI,
  HIST_LO,
  HIST_TICKS,
  baselineBars,
  getBaseline,
  getToday,
  mean,
  todayBars,
} from './data';
import { segmentReading, shiftReading, spreadReading } from './format';
import { pageActions, usePage } from './store';
import type { Scenario } from './store';

export const PRESETS: { label: string; scenario: Scenario }[] = [
  { label: 'No change', scenario: { shift: 0, spreadMult: 1, newSegmentShare: 0 } },
  { label: 'Small shift', scenario: { shift: -10, spreadMult: 1, newSegmentShare: 0 } },
  {
    label: 'Big shift (-40)',
    scenario: { shift: -40, spreadMult: 1, newSegmentShare: 0 },
  },
  { label: 'Wider spread', scenario: { shift: 0, spreadMult: 1.4, newSegmentShare: 0 } },
  {
    label: 'A new low-score segment appears',
    scenario: { shift: 0, spreadMult: 1, newSegmentShare: 0.2 },
  },
];

const AXIS = { lo: HIST_LO, hi: HIST_HI, ticks: HIST_TICKS };
const Y_MAX = 1400;

/** How much of the two bar shapes lie on top of each other (1 = identical). */
function overlapShare(a: readonly number[], b: readonly number[]): number {
  let shared = 0;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    shared += Math.min(a[i]!, b[i]!);
    total += a[i]!;
  }
  return total ? shared / total : 1;
}

function overlapWords(o: number): string {
  if (o > 0.95) return 'today looks almost exactly like build time.';
  if (o > 0.8) return 'most applicants look like the ones the model was built on.';
  if (o > 0.6) return 'a good share of today’s applicants sit where build time had few.';
  return 'many of today’s applicants sit where build time had few.';
}

const sameScenario = (a: Scenario, b: Scenario) =>
  a.shift === b.shift &&
  a.spreadMult === b.spreadMult &&
  a.newSegmentShare === b.newSegmentShare;

function Lab() {
  const { seed, shift, spreadMult, newSegmentShare } = usePage();
  const scenario = useMemo<Scenario>(
    () => ({ shift, spreadMult, newSegmentShare }),
    [shift, spreadMult, newSegmentShare],
  );
  const base = baselineBars(seed);
  const today = todayBars(seed, scenario);
  const baseMean = mean(getBaseline(seed));
  const todayMean = mean(getToday(seed, scenario));

  const overlap = overlapShare(base, today);
  const summary = `Build time average ${Math.round(baseMean)}, today's average ${Math.round(todayMean)}. ${shiftReading(shift)}`;
  return (
    <>
      <PairHistogram
        base={base}
        today={today}
        axis={AXIS}
        yMax={Y_MAX}
        height={250}
        baseMean={baseMean}
        todayMean={todayMean}
        ariaLabel={`Two histograms of ${getBaseline(seed).length.toLocaleString('en-US')} scores each. ${summary}`}
      />
      <Legend />
      <p className="m-0 mt-1 text-xs text-muted">
        Triangles mark each average. Scores below {HIST_LO} or above {HIST_HI} pile into
        the end bars.
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
        <p className="m-0 mt-1 text-sm font-semibold">{shiftReading(shift)}</p>
      </div>

      <div className="mt-4 border-t border-grid pt-4">
        <p className="m-0 mb-2 text-xs text-muted">
          A second knob, once you have played with the first.
        </p>
        <Slider
          label="How spread out today's scores are"
          value={spreadMult}
          min={0.6}
          max={1.6}
          step={0.05}
          onChange={pageActions.setSpread}
          format={(v) => `×${v.toFixed(2)}`}
        />
        <p className="m-0 mt-1 text-sm font-semibold">
          {spreadReading(spreadMult)} {segmentReading(newSegmentShare)}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            aria-pressed={sameScenario(scenario, p.scenario)}
            variant={sameScenario(scenario, p.scenario) ? 'primary' : 'secondary'}
            onClick={() => pageActions.setScenario(p.scenario)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
        <Button onClick={pageActions.reset}>Reset</Button>
      </div>

      <Reading>
        Build time averaged <strong>{Math.round(baseMean)}</strong>; today averages{' '}
        <strong>{Math.round(todayMean)}</strong>. About{' '}
        <strong>{Math.round(overlap * 100)}%</strong> of the two shapes overlap, so{' '}
        {overlapWords(overlap)}
      </Reading>
    </>
  );
}

export function DriftLab() {
  return (
    <ClientOnly
      minHeight={710}
      label="Drift lab: compare build-time and today's score histograms"
    >
      {() => <Lab />}
    </ClientOnly>
  );
}
