/**
 * RootsMagic .rmgc import orchestrator.
 *
 * Two entry points:
 *
 * 1. `importFromRootsMagic(ourDb, rmgcPath)` — opens the .rmgc file as a
 *    second `node-sqlite3-wasm` Database. Used by the Electron worker
 *    thread, where `import { Database } from 'node-sqlite3-wasm'` resolves
 *    to the real WASM module.
 *
 * 2. `importFromRootsMagicDb(ourDb, sourceDb)` — bytes-in, no fs. Takes any
 *    object that satisfies the `Database`-like surface used by `queryAll` /
 *    `queryOne`. The Tauri build's renderer-side polyfill calls this with a
 *    `SecondaryDatabase` (src/renderer/secondary-db-shim.ts) opened against
 *    a temp file written from the picked .rmgc bytes. The actual transform
 *    is identical regardless of how the source connection is provided.
 *
 * Both wrap `transformRootsMagic` in a single `BEGIN IMMEDIATE` /
 * `COMMIT` on the destination DB for performance — without it, every
 * INSERT in the per-row loop would fsync individually.
 */

import { Database } from '../../shared/sqlite3-wasm';
import { runSql } from '../../api/db';
import {
  transformRootsMagic,
  emptyRootsMagicSummary,
  type RootsMagicImportSummary,
} from './transform';

export interface RootsMagicImportOptions {
  onProgress?: (msg: string) => void;
}

export interface RootsMagicImportResult {
  summary: RootsMagicImportSummary;
}

/**
 * Minimal source-DB shape that `transformRootsMagic` needs. Only the
 * methods touched by `queryAll(rmDb, sql)` (i.e. `prepare(sql)` →
 * `.all([params]) / .finalize()`). Both `node-sqlite3-wasm`'s `Database`
 * and the Tauri-side `SecondaryDatabase` shim satisfy this contract. We
 * deliberately type the parameter as `Database` here because the api/
 * helpers were written against `node-sqlite3-wasm` types — the Tauri shim
 * is shape-compatible.
 */

/**
 * Run the import against an already-opened source connection. Use this
 * from the Tauri build (where the renderer can't open a second
 * `node-sqlite3-wasm` Database from inside the WebView) by passing a
 * `SecondaryDatabase`. The caller owns the source connection's lifecycle.
 */
export async function importFromRootsMagicDb(
  ourDb: Database,
  sourceDb: Database,
  options: RootsMagicImportOptions = {},
): Promise<RootsMagicImportResult> {
  const { onProgress = () => { /* noop */ } } = options;
  onProgress('Importing…');
  let summary = emptyRootsMagicSummary();
  await runSql(ourDb, 'BEGIN IMMEDIATE');
  try {
    summary = await transformRootsMagic(ourDb, sourceDb);
    await runSql(ourDb, 'COMMIT');
  } catch (err) {
    try { await runSql(ourDb, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
  return { summary };
}

/** Import from a RootsMagic .rmgc file (a SQLite database). */
export async function importFromRootsMagic(
  ourDb: Database,
  rmgcPath: string,
  options: RootsMagicImportOptions = {},
): Promise<RootsMagicImportResult> {
  const { onProgress = () => { /* noop */ } } = options;

  onProgress('Opening RootsMagic database…');
  // Open read-only — we never write to the source file.
  const rmDb = new Database(rmgcPath, { readOnly: true });

  try {
    return await importFromRootsMagicDb(ourDb, rmDb, options);
  } finally {
    rmDb.close();
  }
}
