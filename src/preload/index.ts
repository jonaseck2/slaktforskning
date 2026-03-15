import { contextBridge, ipcRenderer } from 'electron';

const api = {
  persons: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('persons:create', data),
    get: (id: string) => ipcRenderer.invoke('persons:get', id),
    list: () => ipcRenderer.invoke('persons:list'),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('persons:delete', id),
    search: (query: string) => ipcRenderer.invoke('persons:search', query),
    addName: (personId: string, data: Record<string, unknown>) => ipcRenderer.invoke('persons:addName', personId, data),
    getNames: (personId: string) => ipcRenderer.invoke('persons:getNames', personId),
  },
  families: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('families:create', data),
    get: (id: string) => ipcRenderer.invoke('families:get', id),
    list: () => ipcRenderer.invoke('families:list'),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('families:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('families:delete', id),
    addChild: (familyId: string, personId: string, relType?: string) => ipcRenderer.invoke('families:addChild', familyId, personId, relType),
    getChildren: (familyId: string) => ipcRenderer.invoke('families:getChildren', familyId),
    getForPerson: (personId: string) => ipcRenderer.invoke('families:getForPerson', personId),
    search: (query: string) => ipcRenderer.invoke('families:search', query),
  },
  events: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('events:create', data),
    get: (id: string) => ipcRenderer.invoke('events:get', id),
    forPerson: (personId: string) => ipcRenderer.invoke('events:forPerson', personId),
    forFamily: (familyId: string) => ipcRenderer.invoke('events:forFamily', familyId),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('events:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('events:delete', id),
  },
  sources: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('sources:create', data),
    get: (id: string) => ipcRenderer.invoke('sources:get', id),
    list: () => ipcRenderer.invoke('sources:list'),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('sources:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('sources:delete', id),
    search: (query: string) => ipcRenderer.invoke('sources:search', query),
  },
  citations: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('citations:create', data),
    get: (id: string) => ipcRenderer.invoke('citations:get', id),
    forSource: (sourceId: string) => ipcRenderer.invoke('citations:forSource', sourceId),
    forEvent: (eventId: string) => ipcRenderer.invoke('citations:forEvent', eventId),
    delete: (id: string) => ipcRenderer.invoke('citations:delete', id),
  },
};

contextBridge.exposeInMainWorld('api', api);
