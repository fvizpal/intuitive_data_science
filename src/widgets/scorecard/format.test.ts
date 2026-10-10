import { describe, expect, it } from 'vitest';
import {
  defaultsInWords,
  fmtPct,
  oddsFactorText,
  oddsText,
  riskBand,
  signedInt,
  signedNum,
} from './format';

describe('format', () => {
  it('reads odds the way people say them', () => {
    expect(oddsText(24)).toBe('24:1');
    expect(oddsText(12.5)).toBe('12.5:1');
    expect(oddsText(200)).toBe('200:1');
    expect(oddsText(0.5)).toBe('1:2');
  });

  it('writes odds factors with × and ÷', () => {
    expect(oddsFactorText(Math.log(1.9))).toBe('odds × 1.9');
    expect(oddsFactorText(-Math.log(2.3))).toBe('odds ÷ 2.3');
    expect(oddsFactorText(0.01)).toBe('odds unchanged');
  });

  it('puts default probabilities in plain words', () => {
    expect(defaultsInWords(1 / 51)).toBe('about 2 in 100 default');
    expect(defaultsInWords(0.0049)).toBe('about 4.9 in 1,000 default');
    expect(defaultsInWords(0.2)).toBe('about 20 in 100 default');
  });

  it('never prints NaN or Infinity', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const out of [
        fmtPct(bad),
        signedInt(bad),
        signedNum(bad),
        oddsText(bad),
        oddsFactorText(bad),
        defaultsInWords(bad),
        riskBand(bad),
      ]) {
        expect(out).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('uses a real minus sign', () => {
    expect(signedInt(-5)).toBe('−5');
    expect(signedInt(32)).toBe('+32');
    expect(signedNum(-0.004)).toBe('0.00');
  });
});
