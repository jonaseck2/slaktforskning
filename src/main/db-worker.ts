/**
 * DB Worker — runs in a Node.js Worker Thread, owns the SQLite connection.
 * All DB-touching IPC channels are dispatched here so the Electron main thread
 * is never blocked by SQLite.
 */
import { parentPort } from 'node:worker_threads';
import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs';
import { Database } from 'node-sqlite3-wasm';
// Registry imports — channels registered here are dispatched before the legacy table
import { channelRegistry } from '../shared/channels';
import { initializeSchema } from '../api/schema';
import { undoManager } from '../api/undo';
import * as persons from '../api/persons';
import * as checks from '../api/checks';
import * as media from '../api/media';
import { queryAll } from '../api/db';
import { buildSnapshot } from '../api/html_site/snapshot';
import { buildPreview } from '../api/html_site/preview';

if (!parentPort) throw new Error('db-worker must run in a worker thread');

// ── DB state ──────────────────────────────────────────────────────────────────

let db: Database | null = null;
let dbPath: string | null = null;
let importInProgress = false;

function getDb(): Database {
  if (!db) throw new Error('Worker DB not initialized');
  return db;
}

function getDbDir(): string {
  if (!dbPath) throw new Error('Worker DB path not set');
  return nodePath.dirname(dbPath);
}

function openDb(filePath: string): void {
  if (db) { try { db.close(); } catch { /* ignore */ } db = null; }
  nodeFs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
  const lockPath = filePath + '.lock';
  if (nodeFs.existsSync(lockPath) && nodeFs.statSync(lockPath).isDirectory()) {
    nodeFs.rmSync(lockPath, { recursive: true });
  }
  const newDb = new Database(filePath);
  newDb.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  initializeSchema(newDb);
  db = newDb;
  dbPath = filePath;
}

// ── Checks cancellation counter ───────────────────────────────────────────────

let checksRunId = 0;

// ── Dispatch table ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (...args: any[]) => unknown> = {

  // Persons — migrated to registry (src/shared/channels/persons.ts)

  // Events — migrated to registry (src/shared/channels/events.ts)

  // Relationships — migrated to registry (src/shared/channels/relationships.ts)

  // Sources & Citations — migrated to registry (src/shared/channels/sources.ts)

  // Places — migrated to registry (src/shared/channels/places.ts)

  // Gazetteers — migrated to registry (src/shared/channels/gazetteers.ts)

  // Media (most channels migrated to registry — src/shared/channels/media.ts)
  // These two remain here because they require getDbDir() (worker-local state):
  'media:getFilePath': (id) => {
    const item = media.getMedia(getDb(), id);
    if (!item?.file_ref) return null;
    const absPath = nodePath.resolve(getDbDir(), item.file_ref);
    return nodeFs.existsSync(absPath) ? absPath : null;
  },
  'media:readAsDataUrl': (id) => {
    const item = media.getMedia(getDb(), id);
    if (!item?.file_ref) return null;
    const absPath = nodePath.resolve(getDbDir(), item.file_ref);
    if (!nodeFs.existsSync(absPath)) return null;
    const ext = nodePath.extname(absPath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    };
    const mime = mimeMap[ext] ?? 'image/jpeg';
    return `data:${mime};base64,${nodeFs.readFileSync(absPath).toString('base64')}`;
  },

  // Media Regions — migrated to registry (src/shared/channels/media.ts)

  // DB settings — migrated to registry (src/shared/channels/database.ts)

  // Undo (partial — undo:state, beginGroup, endGroup migrated to registry)
  // undo:undo and undo:redo remain here because they broadcast undo:changed
  // to all BrowserWindows after the call (handled in ipc/database.ts).
  'undo:undo': () => undoManager.undo(),
  'undo:redo': () => undoManager.redo(),

  // Groups — migrated to registry (src/shared/channels/groups.ts)

  // Repositories — migrated to registry (src/shared/channels/repositories.ts)

  // Research tasks — migrated to registry (src/shared/channels/research-tasks.ts)

  // Reports, duplicates — migrated to registry (src/shared/channels/reports.ts)

  // Checks (async — yield between each check to stay responsive)
  'checks:runAll': async () => {
    if (importInProgress) {
      console.log('[worker] checks:runAll skipped — import in progress');
      return [];
    }
    const runId = ++checksRunId;
    const d = getDb();
    const dbDir = getDbDir();
    const allChecks = checks.getAllCheckFunctions();
    const results: checks.CheckResult[] = [];
    const t0 = Date.now();
    console.log(`[worker/checks] runAll #${runId} starting (${allChecks.length} checks)`);

    for (const check of allChecks) {
      if (runId !== checksRunId) { console.log(`[worker/checks] runAll #${runId} cancelled`); return null; }
      await new Promise<void>(resolve => setImmediate(resolve));
      if (runId !== checksRunId) { console.log(`[worker/checks] runAll #${runId} cancelled`); return null; }
      const start = Date.now();
      const res = check.fn(d, dbDir);
      console.log(`[worker/checks] ${check.name}: ${Date.now() - start}ms → ${res.length}`);
      results.push(...res);
    }

    if (runId !== checksRunId) return null;
    console.log(`[worker/checks] runAll #${runId}: ${Date.now() - t0}ms → ${results.length} raw`);

    const countByCode = new Map<string, number>();
    const capped = results.filter(r => {
      if (r.severity !== 'notice') return true;
      const n = (countByCode.get(r.code) ?? 0) + 1;
      countByCode.set(r.code, n);
      return n <= 500;
    });

    const allIds = [...new Set(capped.flatMap(r => r.personIds))];
    const nameMap = persons.getPersonDisplayNames(d, allIds);

    const allPlaceIds = [...new Set(capped.flatMap(r => r.placeIds ?? []))];
    const placeNameMap = new Map<string, string>();
    if (allPlaceIds.length > 0) {
      const ph = allPlaceIds.map(() => '?').join(',');
      const rows = queryAll<{ id: string; name: string }>(d, `SELECT id, name FROM places WHERE id IN (${ph})`, allPlaceIds);
      for (const r of rows) placeNameMap.set(r.id, r.name);
    }

    const allMediaIds = [...new Set(capped.flatMap(r => r.mediaIds ?? []))];
    const mediaTitleMap = new Map<string, string>();
    if (allMediaIds.length > 0) {
      const ph = allMediaIds.map(() => '?').join(',');
      const rows = queryAll<{ id: string; title: string | null; file_ref: string | null }>(d, `SELECT id, title, file_ref FROM media WHERE id IN (${ph})`, allMediaIds);
      for (const r of rows) mediaTitleMap.set(r.id, r.title || r.file_ref || '');
    }

    const allSourceIds = [...new Set(capped.flatMap(r => r.sourceIds ?? []))];
    const sourceTitleMap = new Map<string, string>();
    if (allSourceIds.length > 0) {
      const ph = allSourceIds.map(() => '?').join(',');
      const rows = queryAll<{ id: string; title: string | null }>(d, `SELECT id, title FROM sources WHERE id IN (${ph})`, allSourceIds);
      for (const r of rows) sourceTitleMap.set(r.id, r.title || '');
    }

    return capped.map(r => ({
      ...r,
      personNames: r.personIds.map(id => nameMap.get(id) ?? ''),
      placeNames: r.placeIds?.map(id => placeNameMap.get(id) ?? '') ?? [],
      mediaTitles: r.mediaIds?.map(id => mediaTitleMap.get(id) ?? '') ?? [],
      sourceTitles: r.sourceIds?.map(id => sourceTitleMap.get(id) ?? '') ?? [],
    }));
  },

  'checks:forPerson': async (personId) => {
    const d = getDb();
    const dbDir = getDbDir();
    const results: checks.CheckResult[] = [];
    for (const check of checks.getAllCheckFunctions()) {
      if (check.global) continue;
      await new Promise<void>(resolve => setImmediate(resolve));
      const res = check.fn(d, dbDir);
      results.push(...res.filter(r => r.personIds.includes(personId)));
    }
    return results;
  },

  'checks:forPlace': (placeId) => checks.runChecksForPlace(getDb(), placeId, getDbDir()),

  'checks:forMedia': (mediaId) => checks.runChecksForMedia(getDb(), mediaId, getDbDir()),

  // Website export
  'website:buildSnapshot': (opts) => buildSnapshot(getDb(), opts),
  'website:buildPreview': (opts) => buildPreview(getDb(), opts),
};

/** Channel names handled in this worker — imported by the coverage test. */
export const WORKER_CHANNELS: ReadonlySet<string> = new Set(Object.keys(handlers));

// ── Message loop ──────────────────────────────────────────────────────────────

type LifecycleMsg =
  | { type: 'init'; dbPath: string }
  | { type: 'db-switch'; dbPath: string }
  | { type: 'import-start' }
  | { type: 'import-end' };

type CallMsg = { id: number; channel: string; args: unknown[] };

parentPort.on('message', async (msg: LifecycleMsg | CallMsg) => {
  if ('type' in msg) {
    if (msg.type === 'init') {
      openDb(msg.dbPath);
      parentPort!.postMessage({ type: 'ready' });
    } else if (msg.type === 'db-switch') {
      openDb(msg.dbPath);
      undoManager.clear();
      parentPort!.postMessage({ type: 'switched' });
    } else if (msg.type === 'import-start') {
      importInProgress = true;
    } else if (msg.type === 'import-end') {
      importInProgress = false;
    }
    return;
  }

  const { id, channel, args } = msg as CallMsg;

  // Registry first — channels migrated to src/shared/channels/*.ts are dispatched here
  const regCh = channelRegistry[channel];
  if (regCh && regCh.thread === 'worker') {
    try {
      const result = await Promise.resolve(regCh.handler(getDb(), ...args));
      parentPort!.postMessage({ id, result: result ?? null });
    } catch (err) {
      parentPort!.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Legacy fallback — channels not yet migrated to registry
  const handler = handlers[channel];
  if (!handler) {
    parentPort!.postMessage({ id, error: `No worker handler for channel: ${channel}` });
    return;
  }
  try {
    const result = await Promise.resolve(handler(...args));
    parentPort!.postMessage({ id, result: result ?? null });
  } catch (err) {
    parentPort!.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
