import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = [
  'Both keep rising',
  'Training error rises; error on new data falls, then rises',
  'Both keep falling',
];

/** The page's predict prompt. Its answer is revealed by the first widget in section 1. */
export function PredictPenalty() {
  const name = useId();
  const { guess, leash } = usePage();
  const match =
    leash && leash.atDefaults
      ? leash.shape === 'falls-then-rises'
        ? 1
        : leash.shape === 'rises-first'
          ? 0
          : null
      : null;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        You add a penalty on coefficient size and turn it up. What happens to error on the
        training points, and to error on new data?
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
        {leash ? (
          match === 1 ? (
            'Training error rises; error on new data falls, then rises. You saw it in section 1.'
          ) : (
            <>
              With the settings in section 1 ({leash.n} points), error on new data{' '}
              {leash.shape === 'keeps-falling'
                ? 'keeps falling'
                : leash.shape === 'rises-first'
                  ? 'rises straight away'
                  : 'falls, then rises'}
              ; training error always rises. At the defaults, new-data error falls, then
              rises.
            </>
          )
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#1-a-leash-on-the-curve">See the answer</a> in section 1.
          </>
        ) : (
          'Pick one. The answer is in section 1.'
        )}
        {leash && guess !== null && match !== null && guess !== match && (
          <> You picked “{CHOICES[guess]}”.</>
        )}
      </p>
    </fieldset>
  );
}
