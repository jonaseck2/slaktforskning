import * as duplicates from '../../api/duplicates';
import type { WrapHandlerFn } from './wrap-handler';
import type { getDatabase } from '../database';

/**
 * Registers main-thread-only duplicates IPC handlers.
 *
 * Most duplicate-finding/ignore/merge operations are pure DB ops registered
 * via the channel registry in `src/shared/channels/duplicates.ts`. The single
 * exception is `mergeMedia`, which performs synchronous filesystem work
 * (delete on success, snapshot bytes for undo) and therefore must NOT run on
 * the DB worker thread (see .claude/rules/api.md "Worker-thread sync I/O").
 *
 * Lives on the main thread, mirroring how `media:attach` and `media:openFile`
 * are wired in `src/main/ipc/media.ts`. Listed in MAIN_THREAD_ONLY_CHANNELS in
 * `tests/unit/ipc-worker-coverage.test.ts`.
 */
export function registerDuplicatesHandlers(
  getDb: () => ReturnType<typeof getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  wrapHandler('duplicates:mergeMedia', (...args: unknown[]) => {
    const [targetId, sourceId, keepFile] = args as [string, string, 'target' | 'source'];
    return duplicates.mergeMedia(getDb(), targetId, sourceId, keepFile, {
      dbPath: getCurrentDatabasePath(),
    });
  });
}
