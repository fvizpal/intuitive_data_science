import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { mulberry32 } from '../../lib/random';
import { fmt, genCorrelated } from './corr';
import { ScatterPlot } from './ScatterPlot';

const N = 50;
const DOMAIN = [-3.3, 3.3] as const;
const STORE_KEY = 'ids:guess-r';

interface Score {
  rounds: number;
  totalError: number;
}

/** Hidden true r for a round: a multiple of 0.05 in [−0.9, 0.9]. */
const trueRFor = (round: number) =>
  Math.round((mulberry32(4242 + round * 7919)() * 1.8 - 0.9) * 20) / 20;

const EMPTY: Score = { rounds: 0, totalError: 0 };

/** Score store backed by localStorage (light convenience: falls back to memory). */
let current: Score | null = null;
const listeners = new Set<() => void>();

function getScore(): Score {
  if (current) return current;
  current = EMPTY;
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as Score;
    if (Number.isFinite(s.rounds) && Number.isFinite(s.totalError)) current = s;
  } catch {
    /* storage unavailable or empty */
  }
  return current;
}

function saveScore(s: Score) {
  current = s;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function GuessTheR() {
  const [round, setRound] = useState(0);
  const [guess, setGuess] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const score = useSyncExternalStore(subscribe, getScore, () => EMPTY);

  const trueR = trueRFor(round);
  const points = useMemo(
    () => genCorrelated(900 + round, N, trueR, { exact: true }),
    [round, trueR],
  );
  const error = Math.abs(guess - trueR);
  const avg = score.rounds > 0 ? score.totalError / score.rounds : NaN;

  const reveal = () => {
    saveScore({ rounds: score.rounds + 1, totalError: score.totalError + error });
    setRevealed(true);
  };

  const nextRound = () => {
    setRound((r) => r + 1);
    setGuess(0);
    setRevealed(false);
  };

  const reset = () => {
    saveScore(EMPTY);
    setRound(0);
    setGuess(0);
    setRevealed(false);
  };

  const feedback =
    error <= 0.1
      ? 'Sharp eye.'
      : guess * trueR < 0 && Math.abs(guess) >= 0.1 && Math.abs(trueR) >= 0.1
        ? 'Wrong direction. Check whether the cloud tilts up or down.'
        : Math.abs(guess) < Math.abs(trueR)
          ? 'You guessed weaker than it is. Most people do: even r = 0.5 looks like a loose cloud.'
          : 'You guessed stronger than it is.';

  return (
    <fieldset
      aria-label="Guess the correlation: estimate r for the scatter, then reveal the answer"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <legend className="px-1 text-sm font-semibold">Predict: guess the r</legend>
      <ScatterPlot
        points={points}
        xDomain={DOMAIN}
        yDomain={DOMAIN}
        xLabel="x"
        yLabel="y"
        label={
          revealed
            ? `Scatter of ${N} points with true r ${fmt(trueR)}`
            : `Scatter of ${N} points with a hidden correlation`
        }
        style={() => ({ color: 'var(--color-accent)' })}
      />
      <div className="mt-3">
        <Slider
          label="Your guess"
          value={guess}
          min={-1}
          max={1}
          step={0.05}
          format={(v) => fmt(v)}
          onChange={(v) => {
            if (!revealed) setGuess(Math.round(v * 20) / 20);
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {revealed ? (
          <Button variant="primary" onClick={nextRound}>
            Next scatter
          </Button>
        ) : (
          <Button variant="primary" onClick={reveal}>
            Reveal
          </Button>
        )}
        <Button onClick={nextRound} disabled={!revealed}>
          Reshuffle data
        </Button>
        <Button onClick={reset}>Reset score</Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="True r" value={revealed ? fmt(trueR) : '?'} tone="accent" />
        <Metric label="Your error" value={revealed ? fmt(error) : '—'} />
        <Metric
          label="Average error"
          value={fmt(avg)}
          hint={`${score.rounds} ${score.rounds === 1 ? 'round' : 'rounds'}`}
        />
      </div>
      <p role="status" className="mb-0 mt-2 min-h-12 text-sm">
        {revealed
          ? `True r is ${fmt(trueR)}; you guessed ${fmt(guess)}. ${feedback}`
          : 'Move the slider to your guess, then press Reveal.'}
      </p>
    </fieldset>
  );
}
