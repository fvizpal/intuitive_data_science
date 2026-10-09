const TOKENS = [
  'ink',
  'muted',
  'accent',
  'good',
  'bad',
  'grid',
  'surface',
  'pos',
  'neg',
] as const;
export type ThemeColors = Record<(typeof TOKENS)[number], string>;

/** Reads CSS color tokens so Canvas drawing follows light/dark mode. */
export function readTheme(el: Element = document.documentElement): ThemeColors {
  const style = getComputedStyle(el);
  return Object.fromEntries(
    TOKENS.map((t) => [t, style.getPropertyValue(`--color-${t}`).trim()]),
  ) as ThemeColors;
}

/** Calls `cb` when the theme changes (OS preference or data-theme attribute). */
export function onThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => {
    mq.removeEventListener('change', cb);
    obs.disconnect();
  };
}
