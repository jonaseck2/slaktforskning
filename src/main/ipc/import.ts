import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { dialog, BrowserWindow } from 'electron';
import { unzipSync } from 'fflate';
import { previewGedcomImport } from '../../import/gedcom';
import type { ImportOptions } from '../../import/gedcom';
import { readGedcomFile, parseGedcom, importGedcom, exportGedcom } from '../../gedcom';
import { importFromGenney, discoverTables, isDockerAvailable } from '../../import/genney/index';
import { importFromHolger } from '../../import/holger/index';
import { exportArchive } from '../../api/archive_export';
import { importArchive } from '../../api/archive_import';
import * as media from '../../api/media';
import { consolidateMediaFolder, bulkCopyMediaFolder } from '../../api/media_consolidate';
import type { ExportOptions } from '../../api/export_options';
import type { WrapHandlerFn } from './wrap-handler';
import { mediaFolderName } from './media';
import { notifyWorkerImportStart, notifyWorkerImportEnd } from './worker-client';

let importInProgress = false;

export function isImportInProgress(): boolean {
  return importInProgress;
}

export function registerImportHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // Use database directory as default for all file dialogs
  const getDefaultDir = () => path.dirname(getCurrentDatabasePath());

  // GEDCOM
  wrapHandler('gedcom:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select GEDCOM File',
      defaultPath: getDefaultDir(),
      filters: [{ name: 'GEDCOM Files', extensions: ['ged', 'gedcom', 'zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('gedcom:preview', async (opts) => {
    const options = opts as { filePath?: string } | undefined;
    let selectedPath: string;
    if (options?.filePath) {
      selectedPath = options.filePath;
    } else {
      const result = await dialog.showOpenDialog({
        title: 'Preview GEDCOM File',
        defaultPath: getDefaultDir(),
        filters: [{ name: 'GEDCOM Files', extensions: ['ged', 'gedcom', 'zip'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return { canceled: true };
      selectedPath = result.filePaths[0];
    }
    let tmpDir: string | null = null;
    try {
      let gedPath = selectedPath;
      if (path.extname(gedPath).toLowerCase() === '.zip') {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-preview-'));
        const entries = unzipSync(new Uint8Array(fs.readFileSync(gedPath)));
        const gedEntries = Object.entries(entries)
          .filter(([name]) => name.toLowerCase().endsWith('.ged'))
          .sort(([, a], [, b]) => b.length - a.length);
        if (gedEntries.length === 0) throw new Error('No .ged file found inside zip archive.');
        gedPath = path.join(tmpDir, path.basename(gedEntries[0][0]));
        fs.writeFileSync(gedPath, Buffer.from(gedEntries[0][1]));
      }
      const text = readGedcomFile(gedPath);
      const tree = parseGedcom(text);
      const preview = previewGedcomImport(tree);
      return { canceled: false, filePath: selectedPath, preview };
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  wrapHandler('gedcom:import', async (opts) => {
    const options = opts as (ImportOptions & { filePath?: string }) | undefined;
    let selectedPath: string;
    if (options?.filePath) {
      selectedPath = options.filePath;
    } else {
      const result = await dialog.showOpenDialog({
        title: 'Import GEDCOM File',
        defaultPath: getDefaultDir(),
        filters: [{ name: 'GEDCOM Files', extensions: ['ged', 'gedcom', 'zip'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return { canceled: true };
      selectedPath = result.filePaths[0];
    }
    importInProgress = true;
    notifyWorkerImportStart();
    let tmpDir: string | null = null;
    try {
      let gedPath = selectedPath;
      if (path.extname(gedPath).toLowerCase() === '.zip') {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-import-'));
        const entries = unzipSync(new Uint8Array(fs.readFileSync(gedPath)));
        const gedEntries = Object.entries(entries)
          .filter(([name]) => name.toLowerCase().endsWith('.ged'))
          .sort(([, a], [, b]) => b.length - a.length);
        if (gedEntries.length === 0) throw new Error('No .ged file found inside zip archive.');
        gedPath = path.join(tmpDir, path.basename(gedEntries[0][0]));
        fs.writeFileSync(gedPath, Buffer.from(gedEntries[0][1]));
      }
      const text = readGedcomFile(gedPath);
      const tree = parseGedcom(text);
      const report = importGedcom(getDb(), tree, options);
      await consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { imported: true, filePath: gedPath, report };
    } finally {
      importInProgress = false;
      notifyWorkerImportEnd();
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  wrapHandler('gedcom:export', async (opts?: unknown) => {
    const typedOpts = opts as { version?: string; exportOptions?: ExportOptions } | undefined;
    const version = typedOpts?.version === '7.0' ? '7.0' : '5.5.1';
    const exportOptions = typedOpts?.exportOptions;
    const fileName = version === '7.0' ? 'family-tree-70.ged' : 'family-tree.ged';
    const result = await dialog.showSaveDialog({
      title: 'Export GEDCOM File',
      defaultPath: path.join(getDefaultDir(), fileName),
      filters: [{ name: 'GEDCOM Files', extensions: ['ged'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const { ged, report } = exportGedcom(getDb(), version, exportOptions);
    fs.writeFileSync(result.filePath, ged, 'utf-8');
    return { exported: true, filePath: result.filePath, report };
  });

  // Genney Derby import
  wrapHandler('import:genneyCheckDocker', () => {
    return { available: isDockerAvailable() };
  });

  wrapHandler('import:genneySelectDerby', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Välj Genney Derby-databasmapp',
      defaultPath: getDefaultDir(),
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneySelectArchive', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Välj Genney-arkivfil (.gcc, .backup)',
      defaultPath: getDefaultDir(),
      filters: [{ name: 'Genney-arkiv', extensions: ['gcc', 'backup', 'zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneySelectMedia', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Genney media folder (optional)',
      defaultPath: getDefaultDir(),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneyDiscover', async (opts) => {
    const options = opts as { sourcePath: string; schema?: string } | undefined;
    if (!options?.sourcePath) return { error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    const tables = await discoverTables(options.sourcePath, {
      schema: options.schema,
      onProgress: (msg) => {
        if (win) win.webContents.send('import:genneyProgress', { message: msg });
      },
    });
    return { tables };
  });

  wrapHandler('import:genneyRun', async (opts) => {
    const options = opts as { sourcePath: string; schema?: string; mediaDir?: string } | undefined;
    if (!options?.sourcePath) return { error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    // .backup archives bundle a media/ dir — copy it alongside the DB so file_refs survive
    const isBackup = options.sourcePath.toLowerCase().endsWith('.backup');
    const destMediaDir = isBackup
      ? media.getMediaDir(getCurrentDatabasePath())
      : undefined;
    importInProgress = true;
    notifyWorkerImportStart();
    try {
      const result = await importFromGenney(getDb(), options.sourcePath, {
        schema: options.schema,
        mediaDir: options.mediaDir,
        destMediaDir,
        onProgress: (msg) => {
          if (win) win.webContents.send('import:genneyProgress', { message: msg });
        },
      });
      if (result.gedcomFallbackPath) {
        return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
      }
      await consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { imported: true, summary: result.summary };
    } finally {
      importInProgress = false;
      notifyWorkerImportEnd();
    }
  });

  // Holger / OurKind GEDCOM import
  wrapHandler('import:holgerSelectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Holger GEDCOM export',
      defaultPath: getDefaultDir(),
      properties: ['openFile'],
      filters: [
        { name: 'GEDCOM / Zip', extensions: ['ged', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:holgerSelectMedia', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select OurKind Media folder (optional)',
      defaultPath: getDefaultDir(),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:holgerRun', async (opts) => {
    const options = opts as { sourcePath: string; mediaDir?: string } | undefined;
    if (!options?.sourcePath) return { success: false, error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    importInProgress = true;
    notifyWorkerImportStart();
    const tHandler = Date.now();
    console.log(`[import-timing] holger handler start — sourcePath=${options.sourcePath} mediaDir=${options.mediaDir ?? '(none)'}`);
    try {
      // Bulk-copy the media folder up-front. fsp.cp recursive walks + copies
      // through libuv much faster than 12k sequential per-row copyFile calls.
      // After this, consolidateMediaFolder fast-paths every row that lands here.
      if (options.mediaDir) {
        try {
          const { ms } = await bulkCopyMediaFolder(options.mediaDir, media.getMediaDir(getCurrentDatabasePath()));
          console.log(`[import-timing] bulkCopyMediaFolder done — ${ms}ms`);
        } catch (err) {
          console.warn(`[import-timing] bulkCopyMediaFolder failed (will fall back to per-row copy): ${err instanceof Error ? err.message : err}`);
        }
      }
      const tHolger = Date.now();
      const result = await importFromHolger(getDb(), {
        sourcePath: options.sourcePath,
        mediaDir: options.mediaDir,
        onProgress: (msg) => {
          if (win) win.webContents.send('import:holgerProgress', { message: msg });
        },
      });
      console.log(`[import-timing] importFromHolger done — ${Date.now() - tHolger}ms`);
      const tConsol = Date.now();
      const consolResult = await consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      console.log(`[import-timing] consolidateMediaFolder done — ${Date.now() - tConsol}ms — copied=${consolResult.copied} skipped=${consolResult.skipped} missing=${consolResult.missing}`);
      console.log(`[import-timing] holger handler total — ${Date.now() - tHandler}ms`);
      return { success: true, report: result.report };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      importInProgress = false;
      notifyWorkerImportEnd();
    }
  });

  // Archive export/import
  wrapHandler('archive:export', async (opts?: unknown) => {
    const options = opts as { gedcomVersion?: '5.5.1' | '7.0' } | undefined;
    const version = options?.gedcomVersion ?? '5.5.1';
    const result = await dialog.showSaveDialog({
      title: 'Export Archive',
      defaultPath: path.join(getDefaultDir(), 'family-tree.zip'),
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const dbDir = path.dirname(getCurrentDatabasePath());
    const report = exportArchive(getDb(), result.filePath, dbDir, { gedcomVersion: version });
    return { exported: true, filePath: result.filePath, report };
  });

  wrapHandler('archive:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Archive',
      defaultPath: getDefaultDir(),
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const archivePath = result.filePaths[0];
    const dbPath = getCurrentDatabasePath();
    const dbDir = path.dirname(dbPath);
    const mediaDir = path.join(dbDir, mediaFolderName(dbPath));
    importInProgress = true;
    notifyWorkerImportStart();
    try {
      const report = importArchive(getDb(), archivePath, mediaDir);
      await consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { imported: true, filePath: archivePath, report };
    } finally {
      importInProgress = false;
      notifyWorkerImportEnd();
    }
  });
}
