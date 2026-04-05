import type { Database } from 'node-sqlite3-wasm';

/**
 * node-sqlite3-wasm compiled statements live in the Emscripten WASM heap.
 * JS GC does NOT free them. Always finalize after use to prevent WASM OOM.
 *
 * Use these helpers instead of db.prepare() directly.
 */

type Finalizable = { finalize(): void };

export function queryOne<T>(db: Database, sql: string, params: unknown[] = []): T | undefined {
  const stmt = db.prepare(sql);
  try { return stmt.get(params) as T | undefined; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export function queryAll<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  try { return stmt.all(params) as T[]; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export function runSql(db: Database, sql: string, params: unknown[] = []): void {
  const stmt = db.prepare(sql);
  try { stmt.run(params); }
  finally { (stmt as unknown as Finalizable).finalize(); }
}

export function runSqlChanges(db: Database, sql: string, params: unknown[] = []): number {
  const stmt = db.prepare(sql);
  try { return (stmt.run(params) as { changes: number }).changes; }
  finally { (stmt as unknown as Finalizable).finalize(); }
}
