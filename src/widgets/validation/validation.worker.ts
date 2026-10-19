/// Runs the heavy cross-validation and repeat jobs off the main thread. See jobs.ts.
import { runJobNow, type JobKind, type JobTable } from './jobCore';

const ctx = self as unknown as {
  onmessage:
    | ((e: MessageEvent<{ kind: JobKind; args: JobTable[JobKind]['args'] }>) => void)
    | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  ctx.postMessage(runJobNow(e.data.kind, e.data.args));
};
