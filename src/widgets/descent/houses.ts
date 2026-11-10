/**
 * Mock houses: area, bedrooms and price. z1, z2 and z3 are standard normals fixed per seed
 * (Box-Muller from lib/random), drawn row by row, so a smaller n keeps the first rows.
 */
import { mulberry32, normal } from '../../lib/random';
import { standardize, type Mat2 } from './general';
import { Hessian2 } from './general';
import type { Pt } from './bowl';

export const HOUSES_N = 200;

export interface Houses {
  n: number;
  /** Square feet. */
  area: Float64Array;
  /** Continuous bedrooms (display name "Bedrooms"). */
  rooms: Float64Array;
  /** Price in lakh. */
  price: Float64Array;
  areaC: Float64Array;
  roomsC: Float64Array;
  priceC: Float64Array;
  /** Standardized area and bedrooms (population SD). */
  areaZ: Float64Array;
  roomsZ: Float64Array;
  means: { area: number; rooms: number; price: number };
  sds: { area: number; rooms: number };
}

export function makeHouses(seed: number, n: number = HOUSES_N): Houses {
  const count = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const rng = mulberry32((Math.imul(seed + 7, 0x9e3779b1) ^ 0x68a1c3) >>> 0);
  const area = new Float64Array(count);
  const rooms = new Float64Array(count);
  const price = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const z1 = normal(rng);
    const z2 = normal(rng);
    const z3 = normal(rng);
    area[i] = 1200 + 300 * z1;
    rooms[i] = 3 + (0.6 * z1 + 0.8 * z2);
    price[i] = 60 + 0.05 * (area[i]! - 1200) + 10 * (rooms[i]! - 3) + 8 * z3;
  }
  const mean = (v: Float64Array) => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i]!;
    return v.length ? s / v.length : 0;
  };
  const ma = mean(area);
  const mr = mean(rooms);
  const mp = mean(price);
  const areaC = area.map((v) => v - ma);
  const roomsC = rooms.map((v) => v - mr);
  const priceC = price.map((v) => v - mp);
  const sd = (v: Float64Array) => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
    return v.length ? Math.sqrt(s / v.length) || 1 : 1;
  };
  const sa = sd(areaC);
  const sr = sd(roomsC);
  return {
    n: count,
    area,
    rooms,
    price,
    areaC,
    roomsC,
    priceC,
    areaZ: areaC.map((v) => v / sa),
    roomsZ: roomsC.map((v) => v / sr),
    means: { area: ma, rooms: mr, price: mp },
    sds: { area: sa, rooms: sr },
  };
}

/** Rows of [area, bedrooms], centred (raw units) or standardized. */
export function houseRows(h: Houses, standardized: boolean): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < h.n; i++)
    out.push(standardized ? [h.areaZ[i]!, h.roomsZ[i]!] : [h.areaC[i]!, h.roomsC[i]!]);
  return out;
}

export function houseH(h: Houses, standardized: boolean): Mat2 {
  return Hessian2(houseRows(h, standardized));
}

/** Sample correlation of area and bedrooms. */
export function houseCorrelation(h: Houses): number {
  const Z = standardize(houseRows(h, false)).Z;
  const H = Hessian2(Z);
  return H[0][1];
}
