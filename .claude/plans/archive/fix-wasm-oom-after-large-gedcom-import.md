# Fix: WASM OOM after large GEDCOM import

## Problem

After importing a 22k-person GEDCOM file, all subsequent IPC calls (persons:get,
citations:forEvent, checks:forPerson, etc.) failed with:

```
SQLite3Error: out of memory
at Database.prepare (.vite/build/index.js:707:14)
```

Even simple `getPerson()` calls were crashing the app until restart.

## Root Cause

`node-sqlite3-wasm` compiled prepared statements live in the **Emscripten WASM
heap** (a fixed-size ArrayBuffer), not the JS heap. JavaScript GC does not free
them. Every `db.prepare()` call that is never followed by `stmt.finalize()` is a
permanent leak for the lifetime of the process.

During a 22k-person import, `importGedcom` in `src/gedcom/importer.ts`:

1. **Statement cache (`withStatementCache`)** — caches ~50 compiled SQL strings,
   reused across thousands of calls. This is intentional for performance, but the
   cache was not being finalized after the import, so all ~50 statements stayed in
   the WASM heap permanently.

2. **Delta-counting queries** — 12 `db.prepare().get/all()` calls (6 before + 6
   after) for counting rows in persons, relationships, sources, places, citations,
   and events. None were finalized.

3. **Transaction statements** — `db.prepare('BEGIN').run([])`, `COMMIT`, and
   `ROLLBACK` were also not finalized.

4. **SQLite page cache** — the large import causes SQLite's internal page cache
   (also in the WASM heap) to grow substantially. Without `PRAGMA shrink_memory`,
   this memory is not returned to the heap after the transaction commits.

Combined, these exhausted the WASM heap so that subsequent `db.prepare()` calls
anywhere in the app had no room for new compiled statements.

## Fix

`src/gedcom/importer.ts`:

1. Added `runSql(db, sql)`, `queryOne<T>(db, sql)`, `queryAll<T>(db, sql)` helpers
   that prepare, execute, and **immediately finalize** each statement via
   `(stmt as unknown as { finalize(): void }).finalize()`.

2. Replaced all 12 delta-counting `db.prepare()` calls with `queryOne`/`queryAll`.

3. Replaced `db.prepare('BEGIN/COMMIT/ROLLBACK').run([])` with `runSql(db, ...)`.

4. Added `runSql(db, 'PRAGMA shrink_memory')` in the `finally` block after
   `finalizeCache()` to release SQLite's accumulated page cache back to the WASM
   heap.

## Files Changed

- `src/gedcom/importer.ts` — added `runSql`/`queryOne`/`queryAll` helpers; used
  them for all statements outside the statement cache; added `PRAGMA shrink_memory`
  after the import transaction

## Note on Broader Issue

The `src/api/` functions (persons.ts, events.ts, etc.) also use inline
`db.prepare().get/run/all()` without finalizing. For normal usage the WASM heap
has enough room for these small individual statements, but a systematic fix using
shared helpers would eliminate the leak entirely. See the sqlite-finalize skill
for the recommended pattern.
