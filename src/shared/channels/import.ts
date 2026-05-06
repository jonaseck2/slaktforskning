import { defineChannel } from './registry';
import { importFromHolger } from '../../import/holger/index';
import { bulkCopyMediaFolder, consolidateMediaFolder } from '../../api/media_consolidate';
import { getMediaDir } from '../../api/media';
import { broadcast } from '../../main/db-worker-broadcast';
import { getWorkerDbPath } from '../../main/db-worker-state';
import { withImportLifecycle } from './_import-helpers';

defineChannel({
  name: 'import:holgerRun',
  thread: 'worker',
  mutating: true,
  handler: async (db, opts: { sourcePath: string; mediaDir?: string }) => {
    if (!opts?.sourcePath) {
      return { success: false, error: 'sourcePath is required' } as const;
    }

    return withImportLifecycle('holger', async () => {
      // Worker-local DB path (set on init / db-switch by db-worker.ts).
      const dbPath = getWorkerDbPath();

      // Bulk-copy the media folder up-front. fsp.cp recursive walks + copies
      // through libuv much faster than 12k sequential per-row copyFile calls.
      // After this, consolidateMediaFolder fast-paths every row that lands here.
      let bulkCopiedFromDir: string | undefined;
      if (opts.mediaDir) {
        try {
          const { ms } = await bulkCopyMediaFolder(opts.mediaDir, getMediaDir(dbPath));
          bulkCopiedFromDir = opts.mediaDir;
          console.log(`[import-timing] bulkCopyMediaFolder done — ${ms}ms`);
        } catch (err) {
          console.warn(
            `[import-timing] bulkCopyMediaFolder failed (will fall back to per-row copy): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const tHolger = Date.now();
      const result = await importFromHolger(db, {
        sourcePath: opts.sourcePath,
        mediaDir: opts.mediaDir,
        // Progress messages flow worker → main → all renderers via the
        // broadcast primitive added in Task 1. Renderer listeners on
        // 'import:holgerProgress' (registered via window.api.import.onHolgerProgress)
        // are unchanged.
        onProgress: (msg: string) => broadcast('import:holgerProgress', { message: msg }),
      });
      console.log(`[import-timing] importFromHolger done — ${Date.now() - tHolger}ms`);

      const tConsol = Date.now();
      const consolResult = await consolidateMediaFolder(db, dbPath, bulkCopiedFromDir);
      console.log(
        `[import-timing] consolidateMediaFolder done — ${Date.now() - tConsol}ms — copied=${consolResult.copied} skipped=${consolResult.skipped} missing=${consolResult.missing}`,
      );

      return result.report;
    });
  },
});
