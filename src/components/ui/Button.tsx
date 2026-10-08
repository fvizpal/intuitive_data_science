import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-bg border-accent'
      : 'bg-surface text-ink border-grid hover:border-accent';
  return (
    <button
      type={type}
      className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    />
  );
}
