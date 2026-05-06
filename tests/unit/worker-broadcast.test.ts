/**
 * Unit-test the worker-side `broadcast` helper in isolation.
 *
 * `src/main/db-worker.ts` itself cannot be imported from a test: the module's
 * top-level `if (!parentPort) throw …` guard fires at import time (parentPort
 * is null outside a real Worker), and the file imports node-sqlite3-wasm and
 * the full channel registry. So `broadcast` lives in a tiny sibling module
 * `src/main/db-worker-broadcast.ts` that takes the parentPort-shaped target
 * via a setter — testable without spawning a Worker, then re-exported from
 * db-worker.ts for the production caller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { broadcast, _setBroadcastTarget, _resetBroadcastTarget } from '../../src/main/db-worker-broadcast';

describe('worker broadcast helper', () => {
  beforeEach(() => {
    _resetBroadcastTarget();
  });

  it('posts { type: "broadcast", topic, payload } to the parentPort target', () => {
    const posted: unknown[] = [];
    _setBroadcastTarget({ postMessage: (msg: unknown) => posted.push(msg) });

    broadcast('import:holgerProgress', { message: 'hello' });

    expect(posted).toEqual([
      { type: 'broadcast', topic: 'import:holgerProgress', payload: { message: 'hello' } },
    ]);
  });

  it('forwards arbitrary topic + payload pairs', () => {
    const posted: unknown[] = [];
    _setBroadcastTarget({ postMessage: (msg: unknown) => posted.push(msg) });

    broadcast('export:progress', { step: 3, total: 10 });
    broadcast('website:progress', null);

    expect(posted).toEqual([
      { type: 'broadcast', topic: 'export:progress', payload: { step: 3, total: 10 } },
      { type: 'broadcast', topic: 'website:progress', payload: null },
    ]);
  });

  it('throws if no broadcast target has been set', () => {
    expect(() => broadcast('any:topic', {})).toThrow(/broadcast target/i);
  });
});
