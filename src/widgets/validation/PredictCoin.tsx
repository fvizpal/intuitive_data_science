import { useId } from 'react';
import { pct0 } from './charts';
import { pageActions, usePage } from './store';
import { exactMaxAccuracy } from './validation';

const CHOICES = ['About 50%', 'About 60%', 'About 80%'];
const TARGETS = [0.5, 0.6, 0.8];

/** The page's predict prompt. Its answer is revealed by the coin-flip widget in section 2. */
export function PredictCoin() {
  const name = useId();
  const { guess, coin, coinSeen } = usePage();
  const best = exactMaxAccuracy(coin.m, coin.K);
  const nearest = TARGETS.reduce(
    (b, t, i) => (Math.abs(t - best) < Math.abs(TARGETS[b]! - best) ? i : b),
    0,
  );
  const match = Math.abs(TARGETS[nearest]! - best) <= 0.1 ? nearest : null;
  const revealed = coinSeen;

  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        50 models are pure coin flips: each guesses, with no skill. You check each on the
        same 100 questions and keep the best. What accuracy does the best one show on
        those questions?
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              revealed && match === i
                ? 'border-good'
                : guess === i
                  ? 'border-accent'
                  : 'border-grid hover:border-accent'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={guess === i}
              onChange={() => pageActions.setGuess(i)}
            />
            <span>{c}</span>
            {revealed && match === i && <span aria-label="matches the theory"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          <>
            With the settings in section 2, the best of {coin.K} coin flips shows about{' '}
            <strong>{pct0(best)}</strong> on {coin.m} questions, and about 50% on fresh
            ones.
            {match === null && ' None of the three options is close.'}
            {guess !== null && match !== null && guess !== match && (
              <> You picked “{CHOICES[guess]}”.</>
            )}
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#2-the-winners-curse">See the answer</a> in section 2.
          </>
        ) : (
          <>
            Pick one. <a href="#2-the-winners-curse">See the answer</a> in section 2.
          </>
        )}
      </p>
    </fieldset>
  );
}
