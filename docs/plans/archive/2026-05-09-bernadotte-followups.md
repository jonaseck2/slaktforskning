# Bernadotte test session — follow-up plans

Companion to [`2026-05-09-bernadotte-test-findings.md`](./2026-05-09-bernadotte-test-findings.md). The findings doc is the inventory; this doc is the work to schedule. Items already fixed in the same session are listed in the Status table at the top of the findings doc.

## User goal

Every right-side panel section in the running app (Person, Place, Source, Media, Group, Research Task) shows non-zero data when the underlying database has it — no hidden DB rows, no "(0)" badges that contradict the DB, no dead-end MCP-side mutations that the UI can't surface. The user opens any panel for a fully-populated entity and sees ≥1 entry per section, plus a way to author new entries from the panel itself.

## Scope

Every `*Panel.vue` in `src/renderer/components/` and the section components they host. Each panel section either:

- **(a)** has a working list+add UI today and needs no work, OR
- **(b)** has DB rows and an MCP path to write them but no UI section — needs a new section component, OR
- **(c)** has a UI section but a query bug that hides existing rows — needs a fix in the section / api / IPC.

This plan tackles all three categories. Items expected to land as small individual fixes are listed under "Quick wins"; items that need a fresh component or substantial query work are listed under "Plans".

## Scope deviations

None for the panel-coverage work itself. Three findings from the test session are tracked separately because they are not panel-shaped:

- `run_checks` date parser bug — pure api-layer fix, lands on its own.
- `merge_persons` event/name dedupe — pure api-layer fix, lands on its own.
- `default_person_id` empty-tree fallback — render-time fallback in `TreeView`, lands on its own.

Those three are tracked in the Status table of the findings doc and need their own (smaller) plan only if they grow.

## Verification

The verification of this plan is operating the running app on a fully-built Bernadotte database and confirming, panel by panel:

1. Person panel for Karl XIV Johan shows non-zero counts on every section, including Identifierare and Kvalitet.
2. Place panel for Stockholms slott shows non-zero counts on every section that should have content (Underplatser, Personer härifrån, Händelser här, Källor, Media, Forskningsuppgifter, Grupper).
3. Media panel for Karl XIV Johan's 1843 portrait shows non-zero counts on every section (Taggar, Länkar, Källor / Citationer, Anteckningar).

Each panel must also offer a `+ <Noun>` action that creates the matching primitive without leaving the panel surface.

## Quick wins (one PR each, no plan needed)

### Q1. PlacePanel + MediaPanel inventory pass

Same shape as the PersonPanel inventory done during the test:

- Open PlacePanel for a place with linked events, media, persons, and a research task. Screenshot every section. Note which counts contradict the DB.
- Open MediaPanel for a media with face tags + multiple entity links. Same inventory.
- File one issue per `(0)` count that has a corresponding DB row, plus one issue per DB row with no UI section.

This is the same shape as the PersonPanel inspection that produced the Uppgifter/Kvalitet findings. Drop the resulting issues into category (b) or (c) and close them out one at a time.

### Q2. `add_source` field allowlist audit

Same shape as the `add_place` fix that landed this session. The MCP tool's `inputSchema` already declares `abstract`. Verify against `src/api/sources.ts` `createSource` and confirm every declared field reaches the `INSERT`. Add a test that round-trips every optional field. Recurring failure mode — every entity-level mutation builder needs the same audit (probably `add_repository`, `add_research_task` too).

### Q3. `run_checks` date parser

Replace the broken-string parser with the same logic `get_timeline` uses (it correctly orders the same `date_value` strings). Drop the `parentBirthYear: 26` / `childBirthYear: 4` style messages — those are the symptom of the bug. Add fixture rows with day-month-year dates spanning 1700–2026 and assert no false positives. Also dedupe `PARENT_BORN_AFTER_CHILD` so it fires once per relationship, not once per child event.

### Q4. `default_person_id` fallback in `TreeView`

When the renderer loads a DB and `getDbSetting('default_person_id')` returns null, auto-pick the lowest `display_id` person as a transient focal person — render-time only, do not write to the DB. Closes the "blank tree on a fresh DB" finding.

### Q5. Place type vocabulary

Add `palace`, `castle`, `church` to `PLACE_TYPE_VALUES` in `src/renderer/constants/eventTypes.ts` and the matching MCP `add_place` enum, plus i18n labels in sv + en. Single-line additions in three places.

### Q6. i18n event-type audit

Walk every value in `EVENT_TYPE_VALUES` and verify a key exists in both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`. Add missing labels. The `accession` / `coronation` finding from this session is already addressed; this is the broader audit to ensure no other event type ships untranslated.

## Plans (need a design pass)

### Plan A. PersonIdentifiersSection — new UI section

Identifiers (`person_identifiers` table) have full MCP coverage (`add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`) and a hand-maintained renderer-rules entry mentioning `PersonIdentifiersSection`, but the section component does not exist. Identifiers added via MCP (FamilySearch, Ancestry, Riksarkivet, personnummer, GEDCOM REFN/RIN) are completely invisible in the running app.

**User goal:** when a researcher records a FamilySearch ID or Riksarkivet reference for a person, they see it in the side panel within the same session and can edit/delete/copy it from that surface.

**Component shape:** self-loading section per the renderer rules' "Person Section Component pattern":

- Props: `personId: string`
- Loader: `(id) => window.api.persons.getIdentifiers(id) as Promise<PersonIdentifier[]>`
- Renders a small table: identifier_type (badge) + identifier_value (monospace). Per-row delete button. Header `+ Identifierare` opens an inline modal with a type picker (familysearch / ancestry / riksarkivet / personnummer / refn / rin / other) and a value field.
- `defineExpose({ count })` so PersonPanel's section header shows `(N)`.
- Wire into `src/renderer/components/PersonPanel.vue` between the Namn section and the Person fields, and add a section toggle key.

**Tests:** in `tests/components/`, mount PersonIdentifiersSection with a stub `window.api.persons.getIdentifiers` returning two rows; assert both render, assert delete fires the correct IPC. In `tests/unit/`, the api functions are already covered.

**Verification:** open Karl XIV Johan's panel after MCP-creating a `familysearch: L8B5-9MK` identifier — section renders with 1 row, count badge says (1), delete works.

### Plan B. `merge_persons` post-merge dedupe

Two findings collapse into one plan:

1. After merging two persons that both have a birth event, the target ends up with two birth events (one from each side).
2. The source's primary `name_type='birth'` is moved to the target as `name_type='birth'` rather than demoted to `aka` — leaving the target with two `birth` rows.

**Fix shape:** in `src/api/merge.ts`, after moving rows:

- For event types with cardinality 1 (birth, baptism, death, burial), if the target already has one and the source contributed one, keep the target's, delete the source's, **and merge any source-event citations onto the target's event** (don't drop them).
- For person names: any source name with `name_type='birth'` becomes `name_type='aka'` on the target. The target's existing primary birth name is canonical.

**Tests:** unit test seeds two persons with overlapping birth events + primary names, calls `mergePersons`, asserts:
  - exactly one birth event remains on the target
  - the source's birth-event citations are still present (now linked to the target's surviving event)
  - exactly one `name_type='birth'` row on the target
  - the source's primary name is preserved as `aka`

**Verification:** the Bernadotte test should be re-run with the merge step — the post-merge cleanup (delete duplicate event, delete duplicate name) that was needed manually this session should no longer be needed.

## Failure modes / RCA reference

The MCP-side cache gap (#1 in the findings doc) was the highest-impact bug in the test, and the most subtle: pickers worked, quality reports worked, the DB had the data — only list views and panel section counts were stale. Fix landed this session via worker-side `data:changed` broadcast forwarded through `worker-client.ts`'s existing `type === 'broadcast'` handler, plus a preload `ipcRenderer.on('data:changed', ...)` subscriber that fans out to the existing `dataChangedListeners` registry. Regression-tested as a static-text contract in `tests/unit/data-changed-broadcast.test.ts` — if either end of the wiring is removed, MCP-driven seed tests will silently regress.

The follow-up plans above all share the same evaluation ground: the next time we run the Bernadotte test, every (0) panel-section count in the running app must correspond to a genuinely empty section, not a missing UI or a stale cache.
