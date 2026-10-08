import { useId } from 'react';

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: Props) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm"
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-accent"
      />
      <span>
        {label}: <strong>{checked ? 'On' : 'Off'}</strong>
      </span>
    </label>
  );
}
