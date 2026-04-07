# Fix: PersonsView startup CPU saturation on large databases

## Problem
Opening the app with a large database caused several seconds of CPU saturation before the persons list appeared. Log:
```
[IPC] persons:listPage [ 100, 0 ]
-- cpu saturated
[IPC] persons:listPage → OK
```

## Root Cause
`PERSON_LIST_BASE_QUERY` in `src/api/persons.ts` had 4 correlated subqueries per row — birth_date, birth_place, death_date, death_place — each executing via `event_participants → events → places`. Because SQLite must evaluate `ORDER BY` across all persons before `LIMIT` applies, every person in the database triggered 4 correlated lookups. With e.g. 5,000 persons: 20,000 index lookups just to return 100 rows.

## Fix
Rewrote `listPersonsPage` as a two-pass approach (`src/api/persons.ts:237`):

**Pass 1** — sort and paginate with only name data (no birth/death lookups at all). Uses existing `idx_person_names_person_sort` index. Cost: O(n) for sort, only for names.

**Pass 2** — one `IN(...)` query fetching birth + death events for the 100 persons on the current page only. Uses `idx_event_participants_person_id`. Cost: O(page_size) = O(100).

Result: from O(4n) correlated subqueries down to O(page_size) event lookups per page load.

## Files Changed
- `src/api/persons.ts:237` — `listPersonsPage` rewritten as two-pass