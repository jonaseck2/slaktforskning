# Fix: GEDCOM import CPU saturation (statement cache)

## Problem

After the transaction fix (see `2026-04-03-gedcom-import-performance.md`), a
70k-line Genney import ran at ~100% CPU for 1-2 minutes before completing.
Disk I/O was gone, but the process was still slow.

## Root Cause

Every API function calls `db.prepare(sql)` on every invocation — no caching.
SQLite compiles the SQL string (parse → analyze → generate query plan) on each
`prepare()` call. With ~50,000 operations in a large import:

- ~25,000 SELECT queries (place lookups, getPlace after each create/update, etc.)
- ~8,000 UPDATE queries (updatePlace for each place with coordinates)
- ~10,000 INSERT queries (persons, events, citations, places, relationships)

All using the same ~10–20 unique SQL strings, compiled from scratch each time.

Measured hot paths:
- `getPlace` — called after every `createPlace` and before/after every
  `updatePlace`: 3 compiles per place × 2560 coordinate-bearing places = ~7,680
- `findOrCreateWithParent` — 2 different SELECT queries × ~11,000 calls for a
  4-level Swedish place hierarchy across 2808 places

At ~1 ms/compile (node-sqlite3-wasm overhead on macOS): ~50 seconds.

## Fix

Added `withStatementCache(db)` — a `Proxy` that intercepts `db.prepare(sql)`
and returns a cached compiled statement on repeat calls:

```
importGedcom:
  BEGIN on real db
  doImportGedcom(withStatementCache(db), ...)   ← ~10-20 compiles total
  COMMIT on real db
```

The cache is a `Map<string, Statement>` created fresh per import — no leakage
between imports. BEGIN/COMMIT/ROLLBACK are called on the unwrapped `db` so they
are never cached (they are one-shot control statements).

All SQLite operations in the importer are synchronous and single-threaded, so
reusing a compiled statement across multiple `.run([])` / `.get([])` / `.all([])`
calls with different parameters is safe.

## Files Changed

- `src/gedcom/importer.ts` — `withStatementCache()` function; `importGedcom`
  passes a cached-proxy db to `doImportGedcom`
