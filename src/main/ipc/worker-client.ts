import { Worker } from 'node:worker_threads';
import * as nodePath from 'node:path';

let worker: Worker | null = null;
let workerReady = false;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Calls queued while the worker is initializing
const callQueue: Array<() => void> = [];

// Callbacks for lifecycle acknowledgements
let switchedResolve: ((res: { ok: true } | { ok: false; error: string }) => void) | null = null;

type WorkerMsg =
  | { type: 'ready' }
  | { type: 'init-failed'; dbPath: string; error: string }
  | { type: 'switched' }
  | { type: 'switch-failed'; dbPath: string; error: string }
  | { type: 'broadcast'; topic: string; payload: unknown }
  | { id: number; result: unknown }
  | { id: number; error: string };

function sendCall(channel: string, args: unknown[]): Promise<unknown> {
  if (!worker) throw new Error('[db-worker] not started');
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, channel, args });
  });
}

/** Start the DB worker. Returns immediately; calls are queued until the worker is ready. */
export function startWorker(dbPath: string): void {
  const workerPath = nodePath.join(__dirname, 'db-worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (msg: WorkerMsg) => {
    if ('type' in msg) {
      if (msg.type === 'ready') {
        workerReady = true;
        // Flush any calls that arrived while starting up
        for (const fn of callQueue) fn();
        callQueue.length = 0;
      } else if (msg.type === 'init-failed') {
        // Worker failed to open the startup DB but stayed alive so it can
        // service db-switch later. Mark it ready (so call dispatch doesn't
        // hang forever) and let any queued calls fail with a clear error
        // until the user picks a recovery path.
        workerReady = true;
        for (const fn of callQueue) fn();
        callQueue.length = 0;
      } else if (msg.type === 'switched') {
        switchedResolve?.({ ok: true });
        switchedResolve = null;
      } else if (msg.type === 'switch-failed') {
        switchedResolve?.({ ok: false, error: msg.error });
        switchedResolve = null;
      } else if (msg.type === 'broadcast') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BrowserWindow } = require('electron');
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send(msg.topic, msg.payload);
        }
      }
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if ('error' in msg) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  });

  worker.on('error', (err) => {
    console.error('[db-worker] uncaught error:', err);
  });

  worker.on('exit', (code) => {
    if (code !== 0) console.error(`[db-worker] exited with code ${code}`);
    for (const p of pending.values()) p.reject(new Error(`Worker exited with code ${code}`));
    pending.clear();
    worker = null;
    workerReady = false;
  });

  worker.postMessage({ type: 'init', dbPath });
}

export function callWorker(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!worker) throw new Error('[db-worker] not started');
  if (workerReady) {
    return sendCall(channel, args);
  }
  // Queue until the worker signals ready
  return new Promise((resolve, reject) => {
    callQueue.push(() => {
      sendCall(channel, args).then(resolve, reject);
    });
  });
}

export function switchWorkerDb(newPath: string): Promise<void> {
  if (!worker) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    switchedResolve = (res) => {
      if (res.ok) resolve();
      else reject(new Error(res.error));
    };
    worker!.postMessage({ type: 'db-switch', dbPath: newPath });
  });
}

export function notifyWorkerImportStart(): void {
  worker?.postMessage({ type: 'import-start' });
}

export function notifyWorkerImportEnd(): void {
  worker?.postMessage({ type: 'import-end' });
}

export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  workerReady = false;
}
