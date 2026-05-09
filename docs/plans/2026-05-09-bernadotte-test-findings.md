# Bernadotte test session — findings & follow-ups (2026-05-09)

## User goal

Build out the full Swedish royal Bernadotte line (Jean-Baptiste Bernadotte → Carl XVI Gustaf → Estelle / Oscar) end-to-end through the MCP server, exercising every entity type and side-panel section, then surface every bug, broken UX, and missing feature found while doing it. The user must be able to read this list and route each item to a fix without re-running the test.

## Status (2026-05-09)

Fixes landed in the same session as the test:

| # | Status | Item |
|---|--------|------|
| 1 | ✅ FIXED | List views don't refresh when MCP creates data |
| 2 | ✅ FIXED | `run_checks` date parser broken on day-month-year strings (was the cause of 232 of 359 issues). New `parseLooseDate` / `extractYear` / `dateDefinitelyAfter` helpers handle ISO, free-text English, and Swedish month names. `checks-relationships.ts` + `checks-chronology.ts` refactored to use them; SUBSTR(date_value, 1, 4) anti-pattern eliminated. Regression test in `tests/unit/check-utils-parse-loose-date.test.ts` (16 cases). **Requires app + MCP restart to take effect.** |
| 3 | ✅ FIXED | `add_place` silently discards `place_type`/`latitude`/`longitude`/`notes` |
| 4 | ❌ open | Empty `default_person_id` → empty Family Tree on a fresh DB |
| 5 | ❌ open | `merge_persons` leaves duplicate events behind |
| 6 | ❌ open | `merge_persons` adds a second `name_type='birth'` instead of demoting |
| 7 | ✅ FIXED | i18n missing for `eventTypes.accession` and `eventTypes.coronation` |
| 8 | ❌ open | `add_source` may silently drop `abstract` (verification + same-shape fix) |
| 9 | ❌ open | `living` flag on persons born >130 yrs ago without death event |
| 10 | ❌ open | Place type vocabulary too narrow for royal residences |
| 11 | ❌ open | Other event-type i18n keys may be missing (`name_change`, `census`, etc.) |
| 12 | ✅ FIXED | `EVENT_TYPE_VALUES` constant missing `name_change`, `accession`, `coronation` |
| 13 | ✅ ADDED | `ui_reload` MCP dev tool — Cmd+R via the bridge, lets the agent re-render after MCP-side mutations |
| 14 | ❌ open | No `PersonIdentifiersSection` UI — identifiers only addable via MCP |
| 15 | ✅ FIXED | `Uppgifter`/`Kvalitet` sections show (0) when collapsed because `v-if` unmounts the child whose `defineExpose({ count })` is the count source. Switched to `v-show` on PersonPanel + PlacePanel + MediaPanel. |
| 16 | ✅ ADDED | `ui_get_dom` extended with `mode` (outerHTML/innerHTML/textContent/attributes), `all`, `limit` — agents can extract specific section counts in 200 bytes instead of dumping 300 KB. |
| 17 | ✅ DONE | Quality-issue triage: 359 total → 232 are the date-parser bug (one fix), 65 are sloppy data (missing source citations), 41 are gazetteer/place-quality, 14 are real structural gaps, 7 are intentional fixtures or duplicates. No MCP-side data corruption. |
| 18 | ✅ DONE | `mcp-dev` skill updated with 3 new pitfall sections (pass-through-in-branches, `mutating: true` matters, v-show vs v-if for `defineExpose({ count })` sections). |
| 19 | ✅ DONE | Norwegian royal house added to validate fixes — Haakon VII → Olav V → Harald V + Sonja → Crown Prince Haakon + Mette-Marit. Cross-family link via Crown Princess Märtha (daughter of my existing Prince Carl, Duke of Västergötland) to the Bernadotte side. Adoptive parent_child relationship Haakon → Marius Borg Høiby tested and renders correctly in the panel ("Adoptivförälder") and chart ("Adoptivt förhållande" dashed line). |

## Final database shape (end of session)

- **60 persons** (47 Bernadottes + 11 Norwegian + 2 connecting Danish)
- **101 relationships** (couples + parent_child including 1 explicit `subtype: 'adopted'` and 1 `subtype: 'biological'`)
- **131 events** across 9 generations on the Bernadotte side and 4 generations on the Norwegian side
- **62 places** with full parent_chain hierarchy where authored (Sweden, Norway, Denmark, France, Germany, UK, Italy, Netherlands)
- **90 media** including 12 group photos with multi-person face tags
- **6 research tasks** demonstrating the Open / In progress / Stopped lifecycle
- **240 quality issues** in the Kvalitet view, predominantly the documented date-parser false positives

## What got built

- **47 persons** across 9 generations, from Karl XIV Johan + Désirée Clary (b. 1763 / 1777) down to Estelle, Oscar, Leonore, Nicolas, Adrienne, Alexander, Gabriel, Julian (b. 2012–2021)
- **80 relationships** (couples + parent_child)
- **104 events** (births, deaths, marriages, coronations, accessions, residences, name changes, occupations, burials)
- **46 places** with parent_chain hierarchy; explicit coordinates on 6 palaces
- **4 sources** + 4 repositories + repository links
- **90 media** items across persons, places, sources — both individual portraits (3+ per primary royal) and 12 group photos
- **~50 face tags** (`media_regions`) across the group photos including the all-grandchildren Solliden photo with 10 tagged regions
- **4 groups** (Svenska kungar, Svenska drottningar, Bernadottedynastin alla, Kungliga residens)
- **6 research tasks**, with status transitions tested (open → in_progress → stopped, with `result` filled in)
- **Person identifiers** (FamilySearch + personnummer) on Karl XIV Johan and Carl XVI Gustaf
- **Citations** on persons (3), events (8+), places (1), relationships (1)
- **Merge test**: created an intentional duplicate "Jean Baptiste Bernadotte", verified `find_duplicates` flagged it (score 85, reason: same surname + given_name_prefix + same_birth_date), merged, verified zero duplicates remaining
- **Edit tests**: relationship notes update, place coords update, person notes update, person_name preferred_name + nickname update, event place reassignment, research-task status + result update, media title + is_printable update
- **Delete tests**: media delete, event delete (post-merge cleanup), person_name delete (post-merge cleanup)

## Gaps found, ranked by user impact

### P0 — bugs that already cost the user trust this session

#### 1. List views do not refresh when MCP creates data
**Symptom**: with the app already open, the user opens Places / Groups / Tasks / Media and sees "Inga grupper / Inga platser / Inga uppgifter" while the DB has dozens of rows. Pickers and quality reports DO see the data; the list views don't.
**Why**: `src/preload/index.ts` defines `mutating()` that fires `dataChangedListeners` only when the renderer itself calls a mutating IPC. MCP-side mutations bypass the renderer entirely (they go directly to the worker DB), so no listener ever fires. The Vue list views (`GroupsView.vue`, `PlacesView.vue`, `ResearchTasksView.vue`, `MediaView.vue`) subscribe to `onDataChanged` and re-fetch — but they never get the signal.
**Fix shape**: have the MCP server (or the worker DB layer it shares with IPC handlers) broadcast a `data:changed` event to all `BrowserWindow`s after every mutating handler. This is the same broadcast already done by `src/main/ipc/database.ts` for undo/redo. Likely a one-line hook in `src/main/db-worker.ts` after every worker-thread-mutating channel call, gated on the channel being marked `mutating: true` in the registry.
**Verification**: with the app open, run any MCP tool that creates a group → list view shows it within 1s without a navigation cycle.
**Files to touch**: `src/main/db-worker.ts`, possibly `src/preload/index.ts` (IPC subscription side) — most of the wiring already exists.

#### 2. `run_checks` date parser is broken on day-month-year strings
**Symptom**: every historical person flagged with `FUTURE_BIRTH`, `FUTURE_DEATH`, `PARENT_BORN_AFTER_CHILD`, `BURIAL_BEFORE_DEATH`. The user opens the Quality view and sees the Bernadottes drowning in red errors.
**Examples seen this session**:
- `FUTURE_BIRTH` for Karl XIV Johan, "Födelsedag (26 Jan 1763) är i framtiden"
- `PARENT_BORN_AFTER_CHILD` for Karl XIV Johan (b. 1763) → Oscar I (b. 1799): "Föräldern (född 26) är inte äldre än barnet (född 4)" — the check picked up day-of-month "26" as a year and day "4" as a year
- `BURIAL_BEFORE_DEATH` for Karl XIV Johan: burial 26 Apr 1844, death 8 Mar 1844 — death string "8 Mar 1844" lexicographically less than "26 Apr 1844" so it was flagged
**Why**: the check is reading `event.date_value` which stores free-text "26 Jan 1763" rather than ISO. The parser appears to either:
  (a) take the first integer it sees and treat it as the year; OR
  (b) compare strings lexicographically without parsing at all.
**Fix shape**: the checks should parse `date_value` (or fall back to `date_original`) into a real Date / year-int via the existing date utilities used by the timeline (`get_timeline` works correctly with the same data, so the parser exists somewhere). All four check codes touch the same parser. There is also a duplication issue — `PARENT_BORN_AFTER_CHILD` was emitted 7× for one parent_child relationship in this session.
**Verification**: run_checks on Karl XIV Johan returns ≤ 1 result and no `FUTURE_*` codes for any person born before today.
**Files to touch**: `src/api/checks.ts` (or wherever `BURIAL_BEFORE_DEATH` / `FUTURE_BIRTH` / `FUTURE_DEATH` / `PARENT_BORN_AFTER_CHILD` are computed). Add regression tests in `tests/unit/` using historical DB seeds — this is a pure data-layer test, no UI needed.

#### 3. `add_place` silently discards `place_type`, `latitude`, `longitude`, `notes`
**Symptom**: caller passes coords + notes + place_type to `add_place`; tool reports success; row is created but those four fields come back null. Caller then has to call `update_place` to fix it. This is a Prime-Directive violation — authored data was silently dropped.
**Reproduction**: `add_place(name: "Pau", latitude: 43.295, longitude: -0.37, place_type: "city", notes: "Birthplace ...")` → returns row with `place_type: null, latitude: null, longitude: null, notes: ""`. Following `update_place` with the same values writes them correctly, so the columns exist and the IPC handler accepts them — the bug is in `add_place`'s mutation builder dropping fields not in some shorter allowlist.
**Fix shape**: align the field allowlist in `src/api/places.ts` `addPlace()` (or whatever it's called) with the full schema. The MCP tool definition already declares those four fields as accepted parameters, so the schema mismatch is between the tool surface and the internal `INSERT` statement.
**Verification**: a test that calls `addPlace` with all eight optional fields and reads them back unchanged.
**Files to touch**: `src/api/places.ts` + a new test in `tests/unit/places.test.ts`.

#### 4. Empty `default_person_id` → empty Family Tree on a fresh DB
**Symptom**: open a fresh database with persons in it but no `default_person_id` setting yet, navigate to "Släktträd" — the Timglas chart is blank. The user thinks the tree is broken; the actual problem is no focal person was set. Calling `chart_focus_person` (or clicking any person from the Personer list) fixes it instantly.
**Fix shape**: when the app loads a DB and finds no `default_person_id` setting, auto-pick the lowest `display_id` person (or the most-events person, or the most-recently-edited one) as a transient focal person. Don't write it back to the DB — render-time only.
**Verification**: switch to a DB with persons but no setting → tree renders, no empty state.
**Files to touch**: `src/renderer/views/TreeView.vue` (or wherever the chart fetches the focal-person id) — add a fallback when the setting is null.

### P1 — bugs that confused the user but were recoverable

#### 5. `merge_persons` leaves duplicate events behind
**Symptom**: merged source person's birth_event participant link onto target — but kept the source's birth_event itself. Karl XIV Johan ended up with two identical birth events ("26 Jan 1763 in Pau") differing only by created_at. Required manual `delete_event`.
**Fix shape**: during merge, for each event-type-with-cardinality-1 (birth, baptism, death, burial), if both source and target have one, keep target's and delete the source's (or merge their citations onto the target's event).
**Verification**: after merging two persons that both had a birth event, `get_person_summary` on the target shows one birth event.
**Files to touch**: `src/api/merge.ts`.

#### 6. `merge_persons` adds a second `name_type='birth'` instead of demoting to `aka`
**Symptom**: merging "Jean Baptiste Bernadotte" (no hyphen) into "Jean-Baptiste Jules Bernadotte" left the target with two `name_type='birth'` rows. The first is the real birth name; the second is the source person's primary name carried over verbatim.
**Fix shape**: during merge, the source person's primary (lowest sort_order) name should be transferred as `name_type='alias'` or `name_type='aka'`, not `birth`. A person can only have one canonical birth name.
**Verification**: post-merge, target has exactly one `name_type='birth'` row.
**Files to touch**: `src/api/merge.ts`.

#### 7. i18n missing for `eventTypes.accession` and `eventTypes.coronation`
**Symptom**: Person side panel shows the literal text "eventTypes.accession" next to the date for any throne accession or coronation event. Visible on every monarch in the Bernadotte line. Both keys are absent from `src/renderer/i18n/sv.ts` AND `en.ts`.
**Fix shape**: add Swedish + English translations for both keys. Suggested: `accession: "Trontillträde"` (sv) / "Accession to throne" (en); `coronation: "Kröning"` (sv) / "Coronation" (en).
**Verification**: open a monarch's panel — the event row shows a real label not a raw key.
**Files to touch**: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`, plus eventTypes constant if `accession` isn't yet listed.

### P2 — smaller polish, recurring annoyances

#### 8. `add_source` may silently drop `abstract`
Observed in tool output: passed `abstract: "Official genealogy and biographies maintained by the Royal Court."` to `add_source`; response shape included `"abstract": null`. Same root-cause shape as #3 (mutation builder out of sync with the tool surface). Needs verification + same-shape fix in `src/api/sources.ts`.

#### 9. `living` flag stays `true` for persons born 1763 until a death event is added
This is correct behaviour by design (living auto-derives from death event presence), but for historical persons created without a death event yet, the UI shows "still living" which is misleading. Consider a heuristic: if birth was > 130 years ago and no death recorded, show "living: unknown" rather than "living: true". Low priority.

#### 10. Place type vocabulary too narrow for royal residences
Stockholms slott, Drottningholms slott, Haga slott, Solliden, Riddarholmskyrkan all had to be classified as `place_type: 'other'` because the enum doesn't include `palace`, `castle`, `church`. Research task #871470d8… already opened against this.

#### 11. Some untranslated event-type keys may exist beyond accession/coronation
Symptom seen only on `accession`/`coronation` this session, but the same audit should look at `name_change`, `census`, `baptism`, `christening`, `engagement`, `divorce`, `emigration`, `immigration`, `military_service`, `education`, `religion` to check coverage. The translation table appears to be hand-maintained, so missing keys are likely.

## Workarounds the user already needs

- **After any MCP-driven session, reload the renderer** (Cmd+R) to see the new data in list views. Caused by gap #1.
- **For historical DBs, ignore `FUTURE_BIRTH` / `PARENT_BORN_AFTER_CHILD` / `BURIAL_BEFORE_DEATH`** in the Quality view until #2 is fixed — they are noise.
- **After every `add_place`** with non-default fields, immediately call `update_place` with the same fields. Caused by gap #3.
- **After `merge_persons`**, manually inspect the target person's events for duplicates and the names list for redundant `birth` rows. Caused by gaps #5 and #6.

## Verification

The verification of *this* document is whether the next maintainer can read it without re-running the Bernadotte test and produce a fix for at least items #1–#4 (the P0 set) within one work session each. If any item lacks a "Verification" line that's runnable in isolation, the entry is too vague — rewrite it before moving on.
