/** Number formatting for the gradient descent page. Never prints NaN or Infinity. */

const finite = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** Steps: an integer; "100000+" when the run never got there; "never" when it diverged. */
export function fmtSteps(
  steps: number | null,
  capped: boolean,
  diverged = false,
): string {
  if (steps !== null && finite(steps)) return String(Math.round(steps));
  if (diverged) return 'never';
  return capped ? '100000+' : '—';
}

/** Learning rate or similar: 3 significant digits; 0.001 and below in exponent form (2.28e-5). */
export function fmtLr(v: number): string {
  if (!finite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001)
    return v
      .toExponential(2)
      .replace(/\.?0+e/, 'e')
      .replace('e-0', 'e-');
  return String(Number(v.toPrecision(3)));
}

/** A loss or slope: 1 to 2 decimals; huge values read "1000000+", tiny ones "about 0". */
export function fmtLoss(v: number): string {
  if (!finite(v)) return '1000000+';
  const a = Math.abs(v);
  if (a >= 1e6) return '1000000+';
  if (a < 1e-6) return 'about 0';
  if (a < 0.01) return v.toFixed(2) === '0.00' ? 'about 0' : v.toFixed(2);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export const fmtPct = (share: number): string =>
  finite(share) ? `${Math.round(Math.min(Math.max(share, 0), 1e6) * 100)}%` : '—';

/** A stretch: a whole number with commas above 100, 1 decimal below. */
export function fmtStretch(v: number): string {
  if (!finite(v)) return '—';
  if (v >= 1e6) return '1,000,000+';
  if (v >= 100) return Math.round(v).toLocaleString('en-US');
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

/** Roughly, for a sentence: "about 125,000" (3 significant digits above 1000). */
export function aboutStretch(v: number): string {
  if (!finite(v)) return '—';
  if (v >= 1000) {
    const mag = 10 ** (Math.floor(Math.log10(v)) - 1);
    return Math.round(v / mag) * mag >= 1e6
      ? '1,000,000+'
      : (Math.round(v / mag) * mag).toLocaleString('en-US');
  }
  return fmtStretch(v);
}

/** A coordinate with 1 decimal, no "-0.0". */
export function fmtXY(v: number): string {
  if (!finite(v)) return '—';
  const s = v.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

export const fmtMin = (v: number): string => (finite(v) ? v.toFixed(1) : '—');

export function ratioWord(a: number, b: number): string {
  if (!(a > 0) || !(b > 0)) return '—';
  const r = b / a;
  return r >= 1.5 ? `about ${Math.round(r)} times` : 'about the same';
}
