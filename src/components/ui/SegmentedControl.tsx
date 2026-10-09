import { useId } from 'react';
import type { KeyboardEvent } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Radio-group of buttons: one choice, arrow keys move between options. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: Props<T>) {
  const id = useId();
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const j = (i + delta + options.length) % options.length;
    const next = options[j];
    if (!next) return;
    onChange(next.value);
    const buttons =
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-1">
      <span id={id} className="text-sm">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => move(e, i)}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors ${
                on
                  ? 'border-accent bg-accent text-bg'
                  : 'border-grid bg-surface text-ink hover:border-accent'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
