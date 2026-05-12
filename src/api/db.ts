import type { Database } from 'node-sqlite3-wasm';

/**
 * node-sqlite3-wasm compiled statements live in the Emscripten WASM heap.
 * JS GC does NOT free them. Always finalize after use to prevent WASM OOM.
 *
 * Use these helpers instead of db.prepare() directly.
 *
 * Async signatures: these helpers are async to prepare for the Tauri full-port,
 * where the implementations will swap from sync node-sqlite3-wasm to
 * `await invoke('db:run', ...)`. For now, the bodies remain synchronous and
 * the async wrapper auto-wraps the return value in a resolved Promise — zero
 * runtime behavior change under Electron.
 */

type Finalizable = { finalize(): void };

// Statement methods get awaited here so the helpers work against BOTH:
//   - the real node-sqlite3-wasm Database (sync — `await syncCall()` returns
//     the value directly through the await operator)
//   - the Tauri-side shim Database from src/renderer/db-shim.ts (async —
//     each invocation routes through Tauri to rusqlite)
// vite.config.ts in the Tauri build aliases `node-sqlite3-wasm` to the shim;
// the Electron build keeps the real package. Same api/ source, two backends.

export async function queryOne<T>(db: Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const stmt = db.prepare(sql);
  try { return await stmt.get(params) as T | undefined; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export async function queryAll<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const stmt = db.prepare(sql);
  try { return await stmt.all(params) as T[]; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export async function runSql(db: Database, sql: string, params: unknown[] = []): Promise<void> {
  const stmt = db.prepare(sql);
  try { await stmt.run(params); }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

/** Alias for runSql — used by tests and places where "queryRun" reads more naturally. */
export const queryRun = runSql;

export async function runSqlChanges(db: Database, sql: string, params: unknown[] = []): Promise<number> {
  const stmt = db.prepare(sql);
  try { return ((await stmt.run(params)) as { changes: number }).changes; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

/**
 * Per-row run result. Same shape as node-sqlite3-wasm's `Statement.run` and
 * the Tauri shim's `RunResult` (renderer/db-shim.ts). The Tauri shim returns
 * `lastInsertRowid` (camelCase); the Electron path returns the same camelCase
 * key — both backends report the per-row insert rowid (when applicable).
 */
export interface BatchRunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * Bulk-run one prepared statement against many parameter rows. Use this
 * whenever a write loop's row count is unbounded or > ~50 — per-row
 * `await stmt.run([...])` pays ~1 ms of IPC overhead per iteration on the
 * Tauri build, which turns million-row Holger imports into multi-hour
 * waits. See `.claude/rules/api.md` "SQLite bulk-write performance".
 *
 * Backend behaviour:
 *   - Tauri: dispatches to one `db_batch_run` IPC call. The Rust side holds
 *     the connection mutex for the whole batch, prepares the SQL once, and
 *     iterates rows under the lock.
 *   - Electron / node-sqlite3-wasm: there's no native batch primitive, but
 *     the cost we're avoiding (the IPC roundtrip) doesn't exist on the
 *     in-process WASM path. A sync for-loop calling `stmt.run([row])`
 *     produces the same observable result with the same per-row
 *     RunResult shape.
 *
 * The caller must hold a transaction (`BEGIN; ... COMMIT;`) around the
 * batch so a mid-batch error rolls back atomically. The batch helper
 * doesn't open or close transactions — that's the importer's job.
 *
 * Returns one BatchRunResult per row in input order. Throws on the first
 * failing row; rows before the failure have executed against the
 * connection (the surrounding ROLLBACK undoes them).
 */
export async function runBatch(
  db: Database,
  sql: string,
  paramsList: unknown[][],
): Promise<BatchRunResult[]> {
  if (paramsList.length === 0) return [];
  const stmt = db.prepare(sql);
  try {
    const maybeBatch = (stmt as unknown as { runBatch?: (rows: unknown[][]) => Promise<BatchRunResult[]> }).runBatch;
    if (typeof maybeBatch === 'function') {
      return await maybeBatch.call(stmt, paramsList);
    }
    // Electron / node-sqlite3-wasm path: no batch primitive, but the IPC
    // roundtrip the Tauri batch avoids doesn't exist here. A simple loop
    // produces the same shape and same per-row results.
    const out: BatchRunResult[] = new Array(paramsList.length);
    for (let i = 0; i < paramsList.length; i++) {
      const r = (await stmt.run(paramsList[i])) as { changes: number; lastInsertRowid: number };
      out[i] = { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    }
    return out;
  } finally {
    (stmt as unknown as Finalizable).finalize();
  }
}

/**
 * Same as runBatch but accepts a pre-prepared statement (typically from
 * `withStatementCache`'s proxy). Useful inside an importer where a single
 * SQL is reused across many flushes — keeps the cached statement, just
 * batches the params. The statement is NOT finalized here — the cache or
 * the caller owns its lifetime.
 */
export async function runBatchOnStatement(
  stmt: ReturnType<Database['prepare']>,
  paramsList: unknown[][],
): Promise<BatchRunResult[]> {
  if (paramsList.length === 0) return [];
  const maybeBatch = (stmt as unknown as { runBatch?: (rows: unknown[][]) => Promise<BatchRunResult[]> }).runBatch;
  if (typeof maybeBatch === 'function') {
    return await maybeBatch.call(stmt, paramsList);
  }
  const out: BatchRunResult[] = new Array(paramsList.length);
  for (let i = 0; i < paramsList.length; i++) {
    const r = (await stmt.run(paramsList[i])) as { changes: number; lastInsertRowid: number };
    out[i] = { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }
  return out;
}
