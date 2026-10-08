import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Linear step; ignored in log mode. */
  step?: number;
  /** Map the slider position logarithmically (min must be > 0). */
  log?: boolean;
  format?: (value: number) => string;
}

const STEPS = 1000;

export const toPosition = (v: number, min: number, max: number, log: boolean): number =>
  log ? ((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * STEPS : v;

export const fromPosition = (
  p: number,
  min: number,
  max: number,
  log: boolean,
): number =>
  log ? Math.exp(Math.log(min) + (p / STEPS) * (Math.log(max) - Math.log(min))) : p;

export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  step = 0.01,
  log = false,
  format = (v) => String(Number(v.toPrecision(3))),
}: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-sm">
        <span>{label}</span>
        <output htmlFor={id} className="font-mono font-semibold">
          {format(value)}
        </output>
      </label>
      <input
        id={id}
        type="range"
        className="h-6 w-full accent-accent"
        min={log ? 0 : min}
        max={log ? STEPS : max}
        step={log ? 1 : step}
        value={toPosition(value, min, max, log)}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(fromPosition(Number(e.target.value), min, max, log))}
      />
    </div>
  );
}
