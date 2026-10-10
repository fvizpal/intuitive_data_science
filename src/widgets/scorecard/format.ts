/** Plain-language number formatting. Nothing here ever prints NaN or Infinity. */

const ok = (v: number) => Number.isFinite(v);

export const fmtInt = (v: number): string =>
  ok(v) ? Math.round(v).toLocaleString('en-US') : '—';

/** Percentage: integers from 10% up, one decimal below. */
export const fmtPct = (v: number): string =>
  !ok(v) ? '—' : `${Math.abs(v) >= 0.1 ? Math.round(v * 100) : (v * 100).toFixed(1)}%`;

/** Signed integer with a real minus sign: +32, −5, 0. */
export function signedInt(v: number): string {
  if (!ok(v)) return '—';
  const r = Math.round(v);
  return r === 0 ? '0' : `${r > 0 ? '+' : '−'}${Math.abs(r)}`;
}

/** Signed number with a real minus sign and fixed digits: +0.85, −1.20. */
export function signedNum(v: number, digits = 2): string {
  if (!ok(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : `${v > 0 ? '+' : '−'}${s}`;
}

const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/** Good : bad odds as the reader says them: 24:1, 2.5:1, 1:3. */
export function oddsText(odds: number): string {
  if (!ok(odds) || odds <= 0) return '—';
  if (odds >= 1) {
    const half = Math.abs(odds * 2 - Math.round(odds * 2)) < 1e-9; // 12.5 keeps its decimal
    return `${odds >= 100 || (odds >= 10 && !half) ? Math.round(odds) : trim(odds, 1)}:1`;
  }
  return `1:${trim(1 / odds, 1)}`;
}

/** What one bin does to the odds: "odds × 1.9" or "odds ÷ 2.3". */
export function oddsFactorText(woe: number): string {
  if (!ok(woe)) return '—';
  const f = Math.exp(Math.abs(woe));
  if (f < 1.05) return 'odds unchanged';
  return `odds ${woe > 0 ? '×' : '÷'} ${trim(f, 1)}`;
}

/** Spoken form for screen readers: "odds times 1.9". */
export const oddsFactorSpoken = (woe: number): string =>
  oddsFactorText(woe).replace('×', 'times').replace('÷', 'divided by');

/** "about 2 in 100 default", "about 4.9 in 1,000 default". */
export function defaultsInWords(pd: number): string {
  if (!ok(pd)) return '—';
  if (pd >= 0.995) return 'nearly all default';
  if (pd >= 0.01) return `about ${trim(pd * 100, pd >= 0.1 ? 0 : 1)} in 100 default`;
  const per = pd * 1000;
  return `about ${trim(per, per >= 10 ? 0 : 1)} in 1,000 default`;
}

/** Risk band from the probability of default, independent of the score scale. */
export function riskBand(pd: number): string {
  if (!ok(pd)) return '—';
  if (pd < 0.01) return 'Very low risk';
  if (pd < 0.025) return 'Low risk';
  if (pd < 0.05) return 'Medium risk';
  if (pd < 0.1) return 'Elevated risk';
  return 'High risk';
}
