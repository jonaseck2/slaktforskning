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

export async function queryOne<T>(db: Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const stmt = db.prepare(sql);
  try { return stmt.get(params) as T | undefined; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export async function queryAll<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const stmt = db.prepare(sql);
  try { return stmt.all(params) as T[]; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export async function runSql(db: Database, sql: string, params: unknown[] = []): Promise<void> {
  const stmt = db.prepare(sql);
  try { stmt.run(params); }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

/** Alias for runSql — used by tests and places where "queryRun" reads more naturally. */
export const queryRun = runSql;

export async function runSqlChanges(db: Database, sql: string, params: unknown[] = []): Promise<number> {
  const stmt = db.prepare(sql);
  try { return (stmt.run(params) as { changes: number }).changes; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}
