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
    get: (id: string) => ipcRenderer.invoke('persons:get', id),
    list: () => ipcRenderer.invoke('persons:list'),
    update: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('persons:delete', id)),
    search: (query: string) => ipcRenderer.invoke('persons:search', query),
    addName: mutating((personId: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:addName', personId, data)),
    getNames: (personId: string) => ipcRenderer.invoke('persons:getNames', personId),
    updateName: mutating((id: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:updateName', id, data)),
    deleteName: mutating((id: string) => ipcRenderer.invoke('persons:deleteName', id)),
    addIdentifier: mutating((personId: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:addIdentifier', personId, data)),
    getIdentifiers: (personId: string) => ipcRenderer.invoke('persons:getIdentifiers', personId),
    deleteIdentifier: mutating((id: string) => ipcRenderer.invoke('persons:deleteIdentifier', id)),
    listPage: (limit: number, offset: number) => ipcRenderer.invoke('persons:listPage', limit, offset),
    searchWithDetails: (query: string) => ipcRenderer.invoke('persons:searchWithDetails', query),
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
    import: (opts?: unknown) => ipcRenderer.invoke('gedcom:import', opts),
    export: (opts?: { version?: string }) => ipcRenderer.invoke('gedcom:export', opts),
  },
  import: {
    genneyCheckDocker: () => ipcRenderer.invoke('import:genneyCheckDocker'),
    genneySelectDerby: () => ipcRenderer.invoke('import:genneySelectDerby'),
    genneySelectArchive: () => ipcRenderer.invoke('import:genneySelectArchive'),
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
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    get: (id: string) => ipcRenderer.invoke('groups:get', id),
    create: mutating((data: unknown) => ipcRenderer.invoke('groups:create', data)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('groups:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('groups:delete', id)),
    addMember: mutating((groupId: string, personId: string) => ipcRenderer.invoke('groups:addMember', groupId, personId)),
    removeMember: mutating((groupId: string, personId: string) => ipcRenderer.invoke('groups:removeMember', groupId, personId)),
    getMembers: (groupId: string) => ipcRenderer.invoke('groups:getMembers', groupId),
    forPerson: (personId: string) => ipcRenderer.invoke('groups:forPerson', personId),
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
    create: mutating((data: unknown) => ipcRenderer.invoke('researchTasks:create', data)),
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('researchTasks:update', id, data)),
    delete: mutating((id: string) => ipcRenderer.invoke('researchTasks:delete', id)),
  },
  checks: {
    runAll: () => ipcRenderer.invoke('checks:runAll'),
    forPerson: (personId: string) => ipcRenderer.invoke('checks:forPerson', personId),
  },
  media: {
    list: () => ipcRenderer.invoke('media:list'),
    get: (id: string) => ipcRenderer.invoke('media:get', id),
    create: mutating((data: unknown) => ipcRenderer.invoke('media:create', data)),
    delete: mutating((id: string) => ipcRenderer.invoke('media:delete', id)),
    forEntity: (entityType: string, entityId: string) => ipcRenderer.invoke('media:forEntity', entityType, entityId),
    addLink: mutating((data: unknown) => ipcRenderer.invoke('media:addLink', data)),
    removeLink: mutating((linkId: string) => ipcRenderer.invoke('media:removeLink', linkId)),
    attach: mutating((data?: unknown) => ipcRenderer.invoke('media:attach', data)),
    openFile: (id: string) => ipcRenderer.invoke('media:openFile', id),
    getFilePath: (id: string) => ipcRenderer.invoke('media:getFilePath', id),
    readAsDataUrl: (id: string) => ipcRenderer.invoke('media:readAsDataUrl', id),
  },
  print: {
    print: () => ipcRenderer.invoke('print:print'),
    exportPdf: (path?: string) => ipcRenderer.invoke('print:exportPdf', path),
  },
  backup: {
    backup: () => ipcRenderer.invoke('backup:backup'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  onDataChanged: (cb: () => void) => { dataChangedListeners.push(cb); },
};

contextBridge.exposeInMainWorld('api', api);
