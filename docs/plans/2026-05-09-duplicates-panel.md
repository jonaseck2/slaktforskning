# Duplicates Panel — Places, Sources, Media — implementation plan

> Subagent dispatch: use `subagent-handoff`. Pair with `2026-05-09-duplicates-panel-design.md` for the user-experience spec.

## User goal

Same as the design spec: the genealogist gets four duplicate-finding tabs (Persons, Places, Sources, Media) at `/duplicates`, with the same compare-and-merge experience the persons tab already provides. The implementation plan covers the build sequence and the testable surface.

## Scope

The pattern is "extend the existing persons-only duplicate-finding stack to three more entities, sharing the merge-with-undo machinery." Full enumeration of the work:

- **API:** `findDuplicatePlaces` / `mergePlaces`, `findDuplicateSources` / `mergeSources`, `findDuplicateMedia` / `mergeMedia` in `src/api/duplicates.ts` (or split into `duplicates-places.ts` etc. if the file grows past ~600 LOC).
- **IPC + preload + MCP:** typed channels for the six new functions, exposed via `window.api.duplicates.*` and as MCP tools mirroring `find_duplicates` / `merge_persons`.
- **Renderer:** four-tab shell on `DuplicatesView.vue`; per-entity list components; per-entity compare modal (extends or generalizes `MergePersonsModal.vue`).
- **Quality-check landing:** the `DUPLICATE_PLACE` / `DUPLICATE_SOURCE` / `DUPLICATE_MEDIA` rows in the quality view link to the new tabs.
- **Tests:** unit tests for each new API function, integration test for the merge → undo round-trip, e2e smoke for the user flow.

**Scope deviations:**
- Repositories tab — not in this plan (low user pain, structurally similar to sources, can copy this shape later).
- New duplicate-finding heuristics for persons — out of scope; persons logic stays as-is.

## Verification

1. **Per-tab user-observable smoke (manual):** seed a fixture with three known duplicates (one place pair, one source pair, one media pair). Run `npm start`. Navigate to `/duplicates`. Each tab shows its pair. Merge each pair; the pair disappears, the related entities now reference the target. Undo via the global undo affordance restores the source row.
2. **API integration tests:** for each new merge function, an end-to-end test seeds a target + source + ≥2 referencing rows of every type (events / citations / links / regions), calls merge, asserts source gone + every reference repointed + undo restores.
3. **Quality-check landing test:** trigger a `DUPLICATE_PLACE` finding from `runChecks`; assert the row's `landingPath` resolves to `/duplicates?tab=places&pair=<id1>:<id2>`.
4. **MCP smoke:** `find_duplicates` MCP tool optionally accepts an `entity` argument (default `person`); calling with `entity: 'place'` returns place duplicates. `merge_places` MCP tool exists and works.

Lint + vitest passing is hygiene. The user-observable smoke is the gate.

## Failure modes / RCA reference

- See design spec's "Failure modes" section: polymorphic merge gotcha, media file ownership, ignored-pair model generalization.
- **Surface contract:** the four checks from `CLAUDE.md` apply at the tab-host level — already addressed in the design.
- **Undo machinery:** every new merge must register an `UndoAction` (per `undo-redo-patterns` skill) capturing pre-merge state of every row that will be touched. This is non-negotiable; merges without undo strand the user when they misclick.
- **Worker-thread split:** the new functions live in `src/api/` (pure), called from the DB worker — same as `mergePersons`. No sync I/O, all DB writes wrapped in a `BEGIN IMMEDIATE` transaction (per `.claude/rules/api.md` bulk-write rule).

---

## Tasks

### Task 1: Generalize the ignored-pair model

**Files:** `src/api/schema.ts`, `src/api/duplicates.ts`, `tests/unit/duplicates.test.ts`

- [ ] Inspect the current `ignored_duplicates` table (if it exists) or whatever mechanism `recordIgnoredDuplicate` uses. If it's keyed on `(person_id_1, person_id_2)` with no entity_type column, add an `entity_type TEXT NOT NULL DEFAULT 'person'` column via the `initializeSchema()` migration pattern (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN` per `.claude/rules/api.md`).
- [ ] Update `recordIgnoredDuplicate` and the find-duplicates queries to filter by entity_type. Existing rows default to `'person'` (the migration's DEFAULT handles them).
- [ ] Unit test: ignored persons stay ignored after migration; ignoring a place pair doesn't hide a same-IDed person pair (no cross-type collision).

### Task 2: API — places duplicate find + merge

**Files:** `src/api/duplicates.ts` (or new `src/api/duplicates-places.ts`), `tests/unit/duplicates-places.test.ts`

- [ ] `findDuplicatePlaces(db, limit, offset)`: heuristic = (normalized_name equality OR Levenshtein distance ≤ 2) AND same parent_place_id (or both null). Score = string-similarity ratio. Return `DuplicatePlaceCandidate[]` with `place1`, `place2`, `score`.
- [ ] `mergePlaces(db, targetId, sourceId)`: in a transaction, repoint `events.place_id`, `places.parent_place_id` (self-reference!), `citations.place_id`, `group_links.entity_id WHERE entity_type='place'`, `task_links.entity_id WHERE entity_type='place'`. Delete the source row. Register `UndoAction` capturing every touched row's pre-merge state. Return `{ moved: { events: N, citations: N, ... } }`.
- [ ] **Comment in the function** lists every table the function repoints, with a unit test that greps `src/api/schema.ts` for tables with a foreign key to `places.id` and asserts the merge function references each. Catches future schema additions that forget to update merge.
- [ ] Tests: seed a fixture, merge, assert each repoint, assert undo restores prior state.

### Task 3: API — sources duplicate find + merge

**Files:** parallel to Task 2

- [ ] `findDuplicateSources`: heuristic = normalized title equality OR Levenshtein, same author (or both null).
- [ ] `mergeSources`: repoints `citations.source_id`, `source_repositories.source_id`. Delete source row. Undo. Self-check comment + unit test for FK coverage.
- [ ] Tests mirroring places.

### Task 4: API — media duplicate find + merge

**Files:** parallel to Task 2

- [ ] `findDuplicateMedia`: heuristic = same `file_ref` (high score, near-certain) OR same title (lower score). Both rows non-null `file_ref` and the bytes match → trivial merge; non-matching bytes or one null → user must pick.
- [ ] `mergeMedia`: repoints `media_links.media_id`, `media_regions.media_id`. Delete source row + (only if user confirmed) the source's file in `<dbname>-media/` (using `getMediaDir` per `.claude/rules/media.md`). Undo restores both the row and the file.
- [ ] **`mergeMedia` takes an explicit `keepFile: 'target' | 'source'` argument** so the function never decides on the user's behalf which file to delete. The UI is what asks; the function just executes.
- [ ] Tests including the "different files, source kept" case (target row deleted as part of the merge).

### Task 5: IPC + preload + MCP wiring

**Files:** `src/shared/channels/duplicates.ts`, `src/main/db-worker.ts`, `src/preload/index.ts`, `src/renderer/api.d.ts`, `src/mcp/createProdServer.ts`, `src/mcp/createDevServer.ts` (if relevant), `tests/unit/preload-coverage.test.ts`, `tests/unit/ipc-worker-coverage.test.ts`

- [ ] One `defineChannel` per new function, runOn `worker`.
- [ ] Worker handlers + preload entries + renderer typings.
- [ ] MCP: extend `find_duplicates` to take an `entity?: 'person' | 'place' | 'source' | 'media'` argument (default `person` for backwards-compat). Add `merge_places`, `merge_sources`, `merge_media` MCP tools mirroring `merge_persons`'s shape.
- [ ] All three coverage tests green.

### Task 6: Renderer — tab shell on DuplicatesView

**Files:** `src/renderer/views/DuplicatesView.vue`, `src/renderer/components/duplicates/PersonsTab.vue` (extracted from current view body), `PlacesTab.vue` / `SourcesTab.vue` / `MediaTab.vue`

- [ ] Refactor `DuplicatesView.vue` into a tab shell. The current persons body moves into `PersonsTab.vue` unchanged.
- [ ] Each new tab is a list of duplicate pairs (matching the persons-tab styling), lazy-loaded on tab activation.
- [ ] Tab state lives in the route query (`?tab=places`) so quality-check landing links can deep-link.
- [ ] Empty state per tab: "No duplicate <entities> found." (i18n keys per `frontend-design`.)

### Task 7: Renderer — compare-and-merge modals

**Files:** `src/renderer/components/MergePersonsModal.vue` (refactor), `MergePlacesModal.vue` / `MergeSourcesModal.vue` / `MergeMediaModal.vue`, `tests/components/`

- [ ] Look at the current `MergePersonsModal`. The two-column compare layout, target/source toggle, ConfirmModal cascade summary, and submit handler are all reusable. Either generalize into a `BaseCompareMergeModal` that takes per-entity field definitions + a merge function, or copy and adapt — pick based on whichever produces less drift between the four modals (the four-modal copy is fine if generalization adds more shared state than it saves).
- [ ] Each modal lists every authored field of its entity side-by-side, lets the user pick which side wins, and runs the merge via the appropriate `window.api.duplicates.merge*` call.
- [ ] Media modal additionally has the explicit "keep this file" radio per side (per Task 4).

### Task 8: Quality-check landing

**Files:** `src/api/checks/checks-duplicates.ts` (or wherever `DUPLICATE_*` rows are emitted), `src/renderer/views/QualityView.vue`

- [ ] Each `DUPLICATE_*` quality row gains a `landingPath` of `/duplicates?tab=<entity>&pair=<id1>:<id2>`.
- [ ] The duplicates view reads the `pair` query param on mount; if present, scroll the matching row into view and pre-open the compare modal.

### Task 9: E2E smoke

**Files:** `tests/e2e/duplicates.spec.ts`

- [ ] Seed a database with one duplicate of each kind (places, sources, media) plus the existing persons fixture.
- [ ] Test: open `/duplicates`, switch to each tab, click the pair, merge. Assert the pair disappears from the list and the next list-render does not re-suggest it.

### Task 10: Bump + archive

- [ ] Tick all checkboxes. Sub-skill review: `frontend-design`, `add-feature`, `undo-redo-patterns`, `subagent-handoff`.
- [ ] Minor bump (this is a feature).
- [ ] CHANGELOG `## Unreleased`: "Duplicates view now covers places, sources, and media in addition to persons. `find_duplicates` MCP tool accepts an `entity` argument; new `merge_places` / `merge_sources` / `merge_media` MCP tools."
- [ ] Update `docs/PLAN.md`: remove the Duplicates Panel backlog block.
- [ ] Append archive PLAN.md entry pointing at this plan + the design spec.
- [ ] `git mv` plan + design spec to archive.
- [ ] Final commit + merge.
