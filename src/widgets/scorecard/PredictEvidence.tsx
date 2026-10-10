import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = ['Safer', 'Riskier', 'It depends on how safe and how risky'];

/** The page's predict prompt. The answer is revealed in the evidence widget below. */
export function PredictEvidence() {
  const name = useId();
  const { guess } = usePage();
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        A business sits in a safe bin on two features and a risky bin on one. Overall, is
        it…
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              guess === i ? 'border-accent' : 'border-grid hover:border-accent'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={guess === i}
              onChange={() => pageActions.setGuess(i)}
            />
            <span>{c}</span>
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#1-evidence-adds-up">See the answer</a> below.
          </>
        ) : (
          'Pick one. The answer is in the next section.'
        )}
      </p>
    </fieldset>
  );
}
