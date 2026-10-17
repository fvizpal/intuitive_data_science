/// Builds a bias-variance bank off the main thread. See bank.ts.
import { buildBank } from './bank';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ seed: number; n: number }>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  ctx.postMessage(buildBank(e.data.seed, e.data.n));
};
