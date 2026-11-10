import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = ['A: two even boxes', 'B: one pure box, one mixed', 'They tie'];

/** The page's predict prompt. Its answer is revealed by the best-split widget in section 2. */
export function PredictTree() {
  const name = useId();
  const { guess, scored } = usePage();
  const match = scored === 'mix' ? 1 : null;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        You have 100 fruit: 50 apples and 50 oranges. Question A makes two even boxes: one
        with 35 apples and 15 oranges, one with 15 apples and 35 oranges. Question B peels
        off 20 pure oranges and leaves 50 apples and 30 oranges together. Both get 70 of
        100 right if each box guesses its majority. Which question would a tree choose?
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              match === i
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
            {match === i && <span aria-label="the answer"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {match !== null ? (
          <>
            A tree chooses B. You saw the numbers in section 2.
            {guess !== null && guess !== match && <> You picked “{CHOICES[guess]}”.</>}
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#2-the-best-split">See the answer</a> in section 2.
          </>
        ) : (
          'Pick one. The answer is in section 2.'
        )}
      </p>
    </fieldset>
  );
}
