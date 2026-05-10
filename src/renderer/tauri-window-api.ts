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
