/**
 * Worker-side `broadcast` helper, factored out of `db-worker.ts` so it can be
 * unit-tested without spawning a real Worker thread.
 *
 * Production: `db-worker.ts` calls `_setBroadcastTarget(parentPort)` once at
 * module init, then any worker-side handler can call `broadcast(topic, payload)`
 * to send an unsolicited `{ type: 'broadcast', topic, payload }` envelope back
 * to the main process. Main forwards each broadcast to every BrowserWindow
 * via `webContents.send(topic, payload)` (see `worker-client.ts`).
 *
 * Tests: import `_setBroadcastTarget` with a stub `{ postMessage }` to assert
 * the message shape; `_resetBroadcastTarget()` clears state between tests.
 */

interface BroadcastTarget {
  postMessage(msg: unknown): void;
}

let target: BroadcastTarget | null = null;

/** Wire the broadcast helper to a postMessage-capable port (typically `parentPort`). */
export function _setBroadcastTarget(t: BroadcastTarget): void {
  target = t;
}

/** Test-only: clear the target so each test starts from a known state. */
export function _resetBroadcastTarget(): void {
  target = null;
}

/**
 * Send an unsolicited topic-keyed event from the worker to the main process.
 * Main forwards this to every renderer.
 */
export function broadcast(topic: string, payload: unknown): void {
  if (!target) {
    throw new Error('[db-worker] broadcast target not set — call _setBroadcastTarget(parentPort) first');
  }
  target.postMessage({ type: 'broadcast', topic, payload });
}
