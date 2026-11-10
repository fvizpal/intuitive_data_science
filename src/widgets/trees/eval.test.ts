import { describe, expect, it } from 'vitest';
import { bayesAccuracyFruit, makeFruit } from './data';
import {
  accuracyByDepth,
  fitReadingTree,
  freshFruit,
  meanPairDisagreement,
  MEMORIZE_GAP,
  TOO_SIMPLE_BELOW_BEST,
  TOO_SIMPLE_MAX_GAP,
  trainSeed,
} from './eval';
import { growTree, leafCount, UNLIMITED } from './tree';

describe('15. fresh data', () => {
  it('is identical across calls', () => {
    expect(freshFruit(7)).toBe(freshFruit(7));
    expect(freshFruit(7).X.length).toBe(5000);
    expect(freshFruit(7).X).toEqual(makeFruit(1007, 5000).X);
  });
});

describe('10. instability', () => {
  it('first split and disagreement', () => {
    let shade = 0;
    let weight = 0;
    for (let r = 0; r < 100; r++) {
      const { X, y } = makeFruit(trainSeed(1, r), 60);
      const t = growTree(X, y, { maxDepth: UNLIMITED });
      if (t.nodes[0]!.split!.feature === 1) shade++;
      else weight++;
    }
    const unl = meanPairDisagreement(1, 60, UNLIMITED, 1);
    const d1 = meanPairDisagreement(1, 60, 1, 1);
    const d3 = meanPairDisagreement(1, 60, 3, 1);
    console.log(
      'REPORT instability: first split shade',
      shade,
      '% weight',
      weight,
      '% | disagreement unlimited',
      unl.toFixed(3),
      'depth 3',
      d3.toFixed(3),
      'depth 1',
      d1.toFixed(3),
    );
    expect(shade).toBeGreaterThanOrEqual(50);
    expect(weight).toBeGreaterThanOrEqual(5);
    expect(unl).toBeGreaterThanOrEqual(0.08);
    expect(d1).toBeLessThan(unl);
  });
});

describe('11. overfitting', () => {
  const a60 = accuracyByDepth(1, 60, 1);
  const a60b = accuracyByDepth(1, 60, 10);
  const a200 = accuracyByDepth(1, 200, 1);
  it('report', () => {
    const f = (v: number) => v.toFixed(3);
    console.log(
      'REPORT accuracy n=60 minLeaf 1: train d1/3/12',
      f(a60.meanTrain[0]!),
      f(a60.meanTrain[2]!),
      f(a60.meanTrain[11]!),
      '| new d1/3/12',
      f(a60.meanNew[0]!),
      f(a60.meanNew[2]!),
      f(a60.meanNew[11]!),
      '| bestDepth n=60',
      a60.bestDepth,
      'n=200',
      a200.bestDepth,
      '| depth 12 new minLeaf 10',
      f(a60b.meanNew[11]!),
      'vs minLeaf 1',
      f(a60.meanNew[11]!),
      '| bayes',
      f(bayesAccuracyFruit()),
    );
  });
  it('memorizes at depth 12', () => {
    expect(a60.meanTrain[11]!).toBeGreaterThanOrEqual(0.99);
    expect(Math.max(...a60.meanNew) - a60.meanNew[11]!).toBeGreaterThanOrEqual(0.03);
  });
  it('sweet spot is shallow', () => {
    expect(a60.bestDepth).toBeGreaterThanOrEqual(1);
    expect(a60.bestDepth).toBeLessThanOrEqual(4);
    expect(Math.abs(a60.meanNew[0]! - 0.77)).toBeLessThan(0.04);
    const best = Math.max(...a60.meanNew);
    expect(best).toBeLessThan(bayesAccuracyFruit() + 0.01);
    expect(best).toBeGreaterThan(0.72);
  });
  it('leash and more data', () => {
    expect(a60b.meanNew[11]!).toBeGreaterThan(a60.meanNew[11]!);
    expect(a200.bestDepth).toBeGreaterThanOrEqual(a60.bestDepth);
  });
  it('reading chip constants', () => {
    console.log('REPORT fitReadingTree constants', {
      MEMORIZE_GAP,
      TOO_SIMPLE_BELOW_BEST,
      TOO_SIMPLE_MAX_GAP,
    });
    const best = bayesAccuracyFruit();
    const read = (d: number) =>
      fitReadingTree({
        train: a60.meanTrain[d - 1]!,
        newData: a60.meanNew[d - 1]!,
        best,
      });
    expect(read(1)).toBe('too simple');
    expect(read(2)).toBe('a fair fit');
    expect(read(3)).toBe('a fair fit');
    for (let d = 7; d <= 12; d++) expect(read(d)).toBe('memorizing');
    expect(fitReadingTree({ train: NaN, newData: 0.7, best })).toBe('a fair fit');
  });
  it('is deterministic and finite', () => {
    const again = accuracyByDepth(1, 60, 1);
    expect(again.meanNew).toEqual(a60.meanNew);
    for (const v of [...a60.meanNew, ...a60.meanTrain])
      expect(Number.isFinite(v)).toBe(true);
    expect(
      leafCount(growTree(...(Object.values(makeFruit(1, 60)) as [number[][], number[]]))),
    ).toBeGreaterThan(1);
  });
});
