import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  /** Small line under the value, e.g. "strong positive". */
  hint?: ReactNode;
  /** Text color token for the value. */
  tone?: 'ink' | 'accent' | 'pos' | 'neg' | 'muted';
  large?: boolean;
}

const TONES = {
  ink: 'text-ink',
  accent: 'text-accent',
  pos: 'text-pos',
  neg: 'text-neg',
  muted: 'text-muted',
} as const;

/** A labeled number card. Values are pre-formatted strings so nothing unrounded leaks out. */
export function Metric({ label, value, hint, tone = 'ink', large = false }: Props) {
  return (
    <div className="min-w-0 rounded-md border border-grid bg-bg px-3 py-2">
      <div className="truncate text-xs text-muted">{label}</div>
      <div
        className={`font-mono font-semibold tabular-nums ${large ? 'text-3xl' : 'text-xl'} ${TONES[tone]}`}
      >
        {value}
      </div>
      {hint && <div className="truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}
