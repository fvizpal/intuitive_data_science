import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = ['None', 'About 5', 'About 25', 'About half'];
const ANSWER = 1;

/** The page's predict prompt. Its answer is revealed by the catcher widget in section 2. */
export function PredictCatch() {
  const name = useId();
  const { guess, answerSeen } = usePage();
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        You build 100 different 95% intervals, each from a fresh sample of the same
        population. About how many miss the true value?
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              answerSeen && i === ANSWER
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
            {answerSeen && i === ANSWER && <span aria-label="the answer"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {answerSeen ? (
          <>
            About 5: that is what 95% means. You saw it in section 2.
            {guess !== null && guess !== ANSWER && <> You picked “{CHOICES[guess]}”.</>}
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#2-catching-the-truth">See the answer</a> in section 2.
          </>
        ) : (
          'Pick one. The answer is in section 2.'
        )}
      </p>
    </fieldset>
  );
}
