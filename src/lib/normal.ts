/** Error function, Abramowitz & Stegun 7.1.26 (max error 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-x * x));
}

/** Standard normal cumulative distribution: the share of a bell curve below x. */
export const Phi = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));
