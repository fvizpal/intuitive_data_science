/// Builds the reality-check pool off the main thread. See pool.ts.
import { buildPool } from './pool';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = () => {
  const pool = buildPool();
  ctx.postMessage(pool, [pool.scores.buffer, pool.flags.buffer]);
};
