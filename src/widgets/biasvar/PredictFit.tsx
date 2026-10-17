import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = ['It keeps falling', 'It falls, then rises', 'It rises straight away'];
const SHAPE_INDEX = {
  'keeps-falling': 0,
  'falls-then-rises': 1,
  'rises-first': 2,
} as const;

/** The page's predict prompt. Its answer is revealed by the complexity curve in section 3. */
export function PredictFit() {
  const name = useId();
  const { guess, shape } = usePage();
  const match = shape ? SHAPE_INDEX[shape] : null;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        You let the curve bend more and more. Error on the training points always falls.
        What happens to error on new data?
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
            {match === 1 ? (
              'It falls, then rises. You saw it in section 3.'
            ) : (
              <>
                With the settings in section 3, error on new data{' '}
                {match === 0 ? 'keeps falling' : 'rises straight away'}. At the defaults
                it falls, then rises.
              </>
            )}
            {guess !== null && guess !== match && <> You picked “{CHOICES[guess]}”.</>}
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#3-the-sweet-spot">See the answer</a> in section 3.
          </>
        ) : (
          'Pick one. The answer is in section 3.'
        )}
      </p>
    </fieldset>
  );
}
