# Fix: PersonsView UI lockup on navigation

## Problem
Navigating to PersonsView locked up the Electron app for several seconds before content appeared. The entire application was unresponsive.

## Root Cause
Two compounding causes:

1. **Synchronous SQLite on the main process.** node-sqlite3-wasm is a WASM module — all queries run synchronously on the Node.js event loop. A slow query on the main process blocks IPC, rendering, and all UI events until it returns.

2. **Expensive query structure in PERSON_LIST_BASE_QUERY (`src/api/persons.ts:193`).** The query used two derived-table subqueries for birth and death events. SQLite materializes these as temp tables before processing the outer query. With a large database this means scanning all events (and all participants) twice — once for birth, once for death — before any LIMIT is applied. Combined with no index on `events(event_type)`, each derived table was a full table scan.

3. **Missing indexes.** `events(event_type)` had no index, and `person_names(person_id, sort_order)` only had a single-column `(person_id)` index rather than a composite covering index.

## Fix

**Query restructure (`src/api/persons.ts`):** Replaced the derived tables with correlated scalar subqueries. SQLite evaluates correlated subqueries per output row — after ORDER BY and LIMIT are applied — so birth/death lookups only run for the 100 displayed rows, not for every row in the database.

```sql
(
  SELECT e.date_original
  FROM event_participants ep
  JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
  WHERE ep.person_id = p.id
  LIMIT 1
) AS birth_date,
```

**New indexes (`src/api/schema.ts`):**
- `idx_events_event_type ON events(event_type)` — used by the correlated birth/death subqueries
- `idx_person_names_person_sort ON person_names(person_id, sort_order)` — covers the MIN(sort_order) correlated subquery for primary name lookup

Indexes use `CREATE INDEX IF NOT EXISTS` in the post-migration block of `initializeSchema()`, so they are applied automatically on next startup for existing databases.

## Files Changed
- `src/api/persons.ts` — rewrite PERSON_LIST_BASE_QUERY to use correlated subqueries
- `src/api/schema.ts` — add idx_events_event_type and idx_person_names_person_sort indexes
