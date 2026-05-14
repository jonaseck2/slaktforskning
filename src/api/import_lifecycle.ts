/**
 * Shared lifecycle scaffolding for import handlers.
 *
 * Every long-running import (Holger, GEDCOM, Genney, archive) needs:
 *   - flip importInProgress on at start (so other handlers can short-circuit)
 *   - emit [import-timing] start/total console logs for postmortem timing
 *   - catch errors, log a timing-tagged warning, and return { success: false, error }
 *   - clear importInProgress in a finally block
 *
 * In the Tauri build importers run in the renderer; the lifecycle flag is held
 * on the renderer-local `_importInProgress` in `tauri-window-api.ts`. The shape
 * here used to live in `src/shared/channels/_import-helpers.ts` (Electron-era
 * worker channels) — relocated to `src/api/` after the Specta migration deleted
 * the channel registry.
 */
import { setWorkerImportInProgress } from '../shared/db-worker-state';

export interface ImportResult<R = unknown> {
  success: boolean;
  report?: R;
  error?: string;
}

/**
 * Wrap an import handler with the standard lifecycle.
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
