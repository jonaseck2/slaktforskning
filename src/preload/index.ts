import { contextBridge, ipcRenderer } from 'electron';
import { channelRegistry } from '../shared/channels';
import type { ApiSurface } from '../shared/channels/api-type';

// Registry of callbacks to invoke after any mutating IPC call.
// Uses the same contextBridge pattern as db.onSwitched — the only reliable
// way to call back into the renderer from the preload's isolated context.
const dataChangedListeners: Array<() => void> = [];

function mutating<T extends unknown[], R>(fn: (...args: T) => Promise<R>): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const result = await fn(...args);
    dataChangedListeners.forEach(cb => cb());
    return result;
  };
}

// Build the API object from the channel registry for all migrated domains.
// Channels with mutating:true are wrapped so dataChanged listeners fire after the call.
const apiByDomain: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
for (const ch of Object.values(channelRegistry)) {
  const colonIdx = ch.name.indexOf(':');
  if (colonIdx === -1) continue;
  const domain = ch.name.slice(0, colonIdx);
  const method = ch.name.slice(colonIdx + 1);
  apiByDomain[domain] ??= {};
  const invoke = (...args: unknown[]) => ipcRenderer.invoke(ch.name, ...args);
  apiByDomain[domain][method] = ch.mutating ? mutating(invoke) : invoke;
}
// Cast to typed surface — the type is derived from the registry at compile time.
const typedRegistryApi = apiByDomain as unknown as ApiSurface<typeof channelRegistry>;

const api = {
  ...typedRegistryApi,
  // Domains fully covered by the registry are built from typedRegistryApi above.
  // Only non-registry channels that need Electron APIs, runtime closures, or
  // post-call broadcasts are listed explicitly below.
  gedcom: {
    selectFile: () => ipcRenderer.invoke('gedcom:selectFile'),
    preview: (opts?: { filePath?: string }) => ipcRenderer.invoke('gedcom:preview', opts),
    import: (opts?: unknown) => ipcRenderer.invoke('gedcom:import', opts),
    export: (opts?: { version?: string; exportOptions?: unknown }) => ipcRenderer.invoke('gedcom:export', opts),
  },
  import: {
    genneyCheckDocker: () => ipcRenderer.invoke('import:genneyCheckDocker'),
    genneySelectDerby: () => ipcRenderer.invoke('import:genneySelectDerby'),
    genneySelectArchive: () => ipcRenderer.invoke('import:genneySelectArchive'),
    genneySelectMedia: () => ipcRenderer.invoke('import:genneySelectMedia'),
    genneyDiscover: (opts: unknown) => ipcRenderer.invoke('import:genneyDiscover', opts),
    genneyRun: (opts: unknown) => ipcRenderer.invoke('import:genneyRun', opts),
    onProgress: (cb: (msg: string) => void) => ipcRenderer.on('import:genneyProgress', (_e, data: { message: string }) => cb(data.message)),
    holgerSelectFile: () => ipcRenderer.invoke('import:holgerSelectFile'),
    holgerSelectMedia: () => ipcRenderer.invoke('import:holgerSelectMedia'),
    holgerRun: (opts: unknown) => ipcRenderer.invoke('import:holgerRun', opts),
    onHolgerProgress: (cb: (msg: string) => void) =>
      ipcRenderer.on('import:holgerProgress', (_e, data: { message: string }) => cb(data.message)),
  },
  // db: registry supplies getSetting/setSetting/deleteSetting via typedRegistryApi.db.
  // The remaining methods below need runtime closures or Electron APIs unavailable
  // in the registry (getCurrent, createNew, switchTo use getCurrentDatabasePath /
  // switchDatabase; onSwitched is an event listener, not an invoke).
  db: {
    ...typedRegistryApi.db,
    getCurrent: () => ipcRenderer.invoke('db:getCurrent'),
    getRecent: () => ipcRenderer.invoke('db:getRecent'),
    createNew: () => ipcRenderer.invoke('db:createNew'),
    openExisting: () => ipcRenderer.invoke('db:openExisting'),
    switchTo: (dbPath: string) => ipcRenderer.invoke('db:switchTo', dbPath),
    onSwitched: (cb: () => void) => ipcRenderer.on('db:switched', cb),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
  checks: {
    runAll: () => ipcRenderer.invoke('checks:runAll'),
    forPerson: (personId: string) => ipcRenderer.invoke('checks:forPerson', personId),
    forPlace: (placeId: string) => ipcRenderer.invoke('checks:forPlace', placeId),
    forMedia: (mediaId: string) => ipcRenderer.invoke('checks:forMedia', mediaId),
  },
  // media: registry supplies all DB-backed methods via typedRegistryApi.media.
  // These four remain here because they use Electron-specific paths or worker-local
  // state (getDbDir()) that can't fit the registry pattern.
  media: {
    ...typedRegistryApi.media,
    attach: mutating((data?: unknown) => ipcRenderer.invoke('media:attach', data)),
    openFile: (id: string) => ipcRenderer.invoke('media:openFile', id),
    getFilePath: (id: string) => ipcRenderer.invoke('media:getFilePath', id),
    readAsDataUrl: (id: string) => ipcRenderer.invoke('media:readAsDataUrl', id),
  },
  // mediaRegions: registry supplies all methods except updateGeometry (an alias).
  mediaRegions: {
    ...typedRegistryApi.mediaRegions,
    updateGeometry: (id: string, data: Record<string, number>) => ipcRenderer.invoke('mediaRegions:update', id, data),
  },
  archive: {
    export: (opts?: { gedcomVersion?: string }) => ipcRenderer.invoke('archive:export', opts),
    import: () => ipcRenderer.invoke('archive:import'),
  },
  export: {
    openFolder: (folderPath: string) => ipcRenderer.invoke('export:openFolder', folderPath),
  },
  website: {
    export: (opts: unknown) => ipcRenderer.invoke('website:export', opts),
    previewSnapshot: (opts: unknown) => ipcRenderer.invoke('website:previewSnapshot', opts),
    setPreviewSnapshot: (opts: unknown) => ipcRenderer.invoke('website:setPreviewSnapshot', opts),
  },
  print: {
    print: () => ipcRenderer.invoke('print:print'),
    exportPdf: (defaultPath?: string, landscape?: boolean) => ipcRenderer.invoke('print:exportPdf', defaultPath, landscape),
  },
  csv: {
    export: (entityType: string, options?: { delimiter?: string; encoding?: string }) =>
      ipcRenderer.invoke('csv:export', { entityType, ...options }),
  },
  backup: {
    backup: () => ipcRenderer.invoke('backup:backup'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  // undo: registry supplies state/beginGroup/endGroup via typedRegistryApi.undo.
  // undo:undo and undo:redo remain here because ipc/database.ts broadcasts
  // undo:changed to all BrowserWindows after the worker call; the registry
  // pattern has no post-call broadcast hook. onChanged and onPerformed are
  // event listeners, not invoke channels.
  undo: {
    ...typedRegistryApi.undo,
    undo: () => ipcRenderer.invoke('undo:undo'),
    redo: () => ipcRenderer.invoke('undo:redo'),
    onChanged: (cb: () => void) => ipcRenderer.on('undo:changed', cb),
    onPerformed: (cb: (data: { type: string; label: string }) => void) =>
      ipcRenderer.on('undo:performed', (_e, data: { type: string; label: string }) => cb(data)),
  },
  onDataChanged: (cb: () => void) => { dataChangedListeners.push(cb); },
  chart: {
    saveSvg: (svgContent: string, fileNameHint?: string) => ipcRenderer.invoke('chart:saveSvg', svgContent, fileNameHint),
    savePdf: (svgContent: string, pxWidth: number, pxHeight: number, fileNameHint?: string) => ipcRenderer.invoke('chart:savePdf', svgContent, pxWidth, pxHeight, fileNameHint),
    onGetVisiblePersons: (callback: () => unknown) => {
      ipcRenderer.on('chart:getVisiblePersons', (_event, replyChannel) => {
        const result = callback();
        ipcRenderer.send(replyChannel, result);
      });
    },
    onSelectPerson: (callback: (args: { person_id?: string; name?: string }) => unknown) => {
      ipcRenderer.on('chart:selectPerson', (_event, replyChannel, args) => {
        const result = callback(args);
        ipcRenderer.send(replyChannel, result);
      });
    },
    onFocusPerson: (callback: (args: { person_id: string }) => unknown) => {
      ipcRenderer.on('chart:focusPerson', (_event, replyChannel, args) => {
        const result = callback(args);
        ipcRenderer.send(replyChannel, result);
      });
    },
    onGetLayout: (callback: () => unknown) => {
      ipcRenderer.on('chart:getLayout', (_event, replyChannel) => {
        const result = callback();
        ipcRenderer.send(replyChannel, result);
      });
    },
    removeAllChartHandlers: () => {
      ipcRenderer.removeAllListeners('chart:getVisiblePersons');
      ipcRenderer.removeAllListeners('chart:selectPerson');
      ipcRenderer.removeAllListeners('chart:focusPerson');
      ipcRenderer.removeAllListeners('chart:getLayout');
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
