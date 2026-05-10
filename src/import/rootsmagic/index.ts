/**
 * RootsMagic .rmgc import orchestrator.
 *
 * Opens the .rmgc file (it's plain SQLite — no Java, no Docker, no native
 * libraries beyond the same node-sqlite3-wasm we already ship) and hands
 * it to the transform layer. Wraps the transform in a single transaction
 * on the destination database for performance.
 */

import { Database } from 'node-sqlite3-wasm';
import { runSql } from '../../api/db';
import { transformRootsMagic, emptyRootsMagicSummary, type RootsMagicImportSummary } from './transform';

export interface RootsMagicImportOptions {
  onProgress?: (msg: string) => void;
}

export interface RootsMagicImportResult {
  summary: RootsMagicImportSummary;
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
    onProgress('Importing…');
    let summary = emptyRootsMagicSummary();
    await runSql(ourDb, 'BEGIN IMMEDIATE');
    try {
      summary = await transformRootsMagic(ourDb, rmDb);
      await runSql(ourDb, 'COMMIT');
    } catch (err) {
      try { await runSql(ourDb, 'ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
    return { summary };
  } finally {
    rmDb.close();
  }
}
