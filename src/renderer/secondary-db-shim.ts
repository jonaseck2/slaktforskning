// Secondary read-only Database shim for Tauri-side imports.
//
// The primary `Database` (src/renderer/db-shim.ts) routes every call through
// rusqlite's single global Connection — that's the user's active app DB.
// Foreign-format importers (RootsMagic, Holger, FTM…) need a SECOND
// Connection, opened against the source file (.rmgc, the extracted .mdb,
// etc.), without touching the primary. This shim provides exactly that: a
// `SecondaryDatabase` whose surface is the subset of node-sqlite3-wasm's
// `Database` + `Statement` that `queryAll(db, sql, params)` and
// `queryOne(db, sql, params)` from src/api/db.ts call.
//
// The corresponding Rust commands live in src-tauri/src/db.rs as
// `secondary_db_*`. They are read-only by design (`OPEN_READ_ONLY`) — any
// INSERT/UPDATE/DELETE will fail at the rusqlite layer, the intended
// guarantee against accidentally writing to the source file.
//
// IMPORTANT: the importer must call `close()` when done. Connections are
// kept in a Rust-side HashMap keyed by handle; without `close()` the
// Connection lives until the renderer process exits.

import { invoke } from '@tauri-apps/api/core';
import type { BindValues, JSValue, QueryResult, RunResult } from './db-shim';

function toArray(values?: BindValues): unknown[] {
  if (values === undefined) return [];
  if (Array.isArray(values)) return values;
  if (typeof values === 'object' && values !== null && !(values instanceof Uint8Array)) {
    throw new Error('secondary-db-shim: named parameters not supported (use positional array)');
  }
  return [values as JSValue];
}

export class SecondaryStatement {
  constructor(
    private readonly handle: number,
    public readonly sql: string,
  ) {}

  finalize(): void { /* no-op; rusqlite owns lifecycle, prepare_cached reuses */ }
  get isFinalized(): boolean { return false; }

  async run(values?: BindValues): Promise<RunResult> {
    return await invoke<RunResult>('secondary_db_run', {
      handle: this.handle,
      sql: this.sql,
      params: toArray(values),
    });
  }

  async all(values?: BindValues): Promise<QueryResult[]> {
    const rows = await invoke<unknown[]>('secondary_db_all', {
      handle: this.handle,
      sql: this.sql,
      params: toArray(values),
    });
    return rows as QueryResult[];
  }

  async get(values?: BindValues): Promise<QueryResult | null> {
    const row = await invoke<unknown>('secondary_db_get', {
      handle: this.handle,
      sql: this.sql,
      params: toArray(values),
    });
    return (row as QueryResult | null) ?? null;
  }

  async *iterate(values?: BindValues): AsyncIterableIterator<QueryResult> {
    const rows = await this.all(values);
    for (const row of rows) yield row;
  }
}

/**
 * A read-only secondary SQLite connection for foreign-format importers.
 *
 * `await SecondaryDatabase.open(path)` opens the file via the Rust
 * `secondary_db_open` command, which returns a numeric handle the shim
 * keeps for the lifetime of this object. `close()` releases the handle
 * (idempotent — safe to call from a `finally` block even if `open` threw).
 *
 * The surface intentionally mirrors only what `queryOne` / `queryAll` /
 * `runSql` from src/api/db.ts touch on a `Database`: the `prepare(sql)`
 * method that returns a thing with `.run(p)` / `.get(p)` / `.all(p)` /
 * `.finalize()`. That's enough for every existing api/-style importer
 * helper to work unchanged when handed a SecondaryDatabase.
 */
export class SecondaryDatabase {
  private _handle: number | null = null;
  private _isOpen = false;

  private constructor(handle: number) {
    this._handle = handle;
    this._isOpen = true;
  }

  static async open(path: string): Promise<SecondaryDatabase> {
    const handle = await invoke<number>('secondary_db_open', { path });
    return new SecondaryDatabase(handle);
  }

  get isOpen(): boolean { return this._isOpen; }
  get inTransaction(): boolean { return false; }

  prepare(sql: string): SecondaryStatement {
    if (this._handle === null) throw new Error('SecondaryDatabase: connection closed');
    return new SecondaryStatement(this._handle, sql);
  }

  async run(sql: string, values?: BindValues): Promise<RunResult> {
    if (this._handle === null) throw new Error('SecondaryDatabase: connection closed');
    return await invoke<RunResult>('secondary_db_run', {
      handle: this._handle,
      sql,
      params: toArray(values),
    });
  }

  async all(sql: string, values?: BindValues): Promise<QueryResult[]> {
    if (this._handle === null) throw new Error('SecondaryDatabase: connection closed');
    const rows = await invoke<unknown[]>('secondary_db_all', {
      handle: this._handle,
      sql,
      params: toArray(values),
    });
    return rows as QueryResult[];
  }

  async get(sql: string, values?: BindValues): Promise<QueryResult | null> {
    if (this._handle === null) throw new Error('SecondaryDatabase: connection closed');
    const row = await invoke<unknown>('secondary_db_get', {
      handle: this._handle,
      sql,
      params: toArray(values),
    });
    return (row as QueryResult | null) ?? null;
  }

  /**
   * Drop the underlying rusqlite Connection. Idempotent — calling close()
   * twice is a no-op. Always call this in a `finally` block after the
   * import completes (success or failure) so the Rust HashMap doesn't
   * accumulate dead handles for the renderer process's lifetime.
   */
  close(): void {
    if (this._handle === null) return;
    const h = this._handle;
    this._handle = null;
    this._isOpen = false;
    void invoke('secondary_db_close', { handle: h });
  }
}
