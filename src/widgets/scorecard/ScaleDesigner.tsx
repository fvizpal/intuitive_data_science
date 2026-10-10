import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { defaultsInWords, fmtInt, oddsText } from './format';
import { getFitted } from './pipeline';
import { pdFromOdds, scoreFromLogOdds } from './scorecard';
import { pageActions, usePage } from './store';

const RUNGS = [200, 100, 50, 25, 12.5];
const RUNG_H = 56; // height of a rung row
const GAP_H = 36; // height of the bracket row between two rungs
const UNIT = RUNG_H + GAP_H;
const TOP = RUNG_H / 2;

/** Vertical centre of a given odds value on the ladder (log2 spacing, 1 unit per doubling). */
const yOf = (odds: number) => TOP + Math.log2(RUNGS[0]! / odds) * UNIT;

function Inner() {
  const { seed, scale, scaling: s } = usePage();
  const { portfolioOdds } = getFitted(seed);
  const score = (odds: number) => Math.round(scoreFromLogOdds(Math.log(odds), s));
  const height = TOP * 2 + (RUNGS.length - 1) * UNIT + 24;

  // Markers sit in the right column; nudge the lower one down if they would overlap.
  const markers = [
    {
      id: 'base',
      text: `Base ${oddsText(scale.baseOdds)} → ${score(scale.baseOdds)}`,
      odds: scale.baseOdds,
    },
    {
      id: 'portfolio',
      text: `Your portfolio ${oddsText(portfolioOdds)} → ${score(portfolioOdds)}`,
      odds: portfolioOdds,
    },
  ]
    .map((m) => ({ ...m, y: yOf(m.odds) }))
    .sort((a, b) => a.y - b.y);
  if (markers[1]!.y - markers[0]!.y < 34) markers[1]!.y = markers[0]!.y + 34;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Slider
          label="Base score"
          value={scale.baseScore}
          min={300}
          max={900}
          step={10}
          onChange={(v) => pageActions.setScale({ baseScore: v })}
          format={fmtInt}
        />
        <Slider
          label="Base odds (good : bad)"
          value={scale.baseOdds}
          min={10}
          max={100}
          step={1}
          onChange={(v) => pageActions.setScale({ baseOdds: v })}
          format={(v) => `${fmtInt(v)}:1`}
        />
        <Slider
          label="Points to double the odds"
          value={scale.pdo}
          min={10}
          max={50}
          step={1}
          onChange={(v) => pageActions.setScale({ pdo: v })}
          format={(v) => `${fmtInt(v)} pts`}
        />
      </div>

      <div className="relative mt-4" style={{ height }}>
        <ol className="m-0 list-none p-0 pr-[44%] sm:pr-[48%]">
          {RUNGS.map((odds, i) => (
            <li key={odds}>
              <div
                className="flex items-center gap-3 rounded-md border border-grid bg-bg px-3"
                style={{ height: RUNG_H }}
              >
                <span className="min-w-[3ch] font-mono text-xl font-semibold tabular-nums">
                  {score(odds)}
                </span>
                <span className="text-xs leading-tight text-muted">
                  odds {oddsText(odds)}
                  <br />
                  {defaultsInWords(pdFromOdds(odds))}
                </span>
              </div>
              {i < RUNGS.length - 1 && (
                <div
                  className="flex items-center gap-2 pl-4 text-xs text-muted"
                  style={{ height: GAP_H }}
                >
                  <span
                    className="h-full w-2 rounded-l-sm border-y border-l border-muted"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-pos">+{s.pdo} points</strong> = odds × 2
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="absolute inset-y-0 right-0 w-[42%] sm:w-[46%]" aria-hidden="true">
          {markers.map((m) => (
            <div
              key={m.id}
              className="absolute left-0 right-0 flex -translate-y-1/2 items-center gap-1 text-xs"
              style={{ top: m.y }}
            >
              <span className="h-px w-3 shrink-0 bg-accent sm:w-6" />
              <span className="rounded-md border border-accent bg-surface px-1.5 py-0.5 font-semibold leading-tight">
                {m.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="m-0 mt-2 text-sm font-semibold">Higher score = safer.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.resetScale}>Reset</Button>
      </div>
      <p className="sr-only" role="status">
        Base score {scale.baseScore} at odds {scale.baseOdds} to 1. Every {scale.pdo}{' '}
        points doubles the odds. Your portfolio at {oddsText(portfolioOdds)} scores{' '}
        {score(portfolioOdds)}.
      </p>
    </>
  );
}

export function ScaleDesigner() {
  return (
    <ClientOnly
      minHeight={560}
      label="Score scale designer: choose the base score, base odds and points to double the odds"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
