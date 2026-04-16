# Fix: Startup and quality check CPU contention on large databases

## Problem
After importing a Holger GEDCOM with media (~22k persons), the app became unresponsive on startup and when opening the Quality view. The main process event loop was blocked for minutes, preventing all IPC calls from completing.

## Root Causes

### 1. `checks:forPerson` ran the entire check suite (174 seconds)
`PersonChecksSection` in the person detail view called `runChecksForPerson()` which executed ALL checks on the entire database — including `checkMediaFileMissing` (filesystem I/O on every media file) and `checkGazetteerMatchQuality` (full gazetteer tree traversal for every place) — just to filter results for one person.

### 2. `checkMediaFileMissing` called `existsSync` per file
With thousands of imported media files, the check did synchronous filesystem access for each one, plus N+1 queries for linked persons.

### 3. `resolvePlace` did full tree traversal per place
The gazetteer resolver recursively walked the entire tree (tens of thousands of nodes across 6 gazetteers) for each place lookup. `getTreeDepth` also recursively computed subtree depth on every candidate without caching.

### 4. `checkGazetteerMatchQuality` had N+1 query patterns
For each place, it ran individual queries for linked persons and walked the parent chain for place paths.

### 5. Unfinalised prepared statements in `schema.ts`
8 `db.prepare()` calls for migration checks never called `.finalize()`, holding database locks that could block table modifications during schema initialization.

### 6. `loadQualityBadge()` fired immediately on startup/import
Quality checks ran synchronously on mount, blocking the event loop before the UI could render.

## Fix

### `runChecksForPerson` — skip global checks
Added `skipGlobal` option to `runAllCheckFunctions`. Per-person checks now skip `checkMediaFileMissing` and `checkGazetteerMatchQuality` since those scan the entire database and aren't person-scoped.

### `checkMediaFileMissing` — use `is_missing` flag
Replaced `existsSync()` per file with a query on `is_missing = 1` (already set during import). Bulk-loads person links in one query instead of N+1.

### `resolvePlace` — indexed lookups instead of tree traversal
Built a name index (normalized name → node entries) per gazetteer root, cached via WeakMap. First call builds the index; subsequent calls do O(1) Map lookups instead of O(n) tree walks. Also cached `getTreeDepth` results via WeakMap.

### `checkGazetteerMatchQuality` — bulk queries
Batch-loads all person-place associations and all place hierarchy data upfront instead of N+1 queries per place.

### `schema.ts` — finalize prepared statements
Replaced 8 raw `db.prepare()` calls with `queryAll`/`queryOne` helpers that finalize in `try/finally`.

### Startup timing — deferred quality checks
`loadQualityBadge()` deferred to 5 seconds after mount. `autoSetFocusPerson()` changed from `persons.list()` (all persons) to `listPage(1, 0)`.

### `listPersonsPage` — derived table instead of correlated subquery
Replaced correlated `SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id` with a derived table `GROUP BY` join.

## Files Changed
- `src/api/checks/index.ts` — `skipGlobal` option for `runAllCheckFunctions`
- `src/api/checks/checks-location.ts` — `checkMediaFileMissing` uses `is_missing` flag + bulk queries; `checkGazetteerMatchQuality` bulk-loads associations
- `src/api/place-gazetteers/resolver.ts` — name index for O(1) lookups, `getTreeDepth` cache
- `src/api/schema.ts` — finalize all prepared statements via `queryAll`/`queryOne`
- `src/api/persons.ts` — derived table in `listPersonsPage`
- `src/renderer/App.vue` — deferred quality badge, efficient `autoSetFocusPerson`
- `src/main/ipc/wrap-handler.ts` — IPC timing log for diagnostics
- `src/main/ipc/utility.ts` — timing logs in `checks:runAll` handler
- `tests/unit/checks.test.ts` — updated to use `is_missing` flag
