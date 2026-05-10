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
import { undoManager } from '../api/undo';

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
// in Tauri, every renderer that mutates calls `emit('data:changed')` which
// fans out to ALL Tauri windows (sender included), and every renderer
// `listen('data:changed')` translates incoming events into local
// dataChangedListeners callbacks. Net effect: identical cross-window
// reactivity to the Electron build, no main-side bridge required.
const dataChangedListeners: Array<() => void> = [];
let suppressNextRemoteFire = false;
function fireDataChanged(): void {
  for (const cb of dataChangedListeners) cb();
  // Fire-and-forget cross-window broadcast.
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteFire = true;  // local listener will receive our own emit
    emit('data:changed').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}

// Set up the inverse — receive data:changed from other windows.
import('@tauri-apps/api/event').then(({ listen }) => {
  listen('data:changed', () => {
    if (suppressNextRemoteFire) { suppressNextRemoteFire = false; return; }
    for (const cb of dataChangedListeners) cb();
  }).catch(() => { /* ignore */ });
}).catch(() => { /* ignore */ });

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

  // File-dialog wrappers (Electron used dialog.showOpenDialog/SaveDialog on the
  // main thread; Tauri uses tauri-plugin-dialog via a generic Rust command).
  type Pick = { canceled: boolean; path?: string };
  const pickFile = (title: string, exts?: string[], extLabel?: string): Promise<Pick> =>
    invoke<Pick>('dialog_pick', { kind: 'openFile', title, extensions: exts, extensionLabel: extLabel });
  const pickFolder = (title: string): Promise<Pick> =>
    invoke<Pick>('dialog_pick', { kind: 'openDirectory', title });
  const saveFile = (title: string, defaultName: string, exts?: string[], extLabel?: string): Promise<Pick> =>
    invoke<Pick>('dialog_pick', { kind: 'saveFile', title, defaultName, extensions: exts, extensionLabel: extLabel });

  if (!api.gedcom) api.gedcom = {};
  api.gedcom.selectFile = () => pickFile('Select GEDCOM File', ['ged', 'gedcom', 'zip'], 'GEDCOM Files');

  // GEDCOM import: read bytes via Rust, decode encoding-aware in JS, parse +
  // import via the existing api/ functions. The Electron build's worker
  // handler does the same flow but with sync fs.readFileSync; the renderer
  // can't use fs so it goes through invoke('fs_read_bytes_base64').
  api.gedcom.import = async (opts: unknown) => {
    const o = opts as { filePath?: string; mediaDir?: string; profile?: 'standard' | 'minimal' } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    try {
      const [enc, parserMod, importerMod] = await Promise.all([
        import('../gedcom/encoding'),
        import('../gedcom/parser'),
        import('../import/gedcom'),
      ]);
      const b64 = await invoke<string>('fs_read_bytes_base64', { path: o.filePath });
      const bytes = base64ToUint8Array(b64);
      const text = enc.decodeGedcomBytes(bytes);
      const tree = parserMod.parseGedcom(text);
      const report = await importerMod.importGedcom(getDb(), tree, {
        mediaDir: o.mediaDir,
        profile: o.profile,
      });
      fireDataChanged();
      return report;
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // GEDCOM preview: same shape, returns a count summary without inserting.
  api.gedcom.preview = async (opts: unknown) => {
    const o = opts as { filePath?: string } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    try {
      const [enc, parserMod, importerMod] = await Promise.all([
        import('../gedcom/encoding'),
        import('../gedcom/parser'),
        import('../import/gedcom'),
      ]);
      const b64 = await invoke<string>('fs_read_bytes_base64', { path: o.filePath });
      const bytes = base64ToUint8Array(b64);
      const text = enc.decodeGedcomBytes(bytes);
      const tree = parserMod.parseGedcom(text);
      return importerMod.previewGedcomImport(tree);
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // GEDCOM export: build the .ged in renderer, then write via Rust.
  api.gedcom.export = async (opts: unknown) => {
    const o = opts as { version?: '5.5.1' | '7.0'; exportOptions?: unknown } | undefined;
    const version = o?.version === '7.0' ? '7.0' : '5.5.1';
    const fileName = version === '7.0' ? 'family-tree-70.ged' : 'family-tree.ged';
    const r = await saveFile('Export GEDCOM File', fileName, ['ged'], 'GEDCOM Files');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const exporterMod = await import('../gedcom/exporter');
      const { ged, report } = await exporterMod.exportGedcom(getDb(), {
        version,
        exportOptions: o?.exportOptions as Parameters<typeof exporterMod.exportGedcom>[1]['exportOptions'],
      });
      await invoke('fs_write_text', { path: r.path, contents: ged });
      return { exported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  if (!api.import) api.import = {};
  api.import.genneyCheckDocker = async () => ({ available: false });
  api.import.genneySelectDerby = () => pickFolder('Välj Genney Derby-databasmapp');
  api.import.genneySelectArchive = () => pickFile('Välj Genney-arkivfil (.gcc, .backup)', ['gcc', 'backup', 'zip'], 'Genney-arkiv');
  api.import.genneySelectMedia = () => pickFolder('Select Genney media folder (optional)');
  api.import.holgerSelectFile = () => pickFile('Välj Holger 8-databasfil', ['mdb'], 'Holger-databas');
  api.import.rootsmagicSelectFile = () => pickFile('Välj RootsMagic-databasfil', ['rmtree', 'rmgc'], 'RootsMagic-databas');
  api.import.grampsSelectFile = () => pickFile('Välj Gramps-databasfil', ['gramps', 'xml', 'gpkg'], 'Gramps-databas');
  api.import.grampsRun = async (opts: unknown) => {
    const o = opts as { filePath?: string } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    try {
      const grampsMod = await import('../import/gramps');
      const b64 = await invoke<string>('fs_read_bytes_base64', { path: o.filePath });
      const bytes = base64ToUint8Array(b64);
      const result = await grampsMod.importFromGrampsBytes(getDb(), bytes);
      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // Holger / RootsMagic / Genney importers do extensive fs operations
  // (directory walks, mdb→sqlite extraction, Docker/Java spawning) that
  // need wholesale Rust-side replacements. They stay throw-on-call in the
  // Tauri build until that work lands. The file picker still works so the
  // UI doesn't crash; the run handler returns a clear error.
  const notWired = (label: string) => async () => ({
    success: false,
    error: `${label} import is not yet wired in the Tauri build (deferred)`,
  });
  api.import.holgerRun = notWired('Holger');
  api.import.rootsmagicRun = notWired('RootsMagic');
  api.import.genneyRun = notWired('Genney');
  api.import.genneyDiscover = async () => ({ success: false, error: 'genneyDiscover not yet wired in Tauri build' });

  if (!api.archive) api.archive = {};
  // Archive export/import iterate per-media-row and read/write files
  // alongside zip building. Need a refactor to thread fs read/write
  // callbacks through the api/archive_*.ts functions before wiring here.
  // Tracked in the tauri-port notes (Phase 4 follow-up).
  api.archive.export = notWired('Archive export');
  api.archive.import = notWired('Archive import');

  if (!api.export) api.export = {};
  api.export.openFolder = async (folderPath: unknown) => {
    if (typeof folderPath !== 'string') return { ok: false };
    await invoke('shell_reveal', { path: folderPath });
    return { ok: true };
  };

  if (!api.csv) api.csv = {};
  // Undo / Redo — main-only in Electron because they post-call broadcast
  // data:changed to all BrowserWindows. In Tauri, the renderer fires the
  // same fan-out via fireDataChanged().
  if (!api.undo) api.undo = {};
  api.undo.undo = async () => {
    const label = await undoManager.undo();
    fireDataChanged();
    return label;
  };
  api.undo.redo = async () => {
    const label = await undoManager.redo();
    fireDataChanged();
    return label;
  };

  // Print + PDF export. Tauri 2 doesn't have webContents.printToPDF —
  // fall back to window.print() which opens the native print dialog
  // (with a Save-as-PDF option in macOS / Windows). Argument is ignored
  // because the user picks the destination in the dialog.
  // Chart bridge — useChartBridge composable registers callbacks via
  // window.api.chart.onXxx(handler). In Electron those wire ipcRenderer.on;
  // here we store them on a global so the UI server's /chart/* endpoints
  // can eval them via `window.__chartBridge.<name>()`.
  type ChartHandlers = {
    getVisiblePersons?: () => unknown;
    selectPerson?: (args: { person_id?: string; name?: string }) => unknown;
    focusPerson?: (args: { person_id: string }) => unknown;
    getLayout?: () => unknown;
  };
  const chartBridge: ChartHandlers = {};
  (window as Window & { __chartBridge?: ChartHandlers }).__chartBridge = chartBridge;
  if (!api.chart) api.chart = {};
  api.chart.onGetVisiblePersons = (cb: unknown) => { chartBridge.getVisiblePersons = cb as () => unknown; };
  api.chart.onSelectPerson = (cb: unknown) => { chartBridge.selectPerson = cb as (a: { person_id?: string; name?: string }) => unknown; };
  api.chart.onFocusPerson = (cb: unknown) => { chartBridge.focusPerson = cb as (a: { person_id: string }) => unknown; };
  api.chart.onGetLayout = (cb: unknown) => { chartBridge.getLayout = cb as () => unknown; };
  api.chart.removeAllChartHandlers = () => {
    delete chartBridge.getVisiblePersons;
    delete chartBridge.selectPerson;
    delete chartBridge.focusPerson;
    delete chartBridge.getLayout;
  };

  if (!api.print) api.print = {};
  api.print.print = async () => { window.print(); return { ok: true }; };
  api.print.exportPdf = async () => {
    // Same dialog as print.print — user clicks "Save as PDF" in it.
    window.print();
    return { ok: true, note: 'Use Save-as-PDF in the native print dialog' };
  };

  if (!api.app) api.app = {};
  api.app.getVersion = async () => '0.0.1-tauri';
  api.app.openExternal = async (url: unknown) => {
    if (typeof url !== 'string') return;
    // Use the Rust opener plugin's invoke surface directly so we don't
    // pull another @tauri-apps/* npm package into the renderer.
    await invoke('plugin:opener|open_url', { url }).catch(() => { /* ignore */ });
  };
  api.app.onOpenAbout = () => { /* menu wires this in main.ts */ };
  api.app.readThirdPartyLicenses = async () => {
    // The file is bundled as a Tauri resource (see src-tauri/tauri.conf.json
    // → bundle.resources). In packaged builds Tauri places it inside the
    // app's Resources/_up_/ folder; the Rust command resolves both that
    // and the flat layout. In `tauri dev` the resource isn't packaged, so
    // invoke fails — return '' so Settings → About shows an empty viewer
    // rather than a hard error.
    try {
      return await invoke<string>('read_bundled_resource', { name: 'THIRD_PARTY_LICENSES.txt' });
    } catch {
      return '';
    }
  };

  if (!api.onboarding) api.onboarding = {};
  api.onboarding.reset = async () => {
    // db_settings keys prefixed onboarding:* — clear them.
    const dbSet = await import('../api/db_settings');
    const all = (await dbSet.getDbSetting(getDb(), 'onboarding-keys')) as string | null;
    const keys = all ? JSON.parse(all) as string[] : [];
    for (const k of keys) await dbSet.deleteDbSetting(getDb(), k);
  };

  api.csv.export = async (opts: unknown) => {
    const o = opts as { entityType?: string; delimiter?: string; encoding?: 'utf-8' | 'utf-8-bom' } | undefined;
    if (!o?.entityType) return { success: false, error: 'entityType is required' };
    const defaultNames: Record<string, string> = {
      persons: 'persons.csv', events: 'events.csv', sources: 'sources.csv', places: 'places.csv',
    };
    const defaultName = defaultNames[o.entityType];
    if (!defaultName) return { success: false, error: 'Unknown entityType: ' + o.entityType };
    const r = await saveFile('Export CSV', defaultName, ['csv'], 'CSV Files');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      // Reuse the csv:_exportRun worker channel — already in the registry,
      // already polyfilled, runs the same api/ functions in renderer.
      const ch = getChannel('csv:_exportRun');
      if (!ch) return { success: false, error: 'csv:_exportRun not registered' };
      const result = await (ch.handler as (db: Database, opts: unknown) => Promise<{ csv?: string; error?: string }>)(getDb(), o);
      if (result.error) return { success: false, error: result.error };
      const encoding = o.encoding ?? 'utf-8';
      const csvOut = encoding === 'utf-8-bom' ? '﻿' + (result.csv ?? '') : (result.csv ?? '');
      await invoke('fs_write_text', { path: r.path, contents: csvOut });
      return { success: true, filePath: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // Top-level entries on window.api that the composables call directly.
  // useEntityData / usePagedList / App.vue badge debouncer all call
  // `window.api.onDataChanged(cb)`. Without this assignment the polyfill
  // walks every channel but the cross-view reactivity contract breaks.
  (api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged =
    (cb: () => void) => { dataChangedListeners.push(cb); };
  // Match the preload's name exactly (offDataChanged, not off).
  (api as unknown as { offDataChanged: (cb: () => void) => void }).offDataChanged =
    (cb: () => void) => {
      const idx = dataChangedListeners.indexOf(cb);
      if (idx >= 0) dataChangedListeners.splice(idx, 1);
    };

  // window.api gets the polyfilled shape. The Electron-only
  // onDataChanged subscription mechanism is exposed too so existing
  // renderer composables (useEntityData, usePagedList) keep working.
  (globalThis as unknown as { api: typeof api }).api = api;

  return {
    api,
    onDataChanged: (cb: () => void) => { dataChangedListeners.push(cb); },
  };
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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
