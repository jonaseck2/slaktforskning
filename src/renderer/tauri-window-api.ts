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
// db:switched / undo:changed / undo:performed are discrete events the renderer
// subscribes to via window.api.db.onSwitched / undo.onChanged / undo.onPerformed.
// In Electron these are ipcRenderer.on(channel) wires; here we keep parallel
// in-process listener registries and broadcast across windows via the Tauri
// event bus, mirroring the data:changed pattern below.
const dbSwitchedListeners: Array<() => void> = [];
const undoChangedListeners: Array<() => void> = [];
const undoPerformedListeners: Array<(data: { type: string; label: string }) => void> = [];
let suppressNextRemoteFire = false;
let suppressNextRemoteDbSwitched = false;
let suppressNextRemoteUndoChanged = false;
let suppressNextRemoteUndoPerformed = false;
function fireDataChanged(): void {
  for (const cb of dataChangedListeners) cb();
  // Fire-and-forget cross-window broadcast.
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteFire = true;  // local listener will receive our own emit
    emit('data:changed').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireDbSwitched(): void {
  for (const cb of dbSwitchedListeners) cb();
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteDbSwitched = true;
    emit('db:switched').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireUndoChanged(): void {
  for (const cb of undoChangedListeners) cb();
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteUndoChanged = true;
    emit('undo:changed').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireUndoPerformed(data: { type: string; label: string }): void {
  for (const cb of undoPerformedListeners) cb(data);
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteUndoPerformed = true;
    emit('undo:performed', data).catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}

// Set up the inverse — receive these events from other windows.
import('@tauri-apps/api/event').then(({ listen }) => {
  listen('data:changed', () => {
    if (suppressNextRemoteFire) { suppressNextRemoteFire = false; return; }
    for (const cb of dataChangedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen('db:switched', () => {
    if (suppressNextRemoteDbSwitched) { suppressNextRemoteDbSwitched = false; return; }
    for (const cb of dbSwitchedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen('undo:changed', () => {
    if (suppressNextRemoteUndoChanged) { suppressNextRemoteUndoChanged = false; return; }
    for (const cb of undoChangedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen<{ type: string; label: string }>('undo:performed', (event) => {
    if (suppressNextRemoteUndoPerformed) { suppressNextRemoteUndoPerformed = false; return; }
    for (const cb of undoPerformedListeners) cb(event.payload);
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
  // Recent databases — stored as JSON in db_settings under 'recent_dbs'.
  // switchDbTo() prepends each newly-opened path with dedupe and a 10-entry
  // cap, mirroring the Electron build's settings.json-backed list.
  api.db.getRecent = async () => {
    try {
      const dbSet = await import('../api/db_settings');
      const raw = await dbSet.getDbSetting(getDb(), 'recent_dbs');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<{ path: string; name: string; lastOpenedAt?: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  // Discrete db:switched event — onSwitched(cb) registers a callback that
  // fires after every switchDbTo. Distinct from data:changed (which also
  // fires) so subscribers like App.vue's window.location.reload listener
  // can react specifically to a DB switch without piggy-backing.
  api.db.onSwitched = (cb: unknown) => {
    if (typeof cb === 'function') dbSwitchedListeners.push(cb as () => void);
  };

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
  api.import.holgerSelectMedia = () => pickFolder('Select Holger media folder (optional)');
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

  // RootsMagic — pick file, write its bytes to a temp file via Rust (so
  // rusqlite has a real path to open), open as a read-only secondary
  // SQLite connection through the SecondaryDatabase shim, then run the
  // shared `importFromRootsMagicDb` transform against the active DB.
  // Cleanup (close secondary + delete temp) lives in the `finally` block
  // so a failed import doesn't leak the rusqlite handle or the temp file.
  // Accepts both `{ sourcePath }` (the renderer UI's wire shape) and
  // `{ filePath }` (the channel-spec name) so neither side has to change.
  api.import.rootsmagicRun = async (opts: unknown) => {
    const o = opts as { sourcePath?: string; filePath?: string } | undefined;
    const path = o?.sourcePath ?? o?.filePath;
    if (!path) return { success: false, error: 'sourcePath is required' };
    let tempPath: string | null = null;
    let secondary: import('./secondary-db-shim').SecondaryDatabase | null = null;
    try {
      const [{ SecondaryDatabase }, rmMod] = await Promise.all([
        import('./secondary-db-shim'),
        import('../import/rootsmagic'),
      ]);
      // Read picked file → write to OS temp dir → hand temp path to
      // secondary_db_open. We can't pass the user's original path
      // straight to rusqlite because (a) the renderer's chosen-file
      // sandbox might not grant Rust the same access on all platforms,
      // and (b) the .rmgc may live on a network share where read-only
      // SQLite open + journal probing is unreliable.
      const b64 = await invoke<string>('fs_read_bytes_base64', { path });
      const baseName = path.split(/[\\/]/).pop() ?? 'rootsmagic.rmgc';
      tempPath = await invoke<string>('fs_write_temp_bytes_base64', { name: baseName, b64 });
      secondary = await SecondaryDatabase.open(tempPath);
      const result = await rmMod.importFromRootsMagicDb(
        getDb(),
        secondary as unknown as Database,
      );
      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      if (secondary) {
        try { secondary.close(); } catch { /* ignore */ }
      }
      if (tempPath) {
        try { await invoke('fs_remove_file', { path: tempPath }); } catch { /* ignore */ }
      }
    }
  };

  // Holger / Genney importers do extensive fs operations (directory
  // walks, mdb→sqlite extraction, Docker/Java spawning) that need
  // wholesale Rust-side replacements. They stay throw-on-call in the
  // Tauri build until that work lands. The file picker still works so
  // the UI doesn't crash; the run handler returns a clear error.
  const notWired = (label: string) => async () => ({
    success: false,
    error: `${label} import is not yet wired in the Tauri build (deferred)`,
  });
  api.import.holgerRun = notWired('Holger');
  api.import.genneyRun = notWired('Genney');
  api.import.genneyDiscover = async () => ({ success: false, error: 'genneyDiscover not yet wired in Tauri build' });

  if (!api.archive) api.archive = {};
  // Archive export — open save dialog, build zip in memory via the pure
  // `exportArchiveToBytes` helper (which calls the supplied media reader
  // for each `file_ref` row), then write the resulting bytes via
  // `fs_write_bytes_base64`. Mirrors the Electron archive:_exportRun
  // worker channel without the worker hop.
  api.archive.export = async (opts?: unknown) => {
    const o = opts as { gedcomVersion?: '5.5.1' | '7.0' } | undefined;
    const version = o?.gedcomVersion ?? '5.5.1';
    const r = await saveFile('Export Archive', 'family-tree.zip', ['zip'], 'Zip Archive');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const archiveMod = await import('../api/archive_export');
      const dbDir = (await dbDirFromPath()) ?? '';
      const mediaReader = async (relPath: string): Promise<Uint8Array | null> => {
        try {
          const abs = dbDir ? `${dbDir}/${relPath}` : relPath;
          const b64 = await invoke<string>('fs_read_bytes_base64', { path: abs });
          return base64ToUint8Array(b64);
        } catch {
          return null;
        }
      };
      const { zipBytes, report } = await archiveMod.exportArchiveToBytes(
        getDb(),
        mediaReader,
        { gedcomVersion: version },
      );
      const b64 = uint8ArrayToBase64(zipBytes);
      await invoke('fs_write_bytes_base64', { path: r.path, b64 });
      return { exported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  // Archive import — open file dialog, read zip bytes via
  // `fs_read_bytes_base64`, hand them to the pure
  // `importArchiveFromBytes` helper. Each media entry is written through
  // a writer that resolves into the active DB's `<dbname>-media/` folder
  // using `fs_write_bytes_base64`. Mirrors archive:_importRun.
  api.archive.import = async () => {
    const r = await pickFile('Import Archive', ['zip'], 'Zip Archive');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const archiveMod = await import('../api/archive_import');
      const cur = await invoke<string | null>('db_current_path');
      if (!cur) return { canceled: false, error: 'no DB open' };
      const dbDir = cur.replace(/[\\/][^\\/]+$/, '');
      const dbBase = (cur.split(/[\\/]/).pop() ?? '').replace(/\.(db|sqlite|sqlite3)$/i, '');
      const mediaFolderName = `${dbBase}-media`;
      const mediaDir = `${dbDir}/${mediaFolderName}`;

      const b64 = await invoke<string>('fs_read_bytes_base64', { path: r.path });
      const zipBytes = base64ToUint8Array(b64);

      const mediaWriter = async (filename: string, bytes: Uint8Array): Promise<void> => {
        const dest = `${mediaDir}/${filename}`;
        const outB64 = uint8ArrayToBase64(bytes);
        await invoke('fs_write_bytes_base64', { path: dest, b64: outB64 });
      };

      const report = await archiveMod.importArchiveFromBytes(
        getDb(),
        zipBytes,
        mediaFolderName,
        mediaWriter,
      );
      fireDataChanged();
      return { imported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  if (!api.export) api.export = {};
  api.export.openFolder = async (folderPath: unknown) => {
    if (typeof folderPath !== 'string') return { ok: false };
    await invoke('shell_reveal', { path: folderPath });
    return { ok: true };
  };

  if (!api.csv) api.csv = {};

  // Backup: copy the active DB file to a user-chosen path. Mirrors the
  // Electron handler (src/main/ipc/database.ts → backup:backup) which uses
  // dialog.showSaveDialog + fs.copyFileSync. Restore picks an existing .db
  // file then switchTo's it (which triggers the regular UI reload path).
  if (!api.backup) api.backup = {};
  api.backup.backup = async () => {
    try {
      const currentPath = await invoke<string | null>('db_current_path');
      if (!currentPath) return { success: false, error: 'No database open' };
      const base = (currentPath.split(/[\\/]/).pop() ?? 'family.db').replace(/\.db$/i, '');
      const today = new Date().toISOString().slice(0, 10);
      const defaultName = `${base}-backup-${today}.db`;
      const r = await saveFile('Spara säkerhetskopia', defaultName, ['db'], 'SQLite Database');
      if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
      await invoke('fs_copy_file', { src: currentPath, dest: r.path });
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };
  api.backup.restore = async () => {
    try {
      const r = await pickFile('Välj säkerhetskopia', ['db'], 'SQLite Database');
      if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
      await switchDbTo(r.path, /* createSchema */ false);
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // Undo / Redo — main-only in Electron because they post-call broadcast
  // data:changed to all BrowserWindows. In Tauri, the renderer fires the
  // same fan-out via fireDataChanged() + the discrete undo events the
  // Electron preload exposes (`undo:changed`, `undo:performed`).
  if (!api.undo) api.undo = {};
  api.undo.undo = async () => {
    const label = await undoManager.undo();
    fireDataChanged();
    fireUndoChanged();
    if (label) fireUndoPerformed({ type: 'undo', label });
    return label;
  };
  api.undo.redo = async () => {
    const label = await undoManager.redo();
    fireDataChanged();
    fireUndoChanged();
    if (label) fireUndoPerformed({ type: 'redo', label });
    return label;
  };
  api.undo.onChanged = (cb: unknown) => {
    if (typeof cb === 'function') undoChangedListeners.push(cb as () => void);
  };
  api.undo.onPerformed = (cb: unknown) => {
    if (typeof cb === 'function') undoPerformedListeners.push(cb as (data: { type: string; label: string }) => void);
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
  // Chart export — Reports view's "Save SVG" passes a serialised SVG
  // string + filename hint. Mirrors the Electron handler shape in
  // src/main/ipc/main-only.ts → chart:saveSvg.
  api.chart.saveSvg = async (svgContent: unknown, fileNameHint?: unknown) => {
    if (typeof svgContent !== 'string') return { success: false, error: 'svgContent must be string' };
    const r = await saveFile('Save Wall Chart SVG', (typeof fileNameHint === 'string' ? fileNameHint : 'chart.svg'), ['svg'], 'SVG');
    if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
    try {
      await invoke('fs_write_text', { path: r.path, contents: svgContent });
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };
  // Chart PDF: Tauri 2 has no equivalent of Electron's hidden BrowserWindow
  // + webContents.printToPDF. Fall back to window.print() (matches the
  // existing print.exportPdf polyfill); user picks "Save as PDF" in the
  // native dialog. Regression: filename hint and explicit page-size are
  // ignored, and the user has to manually choose PDF in the print dialog.
  api.chart.savePdf = async (_svgContent: unknown, _pxWidth: unknown, _pxHeight: unknown, _fileNameHint?: unknown) => {
    window.print();
    return { success: true, note: 'Use Save-as-PDF in the native print dialog' };
  };

  if (!api.print) api.print = {};
  api.print.print = async () => { window.print(); return { ok: true }; };
  api.print.exportPdf = async () => {
    // Same dialog as print.print — user clicks "Save as PDF" in it.
    window.print();
    return { ok: true, note: 'Use Save-as-PDF in the native print dialog' };
  };

  if (!api.app) api.app = {};
  api.app.getVersion = async () => {
    try {
      return await invoke<string>('app_version');
    } catch {
      return 'unknown';
    }
  };
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

  // Onboarding ("seen" callout state). The Electron build stores this in the
  // per-user settings.json (src/main/ipc/onboarding.ts → loadSettings); the
  // Tauri build keeps it per-DB in db_settings under a single JSON object so
  // the data lives alongside the genealogist's database, not a sibling
  // settings file Tauri doesn't have. Same shape as the Electron preload:
  // getSeen → Record<string, true>, markSeen(key) → void.
  if (!api.onboarding) api.onboarding = {};
  const ONBOARDING_KEY = 'onboarding-seen';
  api.onboarding.getSeen = async () => {
    const dbSet = await import('../api/db_settings');
    const raw = await dbSet.getDbSetting(getDb(), ONBOARDING_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed as Record<string, true> : {};
    } catch {
      return {};
    }
  };
  api.onboarding.markSeen = async (keyArg: unknown) => {
    // Preload signature: markSeen(key: string) — no wrapping object.
    const key = typeof keyArg === 'string'
      ? keyArg
      : (keyArg as { key?: string } | undefined)?.key;
    if (!key) return;
    const dbSet = await import('../api/db_settings');
    const raw = await dbSet.getDbSetting(getDb(), ONBOARDING_KEY);
    let current: Record<string, true> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') current = parsed as Record<string, true>;
      } catch { /* ignore — start fresh */ }
    }
    current[key] = true;
    await dbSet.setDbSetting(getDb(), ONBOARDING_KEY, JSON.stringify(current));
  };
  api.onboarding.reset = async () => {
    const dbSet = await import('../api/db_settings');
    await dbSet.deleteDbSetting(getDb(), ONBOARDING_KEY);
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunked btoa to avoid call-stack overflow on large arrays (zip blobs
  // can be tens of MB). 32 KiB chunks comfortably stay under the
  // String.fromCharCode arg limit on every browser.
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    bin += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(bin);
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
  // Update recent-files list (per-DB store, so reads back the row from
  // whichever DB is now active). Cap at 10 entries, dedupe by path,
  // newest first. Failures are silent — recent-files is non-essential.
  try {
    if (dbInstance) {
      const dbSet = await import('../api/db_settings');
      const raw = await dbSet.getDbSetting(dbInstance, 'recent_dbs');
      const existing = raw ? (JSON.parse(raw) as Array<{ path: string; name: string; lastOpenedAt?: string }>) : [];
      const filtered = existing.filter(e => e?.path !== path);
      const next = [{ path, name: deriveDbName(path), lastOpenedAt: new Date().toISOString() }, ...filtered].slice(0, 10);
      await dbSet.setDbSetting(dbInstance, 'recent_dbs', JSON.stringify(next));
    }
  } catch { /* ignore — recent-files is best-effort */ }
  fireDbSwitched();
  fireDataChanged();
}
