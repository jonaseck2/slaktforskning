import { contextBridge, ipcRenderer } from 'electron';

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

const api = {
  persons: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('persons:create', data)),
    createWithEvent: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('persons:createWithEvent', data)),
    get: (id: string) => ipcRenderer.invoke('persons:get', id),
    list: () => ipcRenderer.invoke('persons:list'),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('persons:delete', id)),
    search: (query: string, relateeId?: string | null) => ipcRenderer.invoke('persons:search', query, relateeId ?? null),
    addName: mutating((personId: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:addName', personId, data)),
    getNames: (personId: string) => ipcRenderer.invoke('persons:getNames', personId),
    updateName: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:updateName', id, data)),
    deleteName: mutating((id: string) => ipcRenderer.invoke('persons:deleteName', id)),
    addIdentifier: mutating((personId: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:addIdentifier', personId, data)),
    getIdentifiers: (personId: string) => ipcRenderer.invoke('persons:getIdentifiers', personId),
    deleteIdentifier: mutating((id: string) => ipcRenderer.invoke('persons:deleteIdentifier', id)),
    listPage: (limit: number, offset: number, sortBy?: 'surname' | 'given_name' | 'birth_date', sortDir?: 'asc' | 'desc') => ipcRenderer.invoke('persons:listPage', limit, offset, sortBy, sortDir),
    searchWithDetails: (query: string) => ipcRenderer.invoke('persons:searchWithDetails', query),
    listUnsourcedPage: (limit: number, offset: number) => ipcRenderer.invoke('persons:listUnsourcedPage', limit, offset),
  },
  relationships: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('relationships:create', data)),
    get: (id: string) => ipcRenderer.invoke('relationships:get', id),
    list: () => ipcRenderer.invoke('relationships:list'),
    listPage: (limit: number, offset: number) => ipcRenderer.invoke('relationships:listPage', limit, offset),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('relationships:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('relationships:delete', id)),
    getForPerson: (personId: string) => ipcRenderer.invoke('relationships:getForPerson', personId),
    search: (query: string) => ipcRenderer.invoke('relationships:search', query),
  },
  eventParticipants: {
    add: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('eventParticipants:add', data)),
    getForEvent: (eventId: string) => ipcRenderer.invoke('eventParticipants:getForEvent', eventId),
    remove: mutating((id: string) => ipcRenderer.invoke('eventParticipants:remove', id)),
  },
  events: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('events:create', data)),
    get: (id: string) => ipcRenderer.invoke('events:get', id),
    forPerson: (personId: string) => ipcRenderer.invoke('events:forPerson', personId),
    forRelationship: (relationshipId: string) => ipcRenderer.invoke('events:forRelationship', relationshipId),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('events:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('events:delete', id)),
    forPlace: (placeId: string) => ipcRenderer.invoke('events:forPlace', placeId),
  },
  sources: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('sources:create', data)),
    get: (id: string) => ipcRenderer.invoke('sources:get', id),
    list: () => ipcRenderer.invoke('sources:list'),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('sources:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('sources:delete', id)),
    search: (query: string) => ipcRenderer.invoke('sources:search', query),
  },
  citations: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('citations:create', data)),
    get: (id: string) => ipcRenderer.invoke('citations:get', id),
    forSource: (sourceId: string) => ipcRenderer.invoke('citations:forSource', sourceId),
    forEvent: (eventId: string) => ipcRenderer.invoke('citations:forEvent', eventId),
    forPerson: (personId: string) => ipcRenderer.invoke('citations:forPerson', personId),
    forRelationship: (relationshipId: string) => ipcRenderer.invoke('citations:forRelationship', relationshipId),
    forPlace: (placeId: string) => ipcRenderer.invoke('citations:forPlace', placeId),
    delete: mutating((id: string) => ipcRenderer.invoke('citations:delete', id)),
    update: mutating((id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('citations:update', id, updates)),
  },
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
  db: {
    getCurrent: () => ipcRenderer.invoke('db:getCurrent'),
    getRecent: () => ipcRenderer.invoke('db:getRecent'),
    createNew: () => ipcRenderer.invoke('db:createNew'),
    openExisting: () => ipcRenderer.invoke('db:openExisting'),
    switchTo: (dbPath: string) => ipcRenderer.invoke('db:switchTo', dbPath),
    onSwitched: (cb: () => void) => ipcRenderer.on('db:switched', cb),
    getSetting: (key: string) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),
    deleteSetting: (key: string) => ipcRenderer.invoke('db:deleteSetting', key),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
  places: {
    create: mutating((data: unknown) => ipcRenderer.invoke('places:create', data)),
    get: (id: string) => ipcRenderer.invoke('places:get', id),
    list: () => ipcRenderer.invoke('places:list'),
    search: (query: string) => ipcRenderer.invoke('places:search', query),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('places:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('places:delete', id)),
    findOrCreate: mutating((name: string) => ipcRenderer.invoke('places:findOrCreate', name)),
    getPath: (id: string) => ipcRenderer.invoke('places:getPath', id),
    getPersons: (placeId: string) => ipcRenderer.invoke('places:getPersons', placeId),
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    get: (id: string) => ipcRenderer.invoke('groups:get', id),
    create: mutating((data: unknown) => ipcRenderer.invoke('groups:create', data)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('groups:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('groups:delete', id)),
    addLink: mutating((groupId: string, entityType: string, entityId: string) => ipcRenderer.invoke('groups:addLink', groupId, entityType, entityId)),
    removeLink: mutating((linkId: string) => ipcRenderer.invoke('groups:removeLink', linkId)),
    removeLinkByEntity: mutating((groupId: string, entityType: string, entityId: string) => ipcRenderer.invoke('groups:removeLinkByEntity', groupId, entityType, entityId)),
    getLinks: (groupId: string) => ipcRenderer.invoke('groups:getLinks', groupId),
    forPerson: (personId: string) => ipcRenderer.invoke('groups:forPerson', personId),
    forPlace: (placeId: string) => ipcRenderer.invoke('groups:forPlace', placeId),
    forMedia: (mediaId: string) => ipcRenderer.invoke('groups:forMedia', mediaId),
  },
  repositories: {
    list: () => ipcRenderer.invoke('repositories:list'),
    get: (id: string) => ipcRenderer.invoke('repositories:get', id),
    create: mutating((data: unknown) => ipcRenderer.invoke('repositories:create', data)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('repositories:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('repositories:delete', id)),
    forSource: (sourceId: string) => ipcRenderer.invoke('repositories:forSource', sourceId),
    linkSource: mutating((sourceId: string, repoId: string) => ipcRenderer.invoke('repositories:linkSource', sourceId, repoId)),
    unlinkSource: mutating((sourceId: string, repoId: string) => ipcRenderer.invoke('repositories:unlinkSource', sourceId, repoId)),
  },
  researchTasks: {
    list: () => ipcRenderer.invoke('researchTasks:list'),
    get: (id: string) => ipcRenderer.invoke('researchTasks:get', id),
    forPerson: (personId: string) => ipcRenderer.invoke('researchTasks:forPerson', personId),
    forPlace: (placeId: string) => ipcRenderer.invoke('researchTasks:forPlace', placeId),
    forMedia: (mediaId: string) => ipcRenderer.invoke('researchTasks:forMedia', mediaId),
    create: mutating((data: unknown) => ipcRenderer.invoke('researchTasks:create', data)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('researchTasks:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('researchTasks:delete', id)),
    addLink: mutating((taskId: string, entityType: string, entityId: string) => ipcRenderer.invoke('researchTasks:addLink', taskId, entityType, entityId)),
    removeLink: mutating((linkId: string) => ipcRenderer.invoke('researchTasks:removeLink', linkId)),
    getLinks: (taskId: string) => ipcRenderer.invoke('researchTasks:getLinks', taskId),
  },
  reports: {
    personSummary: (personId: string) => ipcRenderer.invoke('reports:personSummary', personId),
    familyUnit: (relationshipId: string) => ipcRenderer.invoke('reports:familyUnit', relationshipId),
    ancestorTree: (personId: string, generations?: number) => ipcRenderer.invoke('reports:ancestorTree', personId, generations),
    placeHistory: (placeId: string) => ipcRenderer.invoke('reports:placeHistory', placeId),
    researchGaps: (personId: string) => ipcRenderer.invoke('reports:researchGaps', personId),
    timeline: (personId: string) => ipcRenderer.invoke('reports:timeline', personId),
    aliveInYear: (year: number) => ipcRenderer.invoke('reports:aliveInYear', year),
  },
  duplicates: {
    find: (limit?: number) => ipcRenderer.invoke('duplicates:find', limit),
    merge: mutating((targetId: string, sourceId: string) => ipcRenderer.invoke('duplicates:merge', targetId, sourceId)),
  },
  checks: {
    runAll: () => ipcRenderer.invoke('checks:runAll'),
    forPerson: (personId: string) => ipcRenderer.invoke('checks:forPerson', personId),
    forPlace: (placeId: string) => ipcRenderer.invoke('checks:forPlace', placeId),
    forMedia: (mediaId: string) => ipcRenderer.invoke('checks:forMedia', mediaId),
  },
  media: {
    list: () => ipcRenderer.invoke('media:list'),
    listPage: (limit: number, offset: number) => ipcRenderer.invoke('media:listPage', limit, offset),
    get: (id: string) => ipcRenderer.invoke('media:get', id),
    create: mutating((data: unknown) => ipcRenderer.invoke('media:create', data)),
    delete: mutating((id: string) => ipcRenderer.invoke('media:delete', id)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('media:update', id, data)),
    forEntity: (entityType: string, entityId: string) => ipcRenderer.invoke('media:forEntity', entityType, entityId),
    linksForMedia: (mediaId: string) => ipcRenderer.invoke('media:linksForMedia', mediaId),
    addLink: mutating((data: unknown) => ipcRenderer.invoke('media:addLink', data)),
    removeLink: mutating((linkId: string) => ipcRenderer.invoke('media:removeLink', linkId)),
    reorder: mutating((linkIds: string[]) => ipcRenderer.invoke('media:reorder', linkIds)),
    profilePicRef: (personId: string) => ipcRenderer.invoke('media:profilePicRef', personId),
    profilePicRefs: (personIds: string[]) => ipcRenderer.invoke('media:profilePicRefs', personIds),
    attach: mutating((data?: unknown) => ipcRenderer.invoke('media:attach', data)),
    openFile: (id: string) => ipcRenderer.invoke('media:openFile', id),
    getFilePath: (id: string) => ipcRenderer.invoke('media:getFilePath', id),
    readAsDataUrl: (id: string) => ipcRenderer.invoke('media:readAsDataUrl', id),
    getTimeline: (entityType: string, entityId: string) => ipcRenderer.invoke('media:getTimeline', entityType, entityId),
  },
  archive: {
    export: (opts?: { gedcomVersion?: string }) => ipcRenderer.invoke('archive:export', opts),
    import: () => ipcRenderer.invoke('archive:import'),
  },
  mediaRegions: {
    create: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('mediaRegions:create', data)),
    getForMedia: (mediaId: string) => ipcRenderer.invoke('mediaRegions:getForMedia', mediaId),
    getForPerson: (personId: string) => ipcRenderer.invoke('mediaRegions:getForPerson', personId),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('mediaRegions:update', id, data)),
    updateGeometry: (id: string, data: Record<string, number>) => ipcRenderer.invoke('mediaRegions:update', id, data),
    delete: mutating((id: string) => ipcRenderer.invoke('mediaRegions:delete', id)),
  },
  export: {
    openFolder: (folderPath: string) => ipcRenderer.invoke('export:openFolder', folderPath),
  },
  website: {
    export: (opts: unknown) => ipcRenderer.invoke('website:export', opts),
    previewSnapshot: (opts: unknown) => ipcRenderer.invoke('website:previewSnapshot', opts),
    buildPreviewHtml: (opts: unknown) => ipcRenderer.invoke('website:buildPreviewHtml', opts),
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
  gazetteers: {
    list: () => ipcRenderer.invoke('gazetteers:list'),
    import: mutating((json: string) => ipcRenderer.invoke('gazetteers:import', json)),
    export: (id: string) => ipcRenderer.invoke('gazetteers:export', id),
    delete: mutating((id: string) => ipcRenderer.invoke('gazetteers:delete', id)),
    getImported: () => ipcRenderer.invoke('gazetteers:getImported'),
    getSchema: () => ipcRenderer.invoke('gazetteers:getSchema'),
    getBundled: () => ipcRenderer.invoke('gazetteers:getBundled'),
  },
  undo: {
    undo: () => ipcRenderer.invoke('undo:undo'),
    redo: () => ipcRenderer.invoke('undo:redo'),
    getState: () => ipcRenderer.invoke('undo:state'),
    beginGroup: (label: string) => ipcRenderer.invoke('undo:beginGroup', label),
    endGroup: () => ipcRenderer.invoke('undo:endGroup'),
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
