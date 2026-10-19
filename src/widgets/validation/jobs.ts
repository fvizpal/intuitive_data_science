import { useEffect, useState } from 'react';
import { runJobNow, type JobKind, type JobTable } from './jobCore';

const MAX_CACHED = 24;
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const keyOf = (kind: string, args: unknown) => `${kind}:${JSON.stringify(args)}`;

export function peekJob<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'],
): JobTable[K]['result'] | null {
  return (cache.get(keyOf(kind, args)) as JobTable[K]['result'] | undefined) ?? null;
}

function viaIdle<K extends JobKind>(kind: K, args: JobTable[K]['args']) {
  return new Promise<JobTable[K]['result']>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(runJobNow(kind, args));
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
}

export function loadJob<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'],
): Promise<JobTable[K]['result']> {
  const key = keyOf(kind, args);
  if (cache.has(key)) return Promise.resolve(cache.get(key) as JobTable[K]['result']);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<JobTable[K]['result']>;
  const p = new Promise<JobTable[K]['result']>((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      viaIdle(kind, args).then(resolve, reject);
      return;
    }
    try {
      const worker = new Worker(new URL('./validation.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<JobTable[K]['result']>) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        viaIdle(kind, args).then(resolve, reject);
      };
      worker.postMessage({ kind, args });
    } catch {
      viaIdle(kind, args).then(resolve, reject);
    }
  }).then((result) => {
    cache.delete(key);
    cache.set(key, result);
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
    inflight.delete(key);
    return result;
  });
  p.catch(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** The job's result, or null while it runs (show a skeleton) or when `args` is null. */
export function useJob<K extends JobKind>(
  kind: K,
  args: JobTable[K]['args'] | null,
): JobTable[K]['result'] | null {
  const [, bump] = useState(0);
  const ready = args ? peekJob(kind, args) : null;
  const key = args ? keyOf(kind, args) : '';
  useEffect(() => {
    if (!args || peekJob(kind, args)) return;
    let alive = true;
    void loadJob(kind, args).then(() => {
      if (alive) bump((x) => x + 1);
    });
    return () => {
      alive = false;
    };
    // `key` stands for the arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key]);
  return ready;
}
