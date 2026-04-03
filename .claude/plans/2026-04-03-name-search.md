# Plan: Search Across All Name Records

**Date:** 2026-04-03
**Status:** Pending

## Problem

`searchPersons` in `src/api/persons.ts` joins only the **primary name** (the row with `MIN(sort_order)`). As a result:

- Searching "Ahnstedt" does not find "Anna-Greta Nord" even though she has a married-name row with `surname = 'Ahnstedt'`
- Searching "Linda" does not find "Eva Linda Marie" unless `preferred_name = 'Linda'` is set on the primary name row specifically

`listPersons` and `getDisplayGivenName` are unaffected — they work correctly against the primary name.

## Scope

**One function to change, two new tests.** No schema change. No UI change. No IPC change. No MCP change.

## File Map

| File | Change |
|------|--------|
| `src/api/persons.ts` | Rewrite `searchPersons` WHERE to search any `person_names` row via EXISTS subquery |
| `tests/unit/persons.test.ts` | Add test: search by married surname finds person; search by preferred_name on non-primary name finds person |

## SQL Approach

Use an `EXISTS` subquery so the return shape stays one-row-per-person (primary name for display), while matching against every name row:

```sql
SELECT p.*, pn.given_name, pn.surname, pn.preferred_name
FROM persons p
LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
  SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
)
WHERE p.notes LIKE ?
   OR EXISTS (
     SELECT 1 FROM person_names n
     WHERE n.person_id = p.id
       AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
   )
ORDER BY pn.surname, pn.given_name
```

node-sqlite3-wasm binding array: `[like, like, like, like]` — four params.

Return type stays identical:
```typescript
(Person & { given_name: string; surname: string; preferred_name: string | null })[]
```

## Task Checklist

- [ ] **1. API** — replace WHERE clause in `searchPersons` with EXISTS pattern above; update `.all([...])` binding to four params
- [ ] **2. Test: married surname** — create person "Anna Svensson", add married name "Anna Ahnstedt" (sort_order 1); assert `searchPersons(db, 'Ahnstedt')` returns the person with `surname = 'Svensson'` (primary name for display)
- [ ] **3. Test: preferred_name on non-primary name** — create person, add secondary name with `preferred_name = 'Linda'`; assert `searchPersons(db, 'Linda')` finds the person
- [ ] **4. Run** `npm test -- --coverage` and verify thresholds still pass

## What Does NOT Change

- `listPersons` — already correct
- IPC `persons:search` — thin wrapper, unchanged
- MCP `search_persons` — thin wrapper, unchanged
- All UI components — already use `getDisplayGivenName` on primary name fields
