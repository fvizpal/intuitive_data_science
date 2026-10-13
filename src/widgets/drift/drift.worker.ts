/// Builds the real-scorecard drift data off the main thread. See realData.ts.
import { buildRealData } from './realData';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = () => {
  const d = buildRealData();
  ctx.postMessage(d, [
    d.poolScores.buffer,
    d.poolFlags.buffer,
    d.baseScores.buffer,
    d.baseFlags.buffer,
  ]);
};
