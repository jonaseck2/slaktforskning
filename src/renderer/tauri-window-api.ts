// Runtime polyfill that mounts `window.api.*` for the Tauri build.
//
// In the Electron build, src/preload/index.ts exposes window.api via
// contextBridge as a hand-maintained map of channel-name → ipcRenderer.invoke
// calls. Tauri has no contextBridge / no preload world: the renderer is just
// a webview page running our Vue app + the existing src/api/ TS code in the
// same process. So instead of going through an IPC, we walk the channel
// registry (src/shared/channels/) and wire each `name: 'foo:bar'` directly
// to its declared handler function.
//
// Same Database instance threads through every call. The Database is the
// renderer-side shim from src/renderer/db-shim.ts (vite alias of
// `node-sqlite3-wasm`); its methods invoke() rusqlite primitives in
// src-tauri/src/db.rs.

import { Database } from 'node-sqlite3-wasm';
import { invoke } from '@tauri-apps/api/core';
import { listChannels, getChannel } from '../shared/channels/registry';
import { initializeSchema } from '../api/schema';
import * as media from '../api/media';
import * as checks from '../api/checks';
import * as persons from '../api/persons';
import { queryAll } from '../api/db';

// Side-effect imports register every channel on the registry at module load.
// Without these, the registry is empty and listChannels() returns nothing.
import '../shared/channels';

let dbInstance: Database | null = null;

function getDb(): Database {
  if (!dbInstance) throw new Error('window.api called before database opened');
  return dbInstance;
}

// data:changed broadcast — emit through Tauri's event bus so multiple windows
// stay in sync. The Electron build does this via main → BrowserWindow.send;
// Tauri does it via the renderer-thread emit on the @tauri-apps/api/event
// surface. Wired separately in src/renderer/main.ts when this polyfill mounts.
const dataChangedListeners: Array<() => void> = [];
function fireDataChanged(): void {
  for (const cb of dataChangedListeners) cb();
}

// Convert 'persons:list' → ['persons', 'list'].
function splitChannelName(name: string): [string, string] {
  const [domain, method] = name.split(':');
  if (!domain || !method) throw new Error(`malformed channel name: ${name}`);
  return [domain, method];
}

export interface MountResult {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  onDataChanged: (cb: () => void) => void;
}

export function mountWindowApi(db: Database): MountResult {
  dbInstance = db;
  const api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};

  for (const channelName of listChannels()) {
    const ch = getChannel(channelName);
    if (!ch) continue;
    const [domain, method] = splitChannelName(channelName);
    if (!api[domain]) api[domain] = {};

    // Worker channels: handler signature is `(db, ...args)`.
    // Main channels: handler signature is `(...args)` — no db arg.
    const isWorker = ch.thread === 'worker';
    const handler = ch.handler as (...args: unknown[]) => Promise<unknown>;
    const isMutating = (ch as { mutating?: boolean }).mutating === true;

    api[domain][method] = isWorker
      ? async (...args: unknown[]) => {
          const result = await handler(getDb(), ...args);
          if (isMutating) fireDataChanged();
          return result;
        }
      : async (...args: unknown[]) => {
          const result = await handler(...args);
          if (isMutating) fireDataChanged();
          return result;
        };
  }

  // Main-only channels that the registry walk can't satisfy because they
  // require Tauri runtime services (file dialog, app data dir). Override the
  // generated stubs with real implementations.
  if (!api.db) api.db = {};
  api.db.getCurrent = async () => {
    const path = await invoke<string | null>('db_current_path');
    if (!path) return null;
    // Match the shape the renderer expects from the Electron build.
    return { path, name: deriveDbName(path) };
  };
  api.db.openExisting = async () => {
    const path = await invoke<string | null>('db_pick_existing');
    if (!path) return { cancelled: true };
    await switchDbTo(path, /* createSchema */ false);
    return { path, name: deriveDbName(path) };
  };
  api.db.createNew = async () => {
    const path = await invoke<string | null>('db_pick_new');
    if (!path) return { cancelled: true };
    await switchDbTo(path, /* createSchema */ true);
    return { path, name: deriveDbName(path) };
  };
  api.db.switchTo = async (path: unknown) => {
    if (typeof path !== 'string') throw new Error('switchTo: path must be string');
    await switchDbTo(path, /* createSchema */ false);
    return { path, name: deriveDbName(path) };
  };
  api.db.getRecent = async () => [];

  // Media: file picker + copy lives in Rust (renderer can't touch fs).
  // After the file is in <dbname>-media/, do the DB work via the api/ functions.
  if (!api.media) api.media = {};
  api.media.attach = async (data: unknown) => {
    const opts = data as { entityType?: string; entityId?: string } | undefined;
    const r = await invoke<{ canceled: boolean; fileRef?: string; format?: string | null; title?: string }>(
      'media_pick_and_copy',
    );
    if (r.canceled) return { canceled: true };
    const item = await media.createMedia(getDb(), {
      file_ref: r.fileRef ?? null,
      title: r.title ?? '',
      format: (r.format ?? null) as string | null,
    });
    if (opts?.entityType && opts?.entityId) {
      await media.addMediaLink(getDb(), {
        media_id: item.id,
        entity_type: opts.entityType as Parameters<typeof media.addMediaLink>[1]['entity_type'],
        entity_id: opts.entityId,
      });
    }
    fireDataChanged();
    return { canceled: false, media: item };
  };
  api.media.readAsDataUrl = async (mediaIdOrRef: unknown) => {
    // Electron preload accepts either a media-id (looked up in DB) or a
    // file_ref. Mirror both shapes.
    let fileRef: string | null = null;
    if (typeof mediaIdOrRef === 'string') {
      // First try as media id.
      const row = await media.getMedia(getDb(), mediaIdOrRef);
      if (row?.file_ref) fileRef = row.file_ref;
      else fileRef = mediaIdOrRef;  // assume it's a file_ref
    }
    if (!fileRef) return null;
    return await invoke<string | null>('media_read_as_data_url', { fileRef });
  };
  api.media.getFilePath = async (mediaId: unknown) => {
    if (typeof mediaId !== 'string') return null;
    const row = await media.getMedia(getDb(), mediaId);
    return row?.file_ref ?? null;
  };

  // Checks: main-only IPC channels in the Electron build (worker-local
  // cancellation state). In Tauri the whole thing runs in the renderer, so
  // we call the api/ functions directly. Re-runs aren't expected to be
  // cancelled here — the user-visible effect is just slower checks.
  if (!api.checks) api.checks = {};
  const dbDirFromPath = async (): Promise<string | undefined> => {
    const cur = await invoke<string | null>('db_current_path');
    if (!cur) return undefined;
    return cur.replace(/[\\/][^\\/]+$/, '');
  };
  api.checks.runAll = async () => {
    const dbDir = await dbDirFromPath();
    const results = await checks.runAllChecks(getDb(), dbDir);
    // Cap notice severity per code at 500, mirroring the worker's behaviour.
    const countByCode = new Map<string, number>();
    const capped = results.filter(r => {
      if (r.severity !== 'notice') return true;
      const n = (countByCode.get(r.code) ?? 0) + 1;
      countByCode.set(r.code, n);
      return n <= 500;
    });
    const allIds = [...new Set(capped.flatMap(r => r.personIds))];
    const nameMap = await persons.getPersonDisplayNames(getDb(), allIds);
    const enrich = async (ids: string[], table: string, col: string): Promise<Map<string, string>> => {
      const out = new Map<string, string>();
      if (ids.length === 0) return out;
      const ph = ids.map(() => '?').join(',');
      const rows = await queryAll<{ id: string; v: string | null }>(getDb(), `SELECT id, ${col} AS v FROM ${table} WHERE id IN (${ph})`, ids);
      for (const r of rows) out.set(r.id, r.v ?? '');
      return out;
    };
    const placeNameMap = await enrich([...new Set(capped.flatMap(r => r.placeIds ?? []))], 'places', 'name');
    const mediaTitleMap = await enrich([...new Set(capped.flatMap(r => r.mediaIds ?? []))], 'media', 'COALESCE(title, file_ref)');
    const sourceTitleMap = await enrich([...new Set(capped.flatMap(r => r.sourceIds ?? []))], 'sources', 'title');
    return capped.map(r => ({
      ...r,
      personNames: r.personIds.map(id => nameMap.get(id) ?? ''),
      placeNames: (r.placeIds ?? []).map(id => placeNameMap.get(id) ?? ''),
      mediaTitles: (r.mediaIds ?? []).map(id => mediaTitleMap.get(id) ?? ''),
      sourceTitles: (r.sourceIds ?? []).map(id => sourceTitleMap.get(id) ?? ''),
    }));
  };
  api.checks.forPerson = async (personId: unknown) => {
    if (typeof personId !== 'string') return [];
    const dbDir = await dbDirFromPath();
    const results: import('../api/checks').CheckResult[] = [];
    for (const c of checks.getAllCheckFunctions()) {
      if (c.global) continue;
      const res = await c.fn(getDb(), dbDir);
      results.push(...res.filter(r => r.personIds.includes(personId)));
    }
    return results;
  };
  api.checks.forPlace = async (placeId: unknown) => {
    if (typeof placeId !== 'string') return [];
    const dbDir = await dbDirFromPath();
    return await checks.runChecksForPlace(getDb(), placeId, dbDir);
  };
  api.checks.forMedia = async (mediaId: unknown) => {
    if (typeof mediaId !== 'string') return [];
    const dbDir = await dbDirFromPath();
    return await checks.runChecksForMedia(getDb(), mediaId, dbDir);
  };
  api.checks.runForEvent = async (eventId: unknown) => {
    if (typeof eventId !== 'string') return [];
    return await checks.runChecksForEvent(getDb(), eventId);
  };
  api.checks.cancel = async () => { /* no cancellation surface here yet */ };

  // window.api gets the polyfilled shape. The Electron-only
  // onDataChanged subscription mechanism is exposed too so existing
  // renderer composables (useEntityData, usePagedList) keep working.
  (globalThis as unknown as { api: typeof api }).api = api;

  return {
    api,
    onDataChanged: (cb: () => void) => { dataChangedListeners.push(cb); },
  };
}

function deriveDbName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.(db|sqlite|sqlite3)$/i, '');
}

async function switchDbTo(path: string, createSchema: boolean): Promise<void> {
  // Close + reopen the global rusqlite connection on the Rust side.
  await invoke('db_close');
  await invoke('db_open', { path });
  // The shim's `dbInstance` is a renderer-side handle that proxies to the
  // global Rust connection — no per-instance state, so no re-construction
  // needed. Just (re-)init schema if creating new, then refresh the UI.
  if (createSchema && dbInstance) {
    await initializeSchema(dbInstance);
  }
  fireDataChanged();
}
