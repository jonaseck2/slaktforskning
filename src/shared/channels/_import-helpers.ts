/**
 * Shared lifecycle scaffolding for worker-thread import handlers.
 *
 * Every long-running import (Holger, GEDCOM, Genney, archive) needs:
 *   - flip importInProgress on at start (so other worker handlers can short-circuit)
 *   - emit [import-timing] start/total console logs for postmortem timing
 *   - catch errors, log a timing-tagged warning, and return { success: false, error }
 *   - clear importInProgress in a finally block
 *
 * Filename starts with `_` to signal this is a helpers module — not a
 * channel-domain file. The channel-registry walk in `index.ts` only imports
 * domain files (`persons.ts`, `import.ts`, …); helper files are pulled in by
 * those domain files explicitly.
 */

import { setWorkerImportInProgress } from '../../main/db-worker-state';

export interface ImportResult<R = unknown> {
  success: boolean;
  report?: R;
  error?: string;
}

/**
 * Wrap a worker-thread import handler with the standard lifecycle.
 *
 * `name` is the human label for timing logs (e.g. "holger", "gedcom", "genney").
 * `fn` runs the actual import and returns the report payload (NOT wrapped in
 * `{ success, report }` — this helper wraps it).
 *
 * Phase-specific timing logs (e.g. "bulkCopyMediaFolder done — 120ms") stay
 * inside `fn` — they're not boilerplate. Only the start/total bookends and
 * the success/error envelope live here.
 */
export async function withImportLifecycle<R>(
  name: string,
  fn: () => Promise<R>,
): Promise<ImportResult<R>> {
  const tHandler = Date.now();
  console.log(`[import-timing] ${name} handler start`);
  setWorkerImportInProgress(true);
  try {
    const report = await fn();
    console.log(`[import-timing] ${name} handler total — ${Date.now() - tHandler}ms`);
    return { success: true, report };
  } catch (err) {
    console.warn(
      `[import-timing] ${name} handler failed after ${Date.now() - tHandler}ms: ${err instanceof Error ? err.message : err}`,
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    setWorkerImportInProgress(false);
  }
}
