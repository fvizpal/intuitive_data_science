import { useId } from 'react';
import { pageActions, usePage } from './store';
import { getModel } from './model';

const CHOICES = ['About 50%', 'About 75%', 'Always'];
const TARGETS = [0.5, 0.75, 1];

/** The page's predict prompt. Its answer is revealed by the pair-drawing widget below. */
export function PredictPair() {
  const name = useId();
  const { guess, draws, seed, separation } = usePage();
  const auc = getModel(seed, separation).auc;
  const revealed = draws >= 100;
  // The option the exact AUC lands on, if it is within five points of one.
  const nearest = TARGETS.reduce(
    (best, t, i) => (Math.abs(t - auc) < Math.abs(TARGETS[best]! - auc) ? i : best),
    0,
  );
  const match = Math.abs(TARGETS[nearest]! - auc) <= 0.05 ? nearest : null;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        Pick one random good customer and one random bad customer. How often does a decent
        score rank the good one higher?
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
            {revealed && match === i && <span aria-label="matches AUC"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          <>
            For this score the answer is <strong>{Math.round(auc * 100)}%</strong>. That
            number is AUC.
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#3-auc-the-chance-a-good-beats-a-bad">See the answer</a> below.
          </>
        ) : (
          'Pick one. The answer is in section 3.'
        )}
      </p>
    </fieldset>
  );
}
