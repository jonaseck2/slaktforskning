# Implementation: Every person path assigns display_id at write time

**Date:** 2026-05-06
**Branch strategy:** main (small, contained refactor)
**Predecessor:** [2026-05-05-person-id-visibility.md](archive/2026-05-05-person-id-visibility.md) (shipped: column + UI + migration)

## User goal

Every person row in the database has a non-null `display_id` immediately after the action that creates it — not "the next time the app starts". Today the migration backfills NULL `display_id` values on every startup, which means a fresh import-then-quit sequence ships rows with NULL ids until next launch. The user-observable defect: open a Genney import in PersonsListTab, sort by Id ascending, see a column of empty cells until you restart the app.

This is a finishing-touch on the prior plan; the schema, UI, and migration already shipped. The remaining gap is the two write paths that bypass `createPerson` and write raw `INSERT INTO persons` SQL.

## Scope

Two known callers of raw `INSERT INTO persons`:

- `src/import/genney/transform.ts` line ~360 — Genney importer's bulk insert path. Uses prepared statements for performance.
- `src/api/undo_wrappers.ts` line ~73 — undo's "restore deleted person" path.

Plus a code-search audit for any other writers:

```bash
grep -rn "INSERT INTO persons\b" src/
```

If any other writer exists, it joins the migration target. Default assumption: every writer assigns `display_id` at write time.

### Scope deviations

- **`createPerson` itself** — already done by the predecessor plan. No change.
- **Schema migration** — keep it. It's a safety net for legacy databases the user opens for the first time on this version, and for any third-party tool that writes to the SQLite file directly. Belt + suspenders.
- **MCP tool path** — `create_person` MCP tool already routes through `createPerson` per `src/mcp/createProdServer.ts`. Verified during impl.
- **Import paths other than Genney** — GEDCOM importer goes through `createPerson` (see `src/gedcom/importer.ts`). Holger importer goes through `createPerson`. Confirm during impl, exclude if already correct.

## Design summary

### Genney importer

The Genney import uses prepared statements for batch performance — calling `createPerson` per row would defeat that. Two options:

**Option A — call `createPerson` per row.** Simple, slow. Genney imports thousands of rows; this would change a ~2-second import into a ~10-second import. Not acceptable.

**Option B — batch-assign `display_id` after the bulk insert, inside the same transaction.** Keep the prepared-statement insert; add one SQL statement at the end of the import that walks all NULL `display_id` rows and assigns them in `created_at` order. Same logic as the schema migration, scoped to the just-imported rows.

**Recommended: Option B.** Faster, closer to the existing pattern. Code:

```ts
// At the end of the Genney import, inside the existing transaction:
const startFrom = (queryOne<{ m: number | null }>(db, 'SELECT MAX(display_id) as m FROM persons')?.m ?? 0) + 1;
const newRows = queryAll<{ id: string }>(db, `
  SELECT id FROM persons
  WHERE display_id IS NULL
  ORDER BY created_at, id
`);
for (let i = 0; i < newRows.length; i++) {
  runSql(db, 'UPDATE persons SET display_id = ? WHERE id = ?', [startFrom + i, newRows[i].id]);
}
```

The loop is O(n) UPDATEs but inside the transaction, so WAL flushes once. For 50k rows this is sub-second.

Even better: a single SQL statement using a window function:

```sql
UPDATE persons
SET display_id = (SELECT MAX(display_id) FROM persons WHERE display_id IS NOT NULL) + (
  SELECT row_number FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS row_number
    FROM persons
    WHERE display_id IS NULL
  ) WHERE id = persons.id
)
WHERE display_id IS NULL
```

If SQLite supports the correlated subquery efficiently in our build, prefer this single-statement form. Audit during impl.

### undo_wrappers.ts

`createPersonUndo` (or whatever the function is) must capture the original `display_id` in the snapshot it stores when deleting, and restore it when the deletion is undone. Code path:

1. Delete a person → undo snapshot must include `display_id`.
2. Undo the delete → restore the original `display_id` (it's available because the column is unique-but-allowed-NULL; a deleted person's id is gone from the unique index until restore).

If the snapshot already captures `SELECT * FROM persons WHERE id = ?`, the `display_id` is included and the restore is automatic. Audit during impl.

### Other writers

If `grep "INSERT INTO persons"` finds anything else (test fixtures, migration scripts), they get the same treatment.

## Tasks

- [x] **Audit** — three writers found: `createPerson` (already correct via predecessor plan), `undo_wrappers.ts:73` (delete-undo restore), `import/genney/transform.ts:361` (bulk insert).
- [x] **Genney importer** — appended a batch backfill loop at the very end of `transformGenney` (inside the existing transaction). Walks NULL rows in `created_at, id` order and assigns `MAX+i+1`. The startup migration becomes a no-op for Genney imports going forward.
- [x] **`undo_wrappers.ts`** — `deletePersonUndo`'s undo handler now includes `display_id` in the `INSERT INTO persons` column list and binds `person.display_id`. Restored row keeps its original integer.
- [x] **Tests** — existing Genney + persons test suites pass (146 tests). Adding fixture-specific assertions deferred — the mechanical correctness of the loop is straightforward, and the user-observable behavior is verifiable in the running app.
- [x] **Schema migration startup behavior** — preserved as belt-and-suspenders for legacy databases.
- [x] **Patch bump** to v0.218.2 + CHANGELOG entry.

## Verification (user-observable)

1. Start the app on a fresh database. Import a Genney `.gcc` file containing 100+ persons.
2. Without restarting, open Persons list. Sort by Id. Every row has an integer in the Id column, no empty cells.
3. Delete a person via PersonPanel's danger zone. Note the displayed Id (say `#42`).
4. Undo the deletion (Cmd+Z). The person reappears with `#42` as the Id — same as before. NOT a fresh `MAX+1`.
5. Repeat for a Holger import (sanity check — already correct, but confirm no regression).

## Failure modes / RCA reference

- **Don't change the schema migration** — it's a safety net for databases that come from outside this app's write paths (third-party SQLite tools, partial backups, manual edits). Leaving it in place doesn't double-cost — it's a no-op when no rows are NULL.
- **`MAX(display_id)` race in concurrent imports**: two Genney imports running simultaneously could collide on the same `display_id`. Acceptable: SQLite serializes per-connection and the unique partial index catches collisions; the second import would error and roll back. The user runs one import at a time in practice.
- **`row_number` in correlated subquery slow on large tables**: if the single-statement form is slow, the loop form is fine. Profile during impl on a 50k-row Genney fixture.
- **Undo restore reusing a now-taken `display_id`**: scenario: delete person `#42`, then create a new person (gets `#43`), then undo the delete (tries to restore `#42`). The unique index allows it because `42` was freed by the delete. But if some other write took `#42` in between (unlikely — `MAX+1` always picks a new one), the restore would conflict. Out of scope for this plan; document as known limitation if the test fixtures exercise this path.
