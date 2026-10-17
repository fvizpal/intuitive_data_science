import { useEffect, useState } from 'react';
import { createBankBuilder, type Bank } from './bank';

/**
 * Banks are built once per (seed, n) in a Web Worker (or, without workers, one degree per
 * idle callback) and kept in a small cache, so changing only the degree or the noise never
 * refits anything.
 */
const MAX_CACHED = 10;
const cache = new Map<string, Bank>();
const inflight = new Map<string, Promise<Bank>>();
const keyOf = (seed: number, n: number) => `${seed}:${n}`;

/** The bank if it is already built (never starts a build). */
export function peekBank(seed: number, n: number): Bank | null {
  return cache.get(keyOf(seed, n)) ?? null;
}

function remember(key: string, bank: Bank) {
  cache.delete(key);
  cache.set(key, bank);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
}

function viaIdle(seed: number, n: number): Promise<Bank> {
  return new Promise((resolve, reject) => {
    const builder = createBankBuilder(seed, n);
    const idle: (cb: () => void) => void =
      typeof requestIdleCallback === 'function'
        ? (cb) => requestIdleCallback(cb)
        : (cb) => setTimeout(cb, 0);
    const tick = () => {
      try {
        if (builder.step()) resolve(builder.result());
        else idle(tick);
      } catch (e) {
        reject(e);
      }
    };
    idle(tick);
  });
}

export function loadBank(seed: number, n: number): Promise<Bank> {
  const key = keyOf(seed, n);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = new Promise<Bank>((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      viaIdle(seed, n).then(resolve, reject);
      return;
    }
    try {
      const worker = new Worker(new URL('./bank.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<Bank>) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        viaIdle(seed, n).then(resolve, reject);
      };
      worker.postMessage({ seed, n });
    } catch {
      viaIdle(seed, n).then(resolve, reject);
    }
  }).then((bank) => {
    remember(key, bank);
    inflight.delete(key);
    return bank;
  });
  p.catch(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** The bank for (seed, n), or null while it is being built (show a skeleton meanwhile). */
export function useBank(seed: number, n: number): Bank | null {
  const [, bump] = useState(0);
  const ready = peekBank(seed, n);
  useEffect(() => {
    if (peekBank(seed, n)) return;
    let alive = true;
    void loadBank(seed, n).then(() => {
      if (alive) bump((x) => x + 1);
    });
    return () => {
      alive = false;
    };
  }, [seed, n]);
  return ready;
}
