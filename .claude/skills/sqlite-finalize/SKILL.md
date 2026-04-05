# SQLite Statement Finalization

## The Problem

`node-sqlite3-wasm` compiled prepared statements live in the **Emscripten WASM
heap** — a fixed-size `ArrayBuffer`. JavaScript's GC does NOT free them. Every
`db.prepare()` call that is never followed by `stmt.finalize()` is a permanent
WASM heap leak for the lifetime of the process.

In normal usage the leak is small. But after a large import (e.g. 22k persons),
the WASM heap can be exhausted — causing every subsequent `db.prepare()` call in
the app to throw `SQLite3Error: out of memory`, crashing all IPC handlers.

## The Pattern

Use these three helpers from `src/api/db.ts` instead of calling `db.prepare()`
directly:

```typescript
import { queryOne, queryAll, runSql } from './db';

// SELECT returning one row (returns undefined if not found)
const row = queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [id]);

// SELECT returning multiple rows
const rows = queryAll<{ id: string }>(db, 'SELECT id FROM persons');

// INSERT / UPDATE / DELETE / PRAGMA
runSql(db, 'INSERT INTO persons (id, sex) VALUES (?, ?)', [id, sex]);
```

Each helper prepares, executes, and immediately finalizes the statement in a
`try/finally` block. No leak.

## Implementation (`src/api/db.ts`)

```typescript
import type { Database } from 'node-sqlite3-wasm';

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
```

## Statement Cache (bulk operations)

When the same SQL is executed thousands of times (e.g. during a large import),
re-compiling it on every call wastes CPU. Use `withStatementCache` from
`src/gedcom/importer.ts` to compile each SQL string once and reuse it:

```typescript
const { proxy: cachedDb, finalize: finalizeCache } = withStatementCache(db);
try {
  // use cachedDb instead of db — same API, but prepare() is memoized
  doMassiveOperation(cachedDb, data);
} finally {
  finalizeCache(); // frees ALL cached statements from WASM heap
  runSql(db, 'PRAGMA shrink_memory'); // releases SQLite page cache too
}
```

Never leave `finalizeCache()` uncalled — always put it in a `finally` block.

## Rules

- **Never** write `db.prepare(sql).get(params)` without a matching `.finalize()`.
- **Always** use `queryOne` / `queryAll` / `runSql` for one-shot statements.
- **Always** call `finalizeCache()` + `PRAGMA shrink_memory` after bulk operations
  that used `withStatementCache`.
- For transaction control use `runSql(db, 'BEGIN')` / `runSql(db, 'COMMIT')` /
  `runSql(db, 'ROLLBACK')` — never `db.prepare('BEGIN').run([])`.
- `finalize()` is not in the TypeScript types — cast via
  `(stmt as unknown as { finalize(): void }).finalize()`.

## Reviewing Existing Code

To find unfinalised `db.prepare()` calls:

```bash
grep -n 'db\.prepare(' src/api/*.ts | grep -v 'finalize'
```

Anything that doesn't call `.finalize()` in a `finally` block is a leak.
Replace with `queryOne` / `queryAll` / `runSql`.
