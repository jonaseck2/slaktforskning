import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { defineChannel } from './registry';
import { importFromHolger } from '../../import/holger/index';
import { importFromGenney, discoverTables } from '../../import/genney/index';
import { importFromRootsMagic } from '../../import/rootsmagic/index';
import { bulkCopyMediaFolder, consolidateMediaFolder } from '../../api/media_consolidate';
import { getMediaDir } from '../../api/media';
import { broadcast } from '../../main/db-worker-broadcast';
import { getWorkerDbPath } from '../../main/db-worker-state';
import { withImportLifecycle } from './_import-helpers';
import { readGedcomFile, parseGedcom } from '../../gedcom';
import { importGedcom, previewGedcomImport } from '../../import/gedcom';
import type { ImportOptions } from '../../import/gedcom';
import { exportArchive } from '../../api/archive_export';
import { importArchive } from '../../api/archive_import';
import { exportGedcom } from '../../gedcom';
import type { ExportOptions } from '../../api/export_options';
import {
  exportPersonsCsv,
  exportEventsCsv,
  exportSourcesCsv,
  exportPlacesCsv,
} from '../../api/csv_export';
import type { CsvOptions } from '../../api/csv_export';

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
 * RootsMagic .rmgc import. Runs in the worker thread because the .rmgc
 * is opened as SQLite via the same node-sqlite3-wasm module the worker
 * already uses. Progress messages flow worker → main → all renderers via
 * the broadcast primitive on topic 'import:rootsmagicProgress'.
 */
defineChannel({
  name: 'import:rootsmagicRun',
  thread: 'worker',
  mutating: true,
  handler: async (db, opts: { sourcePath: string }) => {
    if (!opts?.sourcePath) {
      return { success: false, error: 'sourcePath is required' } as const;
    }
    return withImportLifecycle('rootsmagic', async () => {
      const dbPath = getWorkerDbPath();
      const result = await importFromRootsMagic(db, opts.sourcePath, {
        onProgress: (msg: string) => broadcast('import:rootsmagicProgress', { message: msg }),
      });
      // RootsMagic stores media file paths Windows-style ("C:\\..."); after
      // import, consolidate copies any reachable absolute paths into our
      // <dbname>-media/ and rewrites the refs. Idempotent for the typical
      // case where media is missing on this machine.
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
 * Archive (.zip) import — runs in the worker thread. The public `archive:import`
 * channel stays on the main thread because it opens an Electron file dialog;
 * the main-thread shim resolves the picked path and delegates the heavy DB +
 * media work here. The `:_` prefix marks this as an internal channel — the
 * preload/static-api coverage tests skip it.
 */
defineChannel({
  name: 'archive:_importRun',
  thread: 'worker',
  mutating: true,
  handler: async (db, opts: { archivePath: string; mediaDir: string }) => {
    if (!opts?.archivePath || !opts?.mediaDir) {
      return { success: false, error: 'archivePath and mediaDir are required' } as const;
    }
    return withImportLifecycle('archive', async () => {
      const dbPath = getWorkerDbPath();
      const report = importArchive(db, opts.archivePath, opts.mediaDir);
      await consolidateMediaFolder(db, dbPath);
      return { imported: true, filePath: opts.archivePath, report };
    });
  },
});

/**
 * Archive (.zip) export — runs in the worker thread. Read-only with respect
 * to the DB (it reads the entire DB to build a GEDCOM + media archive on disk),
 * so it does NOT use `withImportLifecycle`. The public `archive:export` channel
 * stays on the main thread for the dialog.
 */
defineChannel({
  name: 'archive:_exportRun',
  thread: 'worker',
  mutating: false,
  handler: async (db, opts: { filePath: string; gedcomVersion?: '5.5.1' | '7.0' }) => {
    if (!opts?.filePath) {
      return { canceled: true } as const;
    }
    const dbPath = getWorkerDbPath();
    const dbDir = path.dirname(dbPath);
    const version = opts.gedcomVersion ?? '5.5.1';
    const report = exportArchive(db, opts.filePath, dbDir, { gedcomVersion: version });
    return { exported: true, filePath: opts.filePath, report };
  },
});

/**
 * GEDCOM export — runs in the worker thread. Read-only with respect to the DB
 * (it walks every person/family/event/source/media to produce a `.ged` string),
 * so it does NOT use `withImportLifecycle`. The public `gedcom:export` channel
 * stays on the main thread for the save dialog + the final fs.writeFile; only
 * the heavy DB walk runs here.
 */
defineChannel({
  name: 'gedcom:_exportRun',
  thread: 'worker',
  mutating: false,
  handler: async (db, opts: { version?: '5.5.1' | '7.0'; exportOptions?: ExportOptions }) => {
    const version = opts?.version === '7.0' ? '7.0' : '5.5.1';
    const { ged, report } = exportGedcom(db, version, opts?.exportOptions);
    return { ged, report };
  },
});

/**
 * CSV export — runs in the worker thread. Read-only with respect to the DB
 * (it walks one entity table to produce a CSV string), so it does NOT use
 * `withImportLifecycle`. The public `csv:export` channel stays on the main
 * thread for the save dialog + the final fs.writeFile; only the heavy DB
 * walk runs here. Returns both the CSV text and the suggested defaultName so
 * the shim can pre-populate the save dialog.
 */
defineChannel({
  name: 'csv:_exportRun',
  thread: 'worker',
  mutating: false,
  handler: async (
    db,
    opts: { entityType?: string; delimiter?: string; encoding?: 'utf-8' | 'utf-8-bom' },
  ) => {
    if (!opts?.entityType) {
      return { error: 'entityType is required' } as const;
    }
    const csvOptions: CsvOptions = {
      delimiter: opts.delimiter ?? ',',
      encoding: opts.encoding ?? 'utf-8',
    };
    let csv: string;
    let defaultName: string;
    switch (opts.entityType) {
      case 'persons':
        csv = exportPersonsCsv(db, csvOptions);
        defaultName = 'persons.csv';
        break;
      case 'events':
        csv = exportEventsCsv(db, csvOptions);
        defaultName = 'events.csv';
        break;
      case 'sources':
        csv = exportSourcesCsv(db, csvOptions);
        defaultName = 'sources.csv';
        break;
      case 'places':
        csv = exportPlacesCsv(db, csvOptions);
        defaultName = 'places.csv';
        break;
      default:
        return { error: 'Unknown entityType: ' + opts.entityType } as const;
    }
    return { csv, defaultName };
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
