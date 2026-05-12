/**
 * Worker-side state accessors, factored out of `db-worker.ts` so registry
 * channel handlers in `src/shared/channels/` can read/write worker-local state
 * (current DB path, importInProgress flag) without taking a circular import on
 * the worker entry module.
 *
 * Production: `db-worker.ts` calls `_setWorkerStateAccessors({...})` once at
 * module init, wiring the closures to its own `let dbPath` / `let importInProgress`.
 * Registry handlers then call `getWorkerDbPath()` etc. at runtime.
 *
 * Tests: import `_setWorkerStateAccessors` with stub implementations to assert
 * handler behavior; `_resetWorkerStateAccessors()` clears state between tests.
 */

interface WorkerStateAccessors {
  getDbPath(): string | null;
  getImportInProgress(): boolean;
  setImportInProgress(v: boolean): void;
}

let accessors: WorkerStateAccessors | null = null;

/** Wire the state accessors. Called once by db-worker.ts at module init. */
export function _setWorkerStateAccessors(a: WorkerStateAccessors): void {
  accessors = a;
}

/** Test-only: clear accessors so each test starts from a known state. */
export function _resetWorkerStateAccessors(): void {
  accessors = null;
}

export function getWorkerDbPath(): string {
  if (!accessors) {
    throw new Error('[db-worker] state accessors not set — call _setWorkerStateAccessors() first');
  }
  const p = accessors.getDbPath();
  if (!p) throw new Error('[db-worker] DB path not set');
  return p;
}

export function getWorkerImportInProgress(): boolean {
  if (!accessors) return false;
  return accessors.getImportInProgress();
}

export function setWorkerImportInProgress(v: boolean): void {
  if (!accessors) {
    throw new Error('[db-worker] state accessors not set — call _setWorkerStateAccessors() first');
  }
  accessors.setImportInProgress(v);
}
