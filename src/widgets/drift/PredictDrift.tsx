import { useId } from 'react';
import { pageActions, usePage } from './store';

const CHOICES = [
  'Negligible, nothing to worry about',
  'Borderline, worth a look',
  'Major, act now',
];
const ANSWER = 1;

/** The page's predict prompt. Its answer appears once the PSI widget below has come into view. */
export function PredictDrift() {
  const name = useId();
  const { guess, psiSeen, shift, spreadMult, newSegmentShare } = usePage();
  const atDefault = shift === -20 && spreadMult === 1 && newSegmentShare === 0;
  const revealed = psiSeen && guess !== null;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        At build time the average score was 640. Today&rsquo;s applicants average 620,
        which is 20 points lower. How big a shift is that?
      </p>
      <div className="flex flex-col gap-2">
        {CHOICES.map((c, i) => (
          <label
            key={c}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${
              revealed && atDefault && i === ANSWER
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
            {revealed && atDefault && i === ANSWER && (
              <span aria-label="the answer"> ✓</span>
            )}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          atDefault ? (
            <>
              <strong>Borderline.</strong> PSI for a 20-point drop is about 0.11, just
              over the 0.1 line. Twenty points is only a third of a standard deviation, so
              it feels small, yet the measure still notices.
            </>
          ) : (
            <>
              You have moved the knobs since, so the numbers below changed. With the
              average 20 points lower and nothing else different, PSI is about 0.11:{' '}
              <strong>borderline</strong>.
            </>
          )
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#2-psi-slice-by-slice">See the answer</a> below.
          </>
        ) : (
          'Pick one. The answer is in section 2.'
        )}
      </p>
    </fieldset>
  );
}
