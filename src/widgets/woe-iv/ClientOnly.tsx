import type { ReactNode } from 'react';
import { useMounted } from './store';

/**
 * Renders children only after hydration. The dataset is built in the browser, so the
 * server renders just a box of the right height (no layout shift, no hydration mismatch).
 */
export function ClientOnly({
  minHeight,
  label,
  children,
}: {
  minHeight: number;
  label: string;
  children: () => ReactNode;
}) {
  const mounted = useMounted();
  return (
    <div
      role="group"
      aria-label={label}
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
      style={{ minHeight }}
    >
      {mounted ? children() : <p className="m-0 text-sm text-muted">Loading…</p>}
    </div>
  );
}
