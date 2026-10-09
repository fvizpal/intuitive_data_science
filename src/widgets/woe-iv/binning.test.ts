import { describe, expect, it } from 'vitest';
import {
  MAX_BINS,
  addSplit,
  edgeToMerge,
  moveEdge,
  normalizeEdges,
  presetEqualCount,
  presetEqualWidth,
  removeEdge,
  snapEdge,
} from './binning';
import type { EdgeSpace } from './binning';

const space: EdgeSpace = { lo: 300, hiDisp: 800, step: 5, decimals: 0 };
const values = Array.from({ length: 1000 }, (_, i) => 300 + (i / 999) * 500);

describe('snapEdge and normalizeEdges', () => {
  it('snaps to the feature step', () => {
    expect(snapEdge(582.4, space)).toBe(580);
    expect(snapEdge(583, space)).toBe(585);
    expect(snapEdge(2.74, { lo: 0, hiDisp: 10, step: 0.5, decimals: 1 })).toBe(2.5);
  });

  it('sorts, de-duplicates and drops edges outside the editable range', () => {
    expect(normalizeEdges([600, 500, 501, 300, 900, 500], space)).toEqual([500, 600]);
  });
});

describe('moveEdge', () => {
  it('clamps between neighbours', () => {
    const inner = [400, 500, 600];
    expect(moveEdge(inner, 1, 900, space)).toEqual([400, 595, 600]);
    expect(moveEdge(inner, 1, 100, space)).toEqual([400, 405, 600]);
    expect(moveEdge(inner, 2, 9999, space)).toEqual([400, 500, 795]);
    expect(moveEdge(inner, 0, 0, space)).toEqual([305, 500, 600]);
  });
});

describe('removeEdge', () => {
  it('removes an edge but never goes below two bins', () => {
    expect(removeEdge([400, 500], 0)).toEqual([500]);
    expect(removeEdge([500], 0)).toEqual([500]);
  });
});

describe('presets', () => {
  it('equal width gives evenly spaced edges', () => {
    expect(presetEqualWidth(5, space)).toEqual([400, 500, 600, 700]);
  });

  it('equal count follows the data', () => {
    expect(presetEqualCount(values, 4, space)).toEqual([425, 550, 675]);
  });
});

describe('addSplit', () => {
  it('splits the widest bin at its median', () => {
    expect(addSplit([400], values, 800, space)).toEqual([400, 600]);
  });

  it('stops at the maximum number of bins', () => {
    const many = [350, 400, 450, 500, 550, 600, 650];
    expect(many.length + 1).toBe(MAX_BINS);
    expect(addSplit(many, values, 800, space)).toEqual(many);
  });
});

describe('edgeToMerge', () => {
  it('picks the edge between the two smallest neighbouring bins', () => {
    expect(edgeToMerge([500, 20, 30, 400])).toBe(1);
    expect(edgeToMerge([10, 10, 900])).toBe(0);
  });
});
