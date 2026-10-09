import { useId } from 'react';
import { TURNOVERS, OUTLIER_DEFAULT } from './data';
import { GUESS_OPTIONS, setGuess, useGuess } from './store';

/**
 * The page's predict prompt. It does not reveal the answer on the spot: the pick is
 * stored and the outlier widget scores it further down.
 */
export function GuessTypical() {
  const name = useId();
  const guess = useGuess();
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        Ten small businesses. Monthly turnover in ₹ lakh:{' '}
        <strong className="font-mono">{TURNOVERS.join(', ')}</strong>, and one big one at{' '}
        <strong className="font-mono">{OUTLIER_DEFAULT}</strong>.
      </p>
      <p className="mt-0">Which number best describes a typical business here?</p>
      <div className="flex flex-col gap-2">
        {GUESS_OPTIONS.map((option, i) => (
          <label
            key={option}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              guess === i ? 'border-accent' : 'border-grid hover:border-accent'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={guess === i}
              onChange={() => setGuess(i)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {guess !== null ? (
          <>
            Locked in: <strong>{GUESS_OPTIONS[guess]}</strong>. Play with the widgets
            below, then <a href="#outliers-tug-the-mean">see the answer</a>.
          </>
        ) : (
          'Pick one. The answer is revealed further down the page.'
        )}
      </p>
    </fieldset>
  );
}
