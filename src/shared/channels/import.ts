import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { defineChannel } from './registry';
import { importFromHolger } from '../../import/holger/index';
import { importFromGenney, discoverTables } from '../../import/genney/index';
import { bulkCopyMediaFolder, consolidateMediaFolder } from '../../api/media_consolidate';
import { getMediaDir } from '../../api/media';
import { broadcast } from '../../main/db-worker-broadcast';
import { getWorkerDbPath } from '../../main/db-worker-state';
import { withImportLifecycle } from './_import-helpers';
import { readGedcomFile, parseGedcom } from '../../gedcom';
import { importGedcom, previewGedcomImport } from '../../import/gedcom';
import type { ImportOptions } from '../../import/gedcom';

/**
 * If `selectedPath` is a .zip, extract the largest .ged into a fresh tmp dir
 * and return both the extracted .ged path and the tmp dir (so the caller can
 * clean it up). Otherwise return the input path and a null cleanup target.
 *
 * Worker-side equivalent of the inline-extract logic that used to live in
 * src/main/ipc/import.ts gedcom:preview / gedcom:import handlers.
 */
function extractGedFromMaybeZip(selectedPath: string): { gedPath: string; tmpDir: string | null } {
  if (path.extname(selectedPath).toLowerCase() !== '.zip') {
    return { gedPath: selectedPath, tmpDir: null };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-zip-'));
  const entries = unzipSync(new Uint8Array(fs.readFileSync(selectedPath)));
  const gedEntries = Object.entries(entries)
    .filter(([name]) => name.toLowerCase().endsWith('.ged'))
    .sort(([, a], [, b]) => b.length - a.length);
  if (gedEntries.length === 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('No .ged file found inside zip archive.');
  }
  const gedPath = path.join(tmpDir, path.basename(gedEntries[0][0]));
  fs.writeFileSync(gedPath, Buffer.from(gedEntries[0][1]));
  return { gedPath, tmpDir };
}

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

/**
 * Standard GEDCOM import (.ged or .zip-containing-.ged). Runs in the worker
 * thread so the main thread stays responsive for the full duration. The
 * inline-dialog fallback that lived in the old main-thread handler is
 * removed: the renderer pairs this with `gedcom:selectFile` + `gedcom:preview`
 * (the documented flow) and always supplies `filePath`.
 */
defineChannel({
  name: 'gedcom:import',
  thread: 'worker',
  mutating: true,
  handler: async (db, opts: { filePath: string; mediaDir?: string; profile?: ImportOptions['profile'] }) => {
    if (!opts?.filePath) {
      return { success: false, error: 'filePath is required' } as const;
    }
    return withImportLifecycle('gedcom', async () => {
      const dbPath = getWorkerDbPath();
      const { gedPath, tmpDir } = extractGedFromMaybeZip(opts.filePath);
      try {
        const text = readGedcomFile(gedPath);
        const tree = parseGedcom(text);
        const report = importGedcom(db, tree, {
          mediaDir: opts.mediaDir,
          profile: opts.profile,
        });
        await consolidateMediaFolder(db, dbPath);
        return report;
      } finally {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  },
});

/**
 * Genney Derby / .gcc / .backup import. Runs in the worker thread so the main
 * thread stays responsive for the full duration (Derby extraction can take
 * minutes on first run while Docker pulls the image; large databases take
 * tens of seconds to transform). Progress messages flow worker → main → all
 * renderers via the broadcast primitive on topic 'import:genneyProgress'.
 *
 * The renderer reads `result.success` (envelope) and `result.report.{summary,
 * gedcomFallback, gedcomPath}` (the inner payload).
 */
defineChannel({
  name: 'import:genneyRun',
  thread: 'worker',
  mutating: true,
  handler: async (db, opts: { sourcePath: string; schema?: string; mediaDir?: string }) => {
    if (!opts?.sourcePath) {
      return { success: false, error: 'sourcePath is required' } as const;
    }
    return withImportLifecycle('genney', async () => {
      const dbPath = getWorkerDbPath();
      // .backup archives bundle a media/ dir — copy it alongside the DB so
      // file_refs survive tempDir cleanup.
      const isBackup = opts.sourcePath.toLowerCase().endsWith('.backup');
      const destMediaDir = isBackup ? getMediaDir(dbPath) : undefined;

      const result = await importFromGenney(db, opts.sourcePath, {
        schema: opts.schema,
        mediaDir: opts.mediaDir,
        destMediaDir,
        onProgress: (msg: string) => broadcast('import:genneyProgress', { message: msg }),
      });

      if (result.gedcomFallbackPath) {
        return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
      }

      await consolidateMediaFolder(db, dbPath);
      return { imported: true, summary: result.summary };
    });
  },
});

/**
 * Pre-import inspection of a Genney source (Derby dir / .gcc / .backup).
 * Read-only — does not flip importInProgress and does not run through
 * withImportLifecycle. Progress flows via broadcast so the renderer can
 * display Docker-pull / extraction status.
 */
defineChannel({
  name: 'import:genneyDiscover',
  thread: 'worker',
  mutating: false,
  handler: async (_db, opts: { sourcePath: string; schema?: string }) => {
    if (!opts?.sourcePath) {
      return { error: 'sourcePath is required' } as const;
    }
    const tables = await discoverTables(opts.sourcePath, {
      schema: opts.schema,
      onProgress: (msg: string) => broadcast('import:genneyProgress', { message: msg }),
    });
    return { tables };
  },
});

/**
 * Preview a GEDCOM file (.ged or .zip) without writing to the DB. The renderer
 * pairs this with `gedcom:selectFile` and supplies `filePath`. Read-only — does
 * not flip importInProgress.
 */
defineChannel({
  name: 'gedcom:preview',
  thread: 'worker',
  mutating: false,
  handler: async (_db, opts: { filePath: string }) => {
    if (!opts?.filePath) {
      return { canceled: true } as const;
    }
    const { gedPath, tmpDir } = extractGedFromMaybeZip(opts.filePath);
    try {
      const text = readGedcomFile(gedPath);
      const tree = parseGedcom(text);
      const preview = previewGedcomImport(tree);
      return { canceled: false, filePath: opts.filePath, preview };
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
});
