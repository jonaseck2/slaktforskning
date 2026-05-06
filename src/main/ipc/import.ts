import * as fs from 'fs';
import * as path from 'path';
import { dialog } from 'electron';
import { exportGedcom } from '../../gedcom';
import { isDockerAvailable } from '../../import/genney/index';
import { exportArchive } from '../../api/archive_export';
import { importArchive } from '../../api/archive_import';
import { consolidateMediaFolder } from '../../api/media_consolidate';
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

  // gedcom:preview and gedcom:import are registered via the channel registry
  // as worker channels (src/shared/channels/import.ts). The full read + parse
  // + DB import + media consolidation runs in the DB worker thread, so the
  // Electron main thread stays responsive. The inline-dialog fallback was
  // removed — the renderer pairs both calls with gedcom:selectFile and
  // always supplies filePath.

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

  // import:genneyRun and import:genneyDiscover are registered via the channel
  // registry as worker channels (src/shared/channels/import.ts). The Derby
  // extraction, transform, DB import, and media consolidation all run in the
  // DB worker thread, so the Electron main thread stays responsive for the
  // full duration of a multi-minute Genney import. Progress messages flow
  // worker → main → all renderers via the broadcast primitive on topic
  // 'import:genneyProgress'.

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

  // import:holgerRun is registered via the channel registry as a worker channel
  // (src/shared/channels/import.ts). The whole import — bulk media copy, GEDCOM
  // parse + import, media consolidation — runs in the DB worker thread, so the
  // Electron main thread stays responsive for the full duration of a 22k-person
  // import. Progress messages flow worker → main → all renderers via the
  // broadcast primitive on topic 'import:holgerProgress'. Renderer listeners
  // (window.api.import.onHolgerProgress) are unchanged.

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
