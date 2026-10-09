import { useId } from 'react';
import { FEATURES, RANKED_KEYS } from './features';
import type { RankedKey } from './features';
import { pageActions, usePage } from './store';

/** A fixed, shuffled-looking order so the right answer is not always first. */
const ORDER: RankedKey[] = [
  'monthly_turnover_lakh',
  'bureau_score',
  'noise_feature',
  'max_dpd_6m',
  'years_in_business',
];

/**
 * The page's predict prompt. Unlike the plain PredictPrompt it does not reveal the answer
 * on the spot: the pick is stored and the ranking widget scores it later.
 */
export function GuessFeature() {
  const name = useId();
  const { guess } = usePage();
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        Which one do you think tells us the most about who will default?
      </p>
      <div className="flex flex-col gap-2">
        {ORDER.filter((k) => RANKED_KEYS.includes(k)).map((k) => (
          <label
            key={k}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              guess === k ? 'border-accent' : 'border-grid hover:border-accent'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={guess === k}
              onChange={() => pageActions.setGuess(k)}
            />
            <span>{FEATURES[k].label}</span>
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {guess ? (
          <>
            Locked in: <strong>{FEATURES[guess].label}</strong>. Play with the widgets
            below, then <a href="#information-value">see the answer</a>.
          </>
        ) : (
          'Pick one. The answer is revealed further down the page.'
        )}
      </p>
    </fieldset>
  );
}
