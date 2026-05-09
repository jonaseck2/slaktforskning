import * as fsp from 'fs/promises';
import * as path from 'path';
import { dialog } from 'electron';
import { isDockerAvailable } from '../../import/genney/index';
import type { ExportOptions } from '../../api/export_options';
import type { ExportReport } from '../../gedcom';
import type { WrapHandlerFn } from './wrap-handler';
import { mediaFolderName } from './media';
import { callWorker } from './worker-client';

// Heavy import work (archive, holger, genney, gedcom) now runs in the DB worker
// thread via worker-channel handlers in src/shared/channels/import.ts. Each of
// those uses `withImportLifecycle`, which flips the worker-local
// importInProgress flag and broadcasts to all renderers. No main-thread
// importInProgress mirror is kept here — the worker is the single source of
// truth.

export function registerImportHandlers(
  _getDb: () => ReturnType<typeof import('../database').getDatabase>,
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

  // gedcom:export — thin main-thread shim. The save dialog stays here (it
  // needs the renderer's BrowserWindow), but the heavy DB walk that builds
  // the .ged string runs in the worker via `gedcom:_exportRun`. The final
  // file write is back on the main thread to keep the worker free of fs I/O.
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
    const { ged, report } = (await callWorker('gedcom:_exportRun', {
      version,
      exportOptions,
    })) as { ged: string; report: ExportReport };
    await fsp.writeFile(result.filePath, ged, 'utf-8');
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

  // RootsMagic .rmgc import — file picker only; the import itself is a
  // worker channel registered in src/shared/channels/import.ts.
  wrapHandler('import:rootsmagicSelectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select RootsMagic database',
      defaultPath: getDefaultDir(),
      properties: ['openFile'],
      filters: [
        { name: 'RootsMagic database', extensions: ['rmgc', 'rmtree'] },
        { name: 'All Files', extensions: ['*'] },
      ],
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

  // Archive export/import — public channels are thin main-thread shims that
  // open the file dialog; the heavy DB + media work runs in the DB worker
  // thread via the internal `archive:_importRun` / `archive:_exportRun`
  // channels (registered in src/shared/channels/import.ts).
  wrapHandler('archive:export', async (opts?: unknown) => {
    const options = opts as { gedcomVersion?: '5.5.1' | '7.0' } | undefined;
    const version = options?.gedcomVersion ?? '5.5.1';
    const result = await dialog.showSaveDialog({
      title: 'Export Archive',
      defaultPath: path.join(getDefaultDir(), 'family-tree.zip'),
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return await callWorker('archive:_exportRun', {
      filePath: result.filePath,
      gedcomVersion: version,
    });
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
    return await callWorker('archive:_importRun', { archivePath, mediaDir });
  });
}
