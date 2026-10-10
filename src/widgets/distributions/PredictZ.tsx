import { useId } from 'react';
import { tailAbove } from './dist';
import { pct } from './charts';
import { pageActions, usePage } from './store';

const CHOICES = ['About half', 'About 16%', 'About 2.5%'];
const TARGETS = [0.5, 0.16, 0.025];

/** The page's predict prompt. Its answer is revealed by the 68-95-99.7 widget below. */
export function PredictZ() {
  const name = useId();
  const { guess, z, touched } = usePage();
  const tail = tailAbove(z);
  // The option the live tail share is close to (within a quarter of it), if any.
  const match = TARGETS.findIndex((t) => Math.abs(tail - t) / t <= 0.25);
  const revealed = touched;
  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">
        A student's mark is 2 standard deviations above the class average. If marks are
        bell-shaped, roughly what share of students score higher?
      </p>
      <p className="mb-3 mt-0 text-xs text-muted">
        Standard deviation = typical distance from the average (from the last page).
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
            {revealed && match === i && (
              <span aria-label="matches the bell curve"> ✓</span>
            )}
          </label>
        ))}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed ? (
          <>
            At {z > 0 ? '+' : ''}
            {z.toFixed(1)} SD (a mark of {Math.round(60 + 10 * z)} in a class averaging
            60), <strong>{pct(tail)}</strong> of students score higher.
          </>
        ) : guess !== null ? (
          <>
            Locked in: <strong>{CHOICES[guess]}</strong>.{' '}
            <a href="#3-the-68-95-997-rule">See the answer</a> below.
          </>
        ) : (
          'Pick one. The answer is in section 3.'
        )}
      </p>
    </fieldset>
  );
}
