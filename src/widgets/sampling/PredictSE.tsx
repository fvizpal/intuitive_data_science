import { useId, useMemo } from 'react';
import { commute } from '../../lib/populations';
import { f1 } from './charts';
import { popSd, se } from './sampling';
import { pageActions, usePage } from './store';

const CHOICES = ['About 200', 'About 400', 'About 1,000'];
const ANSWER = 1;

/** The page's predict prompt. Its answer is revealed by the sample-size widget below. */
export function PredictSE() {
  const name = useId();
  const { guess, saw100, saw400, seed } = usePage();
  const pop = useMemo(() => commute(seed), [seed]);
  const revealed = saw100 && saw400;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        Your sample of 100 people gives an average that wobbles a bit from sample to
        sample. How many people would you need to cut that wobble in half?
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              revealed && i === ANSWER
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
            {revealed && i === ANSWER && <span aria-label="the answer"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          <>
            About 400, which is 4 times as many. By the formula, the spread of the{' '}
            averages goes from {f1(se(pop, 100))} min at 100 people to {f1(se(pop, 400))}{' '}
            min at 400 (everyone spreads {f1(popSd(pop))} min).
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#3-bigger-samples-narrower-bell">See the answer</a> in section 3.
          </>
        ) : (
          'Pick one. The answer is in section 3.'
        )}
      </p>
    </fieldset>
  );
}
