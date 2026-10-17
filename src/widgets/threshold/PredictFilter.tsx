import { useId } from 'react';
import { pct } from './charts';
import { pageActions, usePage } from './store';
import { naturalFrequencies } from './threshold';

const CHOICES = ['About 90%', 'About 65%', 'About 40%'];
const TARGETS = [0.9, 0.65, 0.4];

/** The page's predict prompt. Its answer is revealed by the rare-events widget in section 3. */
export function PredictFilter() {
  const name = useId();
  const { guess, rare, rareSeen } = usePage();
  const f = naturalFrequencies({
    prevalence: rare.share,
    recall: rare.recall,
    falseAlarmRate: rare.falseAlarmRate,
  });
  const precision = f.precision ?? 0;
  const nearest = TARGETS.reduce(
    (best, t, i) =>
      Math.abs(t - precision) < Math.abs(TARGETS[best]! - precision) ? i : best,
    0,
  );
  const match = Math.abs(TARGETS[nearest]! - precision) <= 0.1 ? nearest : null;
  const revealed = rareSeen;

  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        A filter catches 90% of spam and wrongly flags 5% of good mail. Only 4% of all
        mail is spam. Of the emails the filter flags, about how many are really spam?
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
            {revealed && match === i && <span aria-label="matches the dots"> ✓</span>}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          <>
            With the numbers in the dots widget, <strong>{pct(f.precision)}</strong> of
            flagged mail is really spam.
            {match === null && ' None of the three options is close.'}
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#3-rare-events">See the answer</a> in section 3.
          </>
        ) : (
          'Pick one. The answer is in section 3.'
        )}
      </p>
    </fieldset>
  );
}
