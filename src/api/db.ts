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
