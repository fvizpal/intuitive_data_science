/** Heavy jobs for the memorizing widget. Pure TypeScript so tests and the worker share it. */
import { makeFruit } from './data';
import {
  MAX_DEPTH,
  accuracyByDepth,
  disagreementByDepth,
  trainSeed,
  type DepthCurves,
} from './eval';
import { UNLIMITED, growTree, lighten, type LightTree } from './tree';

export interface Sample {
  X: number[][];
  y: number[];
  tree: LightTree;
}

export interface PanelC {
  samples: Sample[];
  /** Mean disagreement of 30 pairs; entry d - 1 is depth d, the last entry is no limit. */
  disagree: number[];
}

export interface JobTable {
  curves: { args: { seed: number; n: number; minLeaf: number }; result: DepthCurves };
  panelC: {
    args: { seed: number; n: number; minLeaf: number; batch: number };
    result: PanelC;
  };
}
export type JobKind = keyof JobTable;

export function runJobNow<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'],
): JobTable[K]['result'] {
  if (kind === 'curves') {
    const a = args as JobTable['curves']['args'];
    return accuracyByDepth(a.seed, a.n, a.minLeaf) as JobTable[K]['result'];
  }
  const a = args as JobTable['panelC']['args'];
  const samples: Sample[] = [];
  for (let k = 0; k < 6; k++) {
    const { X, y } = makeFruit(trainSeed(a.seed, 1000 + a.batch * 6 + k), a.n);
    const tree = growTree(X, y, { maxDepth: UNLIMITED, minLeaf: a.minLeaf });
    samples.push({ X, y, tree: lighten(tree) });
  }
  const result: PanelC = {
    samples,
    disagree: disagreementByDepth(a.seed, a.n, a.minLeaf, 30, MAX_DEPTH),
  };
  return result as JobTable[K]['result'];
}
