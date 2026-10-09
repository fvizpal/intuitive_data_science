import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/** False while rendering on the server and during hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Renders the widget only after hydration. Widgets compute floating-point layouts, which
 * can differ in the last digit between Node and the browser; the server therefore sends
 * just a box of the right height (no layout shift, no hydration mismatch).
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
