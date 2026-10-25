import { mulberry32, normal } from '../../lib/random';
import { matOf, type Mat } from './linalg';

export function randomProblem(n: number, p: number, seed: number, corr = 0) {
  const rng = mulberry32(seed);
  const x = matOf(n, p);
  for (let i = 0; i < n; i++) {
    const shared = normal(rng);
    for (let j = 0; j < p; j++)
      x.a[i * p + j] =
        Math.sqrt(1 - corr) * normal(rng) + Math.sqrt(corr) * shared + 0.5 * j;
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 3;
    for (let j = 0; j < p; j++)
      s += (j % 3 === 0 ? 1.5 : j % 3 === 1 ? -1 : 0) * x.a[i * p + j]!;
    y[i] = s + 2 * normal(rng);
  }
  return { x, y };
}

/** Design with centered columns and Z'Z / n = I, from QR of a centered random matrix. */
export function orthonormal(n: number, p: number, seed: number): Mat {
  const rng = mulberry32(seed);
  const q: number[][] = [];
  // Gram-Schmidt on centered random columns (independent of the library's QR)
  for (let j = 0; j < p; j++) {
    const v = Array.from({ length: n }, () => normal(rng));
    const m = v.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) v[i] = v[i]! - m;
    for (let pass = 0; pass < 2; pass++)
      for (const u of q) {
        const d = v.reduce((s, vi, i) => s + vi * u[i]!, 0);
        for (let i = 0; i < n; i++) v[i] = v[i]! - d * u[i]!;
      }
    const nr = Math.sqrt(v.reduce((s, vi) => s + vi * vi, 0));
    q.push(v.map((vi) => vi / nr));
  }
  const z = matOf(n, p);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < p; j++) z.a[i * p + j] = q[j]![i]! * Math.sqrt(n);
  return z;
}
