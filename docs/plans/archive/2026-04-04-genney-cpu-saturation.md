# Fix: Genney import CPU saturation from per-row db.prepare()

## Problem
Importing a Genney database (833 persons, 3008 events, 5910 citations) caused CPU
saturation for 1–2 minutes. The transaction fix (BEGIN IMMEDIATE) had already eliminated
disk I/O bottleneck, but CPU was still pegged during the transform phase.

## Root Cause
`transformGenney` called API layer functions (`personsApi.createPerson`,
`eventsApi.createEvent`, `sourcesApi.createCitation`, etc.) for every row.
Each API call calls `db.prepare(SQL)` internally — compiling the SQL and crossing
the JS→WASM boundary on every call.

For a typical Genney database this produced ~31,000 `db.prepare()` invocations:
- 833 persons × ~6 prepares (insert person + insert name + select-after-insert × 2 + MAX sort_order) = ~5,000
- 3008 events × ~4 prepares (insert event + select-after-insert + insert participant × 2) = ~12,000
- 5910 citations × ~2 prepares = ~12,000
- sources, relationships: ~2,000 more

In `node-sqlite3-wasm` (WebAssembly), each `db.prepare()` crosses the JS→WASM boundary
and compiles SQL. This is significantly more expensive than in native SQLite bindings.
The transaction wrapping eliminated WAL flush overhead but had no effect on the per-row
compile cost.

## Fix
Rewrote `transformGenney` in `src/import/genney/transform.ts` to pre-compile all
INSERT statements once before the loops, bypassing the API layer entirely for bulk inserts:

```typescript
const stmts = {
  insertPerson: db.prepare(`INSERT INTO persons ...`),
  insertPersonName: db.prepare(`INSERT INTO person_names ...`),
  insertEvent: db.prepare(`INSERT INTO events ...`),
  insertCitation: db.prepare(`INSERT INTO citations ...`),
  // ... 5 more
};
// Then in each loop: stmts.insertX.run([...])
```

Additional eliminations:
- Removed SELECT-after-INSERT (API layer returns the inserted row; not needed during bulk import)
- Removed `SELECT MAX(sort_order)` per person name (all imported names get sort_order = 0)
- Removed API module imports entirely (personsApi, relationshipsApi, eventsApi, sourcesApi, placesApi)

Result: ~31,000 `db.prepare()` calls reduced to 9.

## Files Changed
- `src/import/genney/transform.ts` — rewrote transformGenney to use pre-compiled stmts
- `src/renderer/views/ImportExportView.vue` — combined Genney sections, removed folder button
- `src/renderer/i18n/sv.ts` / `en.ts` — updated strings for combined section
