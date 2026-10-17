import { useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';

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
  minHeightWide,
  label,
  children,
}: {
  minHeight: number;
  /** Reserved height from the `sm` breakpoint up, where widgets are usually shorter. */
  minHeightWide?: number;
  label: string;
  children: () => ReactNode;
}) {
  const mounted = useMounted();
  return (
    <div
      role="group"
      aria-label={label}
      className="my-6 min-h-[var(--mh)] rounded-md border border-grid bg-surface p-3 sm:min-h-[var(--mhw)] sm:p-4"
      style={
        {
          '--mh': `${minHeight}px`,
          '--mhw': `${minHeightWide ?? minHeight}px`,
        } as CSSProperties
      }
    >
      {mounted ? children() : <p className="m-0 text-sm text-muted">Loading…</p>}
    </div>
  );
}
