import { useId, useState } from 'react';

interface Props {
  question: string;
  choices: string[];
  /** Index into `choices` of the correct answer. */
  answer: number;
  explanation?: string;
}

export function PredictPrompt({ question, choices, answer, explanation }: Props) {
  const name = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const revealed = picked !== null;

  return (
    <fieldset className="my-6 rounded-md border border-grid bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Predict</legend>
      <p className="mt-0">{question}</p>
      <div className="flex flex-col gap-2">
        {choices.map((choice, i) => {
          const state = !revealed
            ? 'border-grid hover:border-accent'
            : i === answer
              ? 'border-good'
              : i === picked
                ? 'border-bad'
                : 'border-grid opacity-60';
          return (
            <label
              key={choice}
              className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 ${state}`}
            >
              <input
                type="radio"
                name={name}
                checked={picked === i}
                disabled={revealed}
                onChange={() => setPicked(i)}
              />
              <span>{choice}</span>
              {revealed && i === answer && <span aria-label="correct"> ✓</span>}
              {revealed && i === picked && i !== answer && (
                <span aria-label="incorrect"> ✗</span>
              )}
            </label>
          );
        })}
      </div>
      <p role="status" className="mb-0 mt-3 text-sm">
        {revealed &&
          `${picked === answer ? 'Right. ' : `Not quite — the answer is “${choices[answer]}”. `}${explanation ?? ''}`}
      </p>
    </fieldset>
  );
}
