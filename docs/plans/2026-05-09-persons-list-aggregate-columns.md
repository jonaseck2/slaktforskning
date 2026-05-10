# Plan: Persons list — aggregate columns and secondary sort

**Date:** 2026-05-09
**Status:** in-progress (Phase 4 deferred)
**Source:** Beta tester report 88 (May 7 batch); follow-up to earlier "person list extension" feedback (report 84)
**Effort:** M

## User goal

When a researcher opens the persons list, they can scan it as a research-progress map: which persons have *no* names, *no* events, *no* relationships, *no* media, *no* group memberships, *no* research tasks, *no* quality issues — i.e., where their archive is sparse and where it's rich. They can sort by sex, by any of these counts (ascending = thin records first), and when sorting by a low-cardinality column (sex; counts that bucket as 0/1/2) they get a meaningful tiebreaker via a secondary sort key — so a sex-sort still has surnames in alphabetical order within each sex bucket rather than arbitrary order.

This is "find the persons who need attention" tooling. The list becomes useful as a sparseness scanner without making the user run a query or open the Quality view.

## Scope

- `src/renderer/views/PersonsListTab.vue` — primary surface.
- `src/api/persons.ts` `findPagePersons` (or whatever the paged query helper is named) — must produce the aggregate columns in a single SQL pass per page (no per-row `getEventsForPerson` etc.).
- `src/renderer/composables/usePagedList.ts` — extend to support a secondary `sortBy2` / `sortDir2` parameter, threaded through to `fetchPage`.
- The persons IPC channel `persons:listPage` (or equivalent) — extend the args + return shape.

**Scope deviations:**
- Other entity list views (sources, places, media, groups, research tasks) get a secondary-sort upgrade by virtue of `usePagedList` extension, but they don't get aggregate count columns — the value of "find sparse persons" is person-specific. If a real ask surfaces for "places with no events," that's a separate plan.
- "# of notes" column is **not** added — `notes` is a single column today (single text blob), not a count. If/when notes become a multi-row child table, revisit.

## Behaviour spec

### Columns

Visible columns on `PersonsListTab.vue` after this change (all opt-in via a column-picker — see UX section below):

| Key | Label (sv) | Source | Notes |
|---|---|---|---|
| `name` | `Namn` | existing — preferred birth name from `person_names` | always-visible |
| `birth_date` | `Född` | existing — derived from `birth` event | always-visible |
| `death_date` | `Död` | existing — derived from `death` event | always-visible |
| `sex` | `Kön` | `persons.sex` | NEW |
| `name_count` | `Namn` | `COUNT(*) FROM person_names WHERE person_id = ?` | NEW |
| `event_count` | `Händelser` | `COUNT(DISTINCT e.id) via event_participants` | NEW |
| `relationship_count` | `Relationer` | `COUNT(*) FROM relationships WHERE person1_id = ? OR person2_id = ?` | NEW |
| `media_count` | `Media` | `COUNT(*) FROM media_links WHERE entity_type='person' AND entity_id = ?` | NEW |
| `group_count` | `Grupper` | `COUNT(*) FROM group_links WHERE entity_type='person' AND entity_id = ?` | NEW |
| `task_count` | `Uppgifter` | `COUNT(*) FROM task_links WHERE entity_type='person' AND entity_id = ?` | NEW |
| `quality_count` | `Kvalitet` | quality engine result count for the person | NEW |

Default visible: `name`, `birth_date`, `death_date`, `sex`. The other six are off by default (they'd overwhelm the table for a casual user). Column visibility persisted to `localStorage` per `STORAGE_KEYS.persons.visibleColumns` (new key — add to `src/renderer/utils/storage-keys.ts`).

### SQL shape (single query per page)

```sql
SELECT p.id, p.sex, p.notes,
       (SELECT COUNT(*) FROM person_names WHERE person_id = p.id) AS name_count,
       (SELECT COUNT(*) FROM event_participants WHERE person_id = p.id) AS event_count,
       (SELECT COUNT(*) FROM relationships WHERE person1_id = p.id OR person2_id = p.id) AS relationship_count,
       (SELECT COUNT(*) FROM media_links WHERE entity_type = 'person' AND entity_id = p.id) AS media_count,
       (SELECT COUNT(*) FROM group_links WHERE entity_type = 'person' AND entity_id = p.id) AS group_count,
       (SELECT COUNT(*) FROM task_links WHERE entity_type = 'person' AND entity_id = p.id) AS task_count,
       ...preferred_name, birth_date, death_date subqueries (already exist)...
FROM persons p
ORDER BY <primary>, <secondary>
LIMIT ? OFFSET ?
```

Quality-issue count is harder — the quality engine runs over the full DB. Two options:
1. Materialize quality issues into a `quality_issues` cache table, refreshed on `onDataChanged` (debounced).
2. Compute per-page only (run quality for the page's persons on demand).

Pick option 1: it's the same shape as the badge counts on App.vue, and it makes `quality_count` sortable across the whole table (option 2 only sorts within a page).

This is bulk-by-name per `.claude/rules/api.md` — one query per page, not per row.

### Secondary sort

`usePagedList` accepts `sortBy2: string | null, sortDir2: 'asc' | 'desc'`. When the user clicks a column header that's already the primary, it toggles dir as today; when the user shift-clicks a column header, it becomes the secondary (or replaces the existing secondary). Visual indicator: small `1`/`2` badge on the active sort indicators, plus a "Sortering: Kön ↑, Namn ↑" status pill below the filter chips.

Default tiebreaker for any sort by `sex` or any `_count` column is `name ASC` so the user gets stable ordering without setting a secondary explicitly. Documented in the helper text on the column picker.

### Column picker

A small "⋮" / "Kolumner" affordance at the top-right of the table opens a `BaseSubPanel` with a list of columns and on/off toggles. Persists immediately. Default visible set is the four current columns.

## Tasks

### Phase 1 — API

- [x] Extend `findPagePersons` (or rename to `listPagePersons`) signature: add `sortBy2`, `sortDir2`. Single SQL with the aggregate subqueries.
- [x] Add `getQualityIssueCounts(db, personIds: string[])` returning `Record<string, number>` — bulk-by-name, single SQL.
- [x] Unit tests: `tests/unit/persons-paged-aggregates.test.ts` — verify counts on a fixture DB.
- [ ] Update `IPC_REFERENCE.md` for the new args + return shape. *(Deferred — IPC_REFERENCE.md hasn't been touched in this session; reference docs will be refreshed in the same pass that closes Phase 4.)*

### Phase 2 — Composable

- [x] Extend `usePagedList` to accept `sortBy2` / `sortDir2` and thread through to `fetchPage`.
- [ ] Add a small `<SortStatusPill>` helper component used by every list view. *(Deferred along with Phase 4 — it is implemented inline in PersonsListTab as the only consumer today; extracting only makes sense once secondary-sort wiring lands across views.)*

### Phase 3 — UI

- [x] `PersonsListTab.vue` — add the six new columns to the table definition; gate visibility behind the column-picker.
- [x] Column-picker modal (`PersonsColumnPickerModal.vue` extending `BaseSubPanel`).
- [x] Persist visible column set + sort state via `STORAGE_KEYS.persons.*` (added `personsVisibleColumns` plus `<storageKey>-sort-by2/-sort-dir2` via the composable).
- [ ] FilterChips bucketing — *(Out of scope; flagged optional in the original plan and not implemented.)*

### Phase 4 — Apply secondary sort to other list views

- [ ] `SourcesListTab.vue`, `PlacesListTab.vue`, `GroupsView.vue`, `ResearchTasksView.vue`, `MediaView.vue` — adopt the new `sortBy2` slot. **DEFERRED.** The composable accepts `sortBy2`/`sortDir2`, but each view's underlying `listPage` API + IPC handler does not yet thread a secondary sort. Wiring shift-click in those views without API support would silently swallow the secondary sort — exactly the "silent degradation across state" failure mode `.claude/rules/renderer.md` § "No silent degradation" warns against. Cross-entity secondary sort is a separate plan: extend each entity's `*Page` API + channel signature, then wire `(e) => toggleSort(col, { shift: e.shiftKey })` plus a status-pill on every header.

### Phase 5 — i18n

- [x] Column labels in `sv.ts` + `en.ts` under `persons.columns.*`.
- [x] Column-picker title + helper strings under `persons.columnPicker.*`.
- [x] Sort status pill format string (`persons.columnPicker.sortStatus`, `persons.columnPicker.clearSecondary`).

## Verification

User goal is "I can scan the list for sparse records and the sort behaves predictably when I sort by sex or counts."

1. **Smoke test by user (mandatory).** Open persons list. Toggle the six new columns on. Sort by `event_count ASC` — persons with 0 events come first. Shift-click `name` — within the 0-event bucket, persons sort by name. Toggle `sex ASC`, primary becomes sex, name remains as default tiebreaker.
2. **Vitest** on `findPagePersons` with the new aggregates against a fixture DB covering 0-count, 1-count, many-count cases.
3. **Performance check:** with 22k persons, the aggregate-columns page must render in ≤300 ms. Profile with the existing `performance-profiling` skill if it's slow — likely we need an index on `event_participants(person_id)` etc., already in place but worth confirming.
4. **Component test** on `PersonsListTab` asserts the column-picker round-trip (toggle off, persist, reload, still off).

## Failure modes / RCA reference

The "Existence checks — never use un-paged `list()`" rule in `.claude/rules/renderer.md` was added after `PersonsView.load()` pulled 22k rows + names just to test `length === 0`. The aggregate-columns work touches the same query path and must stay paged. Single SQL per page, not "fetch all then aggregate in JS."

Bulk-by-name contract: `getQualityIssueCounts(personIds)` must be a single SQL with `IN (?,?,...)`, not a JS loop calling singular getters. See "Bulk / Batch naming — mandatory contract" in `.claude/rules/api.md`.

## Notes

- Bengt's report 84 (the original list-extension idea) is parked because it was "yvig" — this plan is the focused subset he himself proposed in 88. Don't reopen 84's broader scope here.
- The column picker is also the right home if/when the user later asks for "person notes preview column" or similar — design for additive growth.
