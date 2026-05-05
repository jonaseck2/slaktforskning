# Changelog

## Unreleased

- fix: clarify "date original" field with label and helper; flag misuse via quality check
- fix: per-row partner heading is singular ('Partner' not 'Partners')

## 0.215.2

- fix(chart): multi-partner connector sits a quarter of the gap above the row, no longer overlapping the parent line

## 0.215.1

- fix(chart): multi-partner connector now routes above the row so it doesn't cross children

## 0.215.0

- feat: relations on a person panel render in a deterministic order

## 0.214.0 — Event participants parity + marriage-flow prompts

- feat(events): editing a wedding/marriage/engagement/divorce now shows the "Other person" picker pre-filled — the affordance is symmetric across create and edit
- feat(events): every event type (baptism, funeral, christening, …) now exposes a Deltagare / Participants section, so witnesses, godparents and mourners can be recorded against any event
- feat(relationships): saving a couple+marriage relationship without a wedding event now offers to record the wedding inline; declining writes nothing
- feat(relationships): creating a second partnership while an existing one has no divorce event and the partner is still alive now warns before silent overlap; the user can proceed or cancel

## 0.213.0 — Hourglass chart polish

- feat: siblings and shared children render oldest-leftmost in the family chart
- feat: partner edges no longer cross other partners' boxes when a person has 2+ partners
- feat: shared children visibly hang from the couple connector, not from one parent
- feat: foster parent–child relationships render with a dashed line and a hover label
- feat: clicking a relative pans the chart to keep them on screen

## 0.212.2

- fix: long text in panel tables clips with ellipsis instead of stacking vertically

## 0.212.1

- fix(places): the map sheet no longer overflows its column when the center is squeezed narrow (small windows, default panel widths, static-export preview iframe). `.map-chart-area` was held open at `min-width: 200px` while its parent shrank, so it leaked across the list and panel columns. Now matches `PersonsView`'s `.viz-chart-area` (min-width: 0 + overflow: hidden on the wrapper) — the map shrinks cleanly with its slot.

## 0.212.0

- feat(person-modal): the Save button in "Lägg till ny person" stays disabled until the user types at least one name field; no more accidental nameless persons. Existing nameless rows in user databases are surfaced via a new `PERSON_NO_NAME` quality check (notice severity).
- feat(persons): every server-side path that creates a person row now refuses to do so without a name — `persons.create`, `persons.createWithEvent`, MCP `create_person`, MCP `add_child`. Importers (GEDCOM, Holger, Genney, archive .zip) opt in via an explicit `allowNameless: true` and append a warning to the import report when an INDI/PERSON record carries no NAME tag, preserving the source's reference graph without silent drops.

## 0.211.3

- fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)

## 0.211.2

- fix: Place Details panel now reactively previews Type / Parent / Coordinates as you type in the Name field, matching the Add Place modal

## 0.211.1

- fix: place name autocomplete no longer opens its dropdown when the panel switches to a different place

## 0.211.0

- feat: place name field autocompletes from existing places + gazetteer in both the Add Place modal and the Place Details panel — picking a suggestion only fills the name string, no merge or side-effects

## 0.210.12

- fix: place tree picker filter input now has matching padding around it, like other filter boxes

## 0.210.11

- fix(import): Holger imports no longer crash with `ReferenceError: existsSync is not defined` the moment they hit an inline OBJE. v0.210.7 removed the `existsSync` import from `obje-importer.ts` (matching the parallel cleanup in `phaseObje`) but missed the call site at line 53. Lint with `--quiet` doesn't surface "used identifier with no matching import," so the regression shipped through v0.210.10. `is_missing` now derives from `!file` only — on-disk truth is decided later by `consolidateMediaFolder`'s single recursive readdir, matching `phaseObje`.
- fix(import): media imported via Holger now actually loads in the renderer. v0.210.7's bulk-copy step preserves the source media folder structure (e.g. `Media/P12/photo.jpg` → `<dbname>-media/P12/photo.jpg`), but `consolidateMediaFolder`'s fast-path was rewriting the DB ref to `<dbname>-media/photo.jpg` (basename only, flat). Every row's `file_ref` therefore pointed at a path that didn't exist; `media:readAsDataUrl` returned null, MediaView spinners hung, AppAvatars showed initials. Consolidate now takes a `bulkCopiedFromDir` argument from the import handler and writes the relative subpath that matches what bulk-copy actually placed on disk. Existing databases imported under v0.210.7–v0.210.10 need to be re-imported to pick up the corrected refs.
- fix(import): consolidate's fast-path now verifies the bulk-copied file is actually in dest before rewriting the ref. If a source file was missing from the bulk-copy tree (the wetransfer bundle didn't include it, etc.), the row is counted as `missing` instead of silently writing a broken ref.

## 0.210.10

- perf(media): `getPersonProfilePicRefs` (the bulk endpoint behind every avatar batch fetch) now runs two SQL queries total regardless of input size — one window-function pass over `media_regions` to pick the first face tag per person, and one pass over `media_links` for persons without a face tag. Previous implementation was a JS loop calling the singular per-id helper, so a 50-row PersonsListTab triggered 100 SQL prepares + executes inside one IPC. Down to 2.
- fix(profilePic): if the batched profile-pic IPC rejects (worker error, dropped reply, anything), the store now logs `[profilePic] batch fetch failed:` and marks every queued person as `error` so the loading spinners terminate cleanly. Without this, the shared `pendingPromise` would hang forever and AppAvatars would spin until the user navigated away.
- chore(gazetteers): the `[gazetteers] coord divergence at …` warning is off by default. With multiple sources merging the same World tree, a single mismatched coordinate fires the warning hundreds of times per gazetteer load and floods the terminal buffer. The divergences themselves are upstream script bugs to fix one-off, not runtime concerns. Re-enable with `SLAKTFORSKNING_GAZETTEER_DEBUG=1` when actually triaging.

## 0.210.9

- perf(ipc): the DB worker no longer pins on synchronous file reads when the renderer mounts a list view full of avatars. `media:readAsDataUrl` and `media:getFilePath` were doing `fs.readFileSync` / `fs.existsSync` on the worker thread; with media in the database, switching to PersonsListTab fired N per-row IPCs that each blocked the worker for the duration of a 5 MB JPEG read + base64 encode (~50 ms each), serialising every other handler behind them. Reads now go through `fs.promises.readFile` / `fs.promises.access` — libuv's threadpool runs them in parallel and the worker stays responsive between callbacks.
- perf(renderer): the profile-pic store now coalesces per-row `ensureLoaded` calls into a single batched `media:profilePicRefs` IPC per microtask. Mounting PersonsListTab over a 22k-person DB fired one IPC per visible avatar (50+ round-trips through the worker) — Vue flushes child component setups inside the same microtask, so collecting them into a single `ensureBatch` call collapses that into one round-trip with no UX change.
- perf(renderer): `PersonsView.load()` no longer fetches the entire `persons` table just to compute `noPersonsExist` / `noFocalPerson`. The previous `persons.list()` returned all 22k rows (with joined names) so two boolean comparisons could run; now `persons.listPage(1, 0, ...)` returns one row plus the total via the existing pagination path.
- fix(worker): lifecycle handlers (`init`, `db-switch`, `import-start`, `import-end`) now log a clear `[db-worker] lifecycle handler crashed:` line before re-throwing. Without this, an `openDb` failure (corrupt DB, failed migration, lock race) took the worker down silently and every subsequent IPC failed with the unhelpful `Worker exited with code 1`.

## 0.210.8

- fix(ci): the Vitest root `testTimeout: 15000` was not inheriting into the `unit` and `components` projects, so per-project timeouts silently fell back to the 5 s default. Windows runners hit this on `mcp.test.ts > switch_database` (slow first-time SQLite-WASM init) and `import-genney-orchestrator.test.ts > isDockerAvailable` (slow `where docker` spawn). Now set per-project too.
- fix(ci): e2e tests against the packaged Linux binary now pass `--no-sandbox --disable-setuid-sandbox` to Electron on Linux runners. GitHub Actions' Ubuntu image ships the packaged binary without the root-owned, mode-4755 `chrome-sandbox` helper that Electron's SUID sandbox requires, so the binary aborted at startup with `chrome-sandbox helper binary was found, but is not configured correctly`. macOS and Windows still launch unmodified.

## 0.210.7

- perf(ipc): the per-IPC timing log was running unconditionally in production, doing two synchronous `fs.appendFileSync` calls per IPC handler invocation. After a long session it had grown to 1 GB; appending to that file from the Electron main thread on every renderer call eventually serialized the entire IPC bus — `persons:list` calls were observed taking over 4 minutes from queue to response while the actual handler completed in milliseconds. The log is now off by default and gated behind `SLAKTFORSKNING_IPC_LOG=1`; when enabled it uses a buffered write stream instead of sync appends. The 1 GB log this regression produced sits in `~/Library/Application Support/Släktforskning/ipc-timing.log` — safe to truncate.
- perf(import): Holger imports with a media folder now finish in seconds instead of minutes. Three compounding issues:
  - The media folder was copied one file at a time inside `consolidateMediaFolder` with up to 7 sequential `await` calls per file (multiple stat/exists checks + `copyFile` + a diagnostic stat), so libuv's threadpool sat ~75% idle. The Holger handler now bulk-copies the source media tree up front via `fsp.cp({ recursive: true })` (one Node call, libuv parallelises internally), and consolidate fast-paths every row already present in dest with a single `Set.has` lookup.
  - The remaining slow-path copies (files outside the bulk-copy tree) now use `COPYFILE_EXCL`, which lets the kernel handle "dest exists" / "source missing" atomically — one syscall per file instead of stat+open+write.
  - The 12k `UPDATE media SET file_ref = ?` rewrites were each their own autocommit, triggering a WAL fsync per row (~1–5 ms each on APFS). Now wrapped in `BEGIN IMMEDIATE / COMMIT` — one fsync at the end. CLAUDE.md's existing "writes > 50 rows must be transactional" rule applies; this loop was missed.
- perf(import): `phaseObje` and `importObjeNode` no longer call `existsSync` per OBJE record (~12k synchronous stat calls on the main thread for a Holger import). The `is_missing` flag is now derived from "do we have a file_ref" only; whether the file is actually on disk is decided later by `consolidateMediaFolder`'s single recursive readdir of the dest folder.
- perf(import): Genney's `.backup` archive media copy migrated from `fs.cpSync` to the new async `bulkCopyMediaFolder` helper, so the main thread stays responsive during the copy.
- chore(import): Holger import path emits boundary timing logs (`[import-timing] ...`) for parse, each phase, bulk copy, consolidate, and total handler time — visible in the npm-start terminal. Useful when tracking down regressions in this area; constant overhead, no per-row chatter.

## 0.210.6

- fix(ci): release workflow no longer self-deadlocks on artifact storage quota. The cleanup job was gated on `release.result == 'success'`, but the release fails when uploads hit quota — so cleanup never ran and quota stayed full forever. Cleanup now runs `if: always()`, keeps only the 3 newest artifacts (was 30), and build artifacts get `retention-days: 1` since they're transit-only between the build and release jobs (the durable copies live on the GitHub Release page). v0.205 → v0.210.5 binaries were lost to this; first release after the fix is v0.210.6.
- fix(tests): two Genney import tests no longer time out on Ubuntu CI. They asserted "Docker spawn rejects without a real Derby DB," but Ubuntu runners ship Docker preinstalled, so the spawn took longer than the default 5 s test timeout to actually fail. Per-test timeout bumped to 30 s.

## 0.210.5

- perf(import): large GEDCOM imports (10k+ persons) no longer churn CPU for minutes. `createPerson` was running two correlated `EXISTS` subqueries through `livingSqlExpr` after every INSERT, scanning the growing `events` + `event_participants` tables — turning bulk imports into O(n²). The just-created person has no events yet, so the derivation is skipped. Regression introduced when the stored `living` flag was replaced by the read-time derivation; the report-side fix landed in `loadLivingDerivation`, but the import-side call site was missed.
- perf(places): added `places(normalized_name)` and `places(parent_place_id, normalized_name)` indexes. `findOrCreatePlace` and `findOrCreatePlaceWithChain` were doing full-table scans on every event — fine on day one, O(n²) once you've imported a few thousand places. Idempotent migration runs on next DB open.
- perf(import): media consolidation no longer freezes the renderer. `consolidateMediaFolder` is now async — `fs.copyFile` and `fs.access` go through libuv's threadpool so the main thread stays free to service IPC traffic (list loads, undo, panel switches) between file copies. Previously a 1.5 GB media import blocked the main thread for ~38 s of synchronous `copyFileSync` calls at ~40 MB/s while the UI sat unresponsive at 10 % CPU.
- fix(import): the Holger and Genney import handlers now set `importInProgress` like the GEDCOM and archive handlers, so the worker thread skips `checks:runAll` for the duration of the import instead of running quality checks concurrently with the import's writes.

## 0.210.4

- fix(gazetteers): toggling a gazetteer in settings now actually re-resolves places everywhere — the resolved-via line, map pins, and tree picker hits all reflect the new enabled set immediately. The shared resolver's `ready` ref was created per-call, so when GazetteersView invalidated the cache the other consumers (PlacePanel, MapView, useResolvedPlace, …) never saw the flip and kept rendering against the old tree. `ready` is now module-level shared state, `invalidate()` drops the gazetteer references too (not just the result cache), and saving the settings calls `ensureLoaded()` so the new tree is in place before consumers re-run.
- fix(gazetteers): `resolveBoundary` now respects the user's enabled-set; disabling a boundary gazetteer in settings actually removes its polygons from the map.

## 0.210.3

- fix(gazetteers): the GazetteersView "Test Lookup" panel now shows one row per source gazetteer that produced a hit (with each source merged with the enabled language gazetteers for alias enrichment), so `world-historical` is visible again when testing historical names like "Sovjetunionen". Previously the loop iterated the merge engine's single synthetic gazetteer, hiding every source under the "Merged hierarchy" label.
- feat(gazetteers): test-lookup results have a Matched / All-enabled filter chip — "Matched" (default) shows only sources that resolved the input; "All enabled" lists every enabled source with a "no match" placeholder for the rest, so it's clear which sources you've enabled but didn't contribute.
- fix(ux): the test-lookup search input uses the canonical `.list-filter-input` style (padding, border-radius, focus ring) shared with the list/tree pickers across the app, instead of its own slightly off variant.

## 0.210.2

- fix(gazetteers): the resolver no longer requires the matched node to be a leaf to call a match `exact` — "Afrika" → Africa and "Sverige" → Sweden now report `exact` instead of `partial`. The leaf-only shortcut was a relic from when leaves were the "specific" places (parishes, cities); with the global hierarchy every continent and country has children, so the shortcut downgraded every input that landed on a real, fully-consumed node above leaf level.
- fix(gazetteers): the "Resolved via" line in PlacePanel, PlaceFormFields, and the map popup now shows the real source gazetteer IDs (`world-boundaries`, `lang-sv-geonames`, …) from the matched node's `__contributors`, instead of the synthetic merge-engine id `__merged__`.

## 0.210.1

- fix(gazetteers): translation-only language gazetteers carrying the legacy `kind: 'language'` discriminator (instead of the new `shape: 'language'`) were being walked as data gazetteers, so their Swedish/historical aliases never reached the merged tree; loader now treats both as synonyms
- fix(gazetteers): län-letter codes (e.g. "Solna (B)" → Stockholm) and historical län aliases re-attach under the new World > Europe > Sweden > <län> path, where each län's `name` is the bare form and the genitive lives in aliases
- fix(gazetteers): `loadGazetteers` returns an empty array when no gazetteers are enabled (was a synthetic empty-World shell)
- feat(gazetteers): `sv-sockenstad-boundaries` and `dk-sogne-boundaries` cross-reference both modern and church/Wikidata + DAWA parish gazetteers when looking up parent-admin chains, raising the polygon→kommun match rate for older / merged parishes (sv: 198 → 106 unmapped of 2473; dk: ~67 → 2 unmapped of 2148)

## 0.210.0

- feat(gazetteers): global gazetteer hierarchy migration. The picker, panel breadcrumb, resolver, and map now see one canonical place hierarchy rooted at `World` (with `World (Historical)` as a sibling super-root). Every per-country and per-source gazetteer emits a self-rooted tree typed by the closed admin vocabulary `world | continent | country | admin{N}`. The structural-merge engine collapses same-`(name, type, parent_path)` nodes across sources — Eksjö kommun is one node with `__contributors` listing every gazetteer that contributed to it. Resolver verified end-to-end across SE/FI/NO/DK/IS/US/CA/DE plus `World (Historical)` for historical empires. `GazetteerNode.type` tightened to the closed type. Imported user gazetteers must root at `World` or `World (Historical)`.
- feat(gazetteers): every per-country gazetteer re-fetched fresh and re-rooted under World > Europe / North America. Per-country admin1/admin2 names are GeoNames-canonical with locale suffix as alias (Jönköpings län → Jönköping with alias). Source attributions: GeoNames CC BY 4.0 (countries, admin1, admin2 codes, country dumps for SE/NO/FI/IS/US/CA/DE), Wikidata CC0 (Swedish parishes, Danish parishes, Swedish landskap, world-historical), DAWA CC BY 4.0 (Danish parish administration), Lantmäteriet CC0 (Swedish parish & city polygons), GeoDanmark via ok-dk/dagi (Danish parish polygons), Natural Earth public domain (world country polygons + continent polygons). Boundary gazetteers cross-reference each country's GeoNames `.txt` ADM1/ADM2 rows for parent-admin lookup so polygons attach under their canonical fylke/state/Bundesland.
- chore(gazetteers): structural-merge engine in `src/api/place-gazetteers/merge.ts` replaces the legacy attach-only loader. Build scripts produce trees that match the contract; the load-time engine is mechanical merge with `__contributors: string[]` for provenance — no per-country mapping tables in app code, no fixtures, no privileged "scaffolding" gazetteers.

## Unreleased

- chore: extend Surface contract guidance with a fourth check — "no silent degradation across state" — capturing the pattern behind the place-picker filter dropping gazetteers and the section-CTA failing on collapsed sections, as a single principle rather than two specific patches
- fix: section header action buttons (+ Event, + Media, + Add task, etc.) now expand the section first when collapsed, so the result of the action is visible — previously, clicking + Media on a collapsed Media section silently no-op'd because the section's body wasn't mounted yet
- fix(mcp): place tools (`add_place`, `update_place`, `record_event`) now reject comma-strings in `name`/`place` and accept an explicit `parent_chain` / `place_chain` (root → leaf) — closes the "Chennai, India, World, India, World" RCA where an agent's path-shaped string got persisted verbatim as a place name
- fix: places map keeps its zoom and pan when you set a pin — no more snapping back to Sweden after every map click
- fix: place modal now previews gazetteer resolution (parent, type, coords) inline like the side panel does
- fix: place panel name field is a plain editable text input — picking from the old name picker no longer silently overwrites parent/type/coords
- fix: research-task delete confirmation and toast now show the task title instead of "Unknown" — caught immediately by the fresh-context audit re-run after host-level lifecycle was added to the Surface contract
- feat: every entity panel now has a Danger-zone delete button at the bottom, mirroring the existing person delete; places, sources, media, groups, and research tasks can now be deleted directly from their panels (places previously had no UI delete path at all)
- chore: extend Surface contract guidance in CLAUDE.md to cover host-level lifecycle (the panel must let the user delete the entity it's hosted on, not just the items inside its sections)
- fix: place panel's Persons section no longer carries a "+ Event" button — the section is a derived view, and a fresh-context audit caught the title/label mismatch (Persons section + Event handler); a small running hint signposts the Events section above as the canonical add path
- chore: tighten Surface contract guidance to distinguish title-mismatch and duplicate-on-derived-view failures from convenience-duplicate Add CTAs across alternate views of the same primitive
- chore: codify Surface contract guidance for panel CTAs in CLAUDE.md
- feat: + Event from a place pre-fills the place; the place panel's Persons section now uses + Event so adding a person there actually attaches them to the place
- fix: removed the unwired duplicate + Media button on Media Timeline sections in the Person and Place panels
- feat(mcp): MCP feature parity with the desktop app. The prod server now exposes 77 workflow tools (was 39) covering full CRUD on every record type the renderer can author or curate. New tools: `update_relationship`, `delete_relationship`, `add_event_participant`, `remove_event_participant`, `delete_event`, `update_source`, `delete_source`, `update_citation`, `delete_citation`, `update_place`, `delete_place`, `link_media`, `unlink_media`, `reorder_media`, `update_media_region`, `delete_media_region`, `delete_research_task`, `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`, full Groups domain (`add_group`, `list_groups`, `get_group`, `update_group`, `delete_group`, `add_group_link`, `remove_group_link`), full Repositories domain (`add_repository`, `list_repositories`, `get_repository`, `update_repository`, `delete_repository`, `link_source_repository`, `unlink_source_repository`, `get_repositories_for_source`), and `import_archive` / `export_archive` for `.zip` round-trip with media. Coverage is enforced by a registry-completeness test in `tests/unit/mcp.test.ts` so future regressions break CI.
- feat(mcp): new `update_media` and `delete_media` MCP tools. Closes the gap that left an agent unable to repair a broken `media.file_ref` (e.g. an attached URL that should have been a relative path under `<dbname>-media/`) or remove a media row entirely. `update_media` now also accepts `file_ref` (previously only title/notes/format/is_printable were updatable).
- feat(mcp): `record_event` and `update_event` accept `date_value_end` so range dates (`date_type: "between"`, e.g. military service 1999–2000) round-trip through the MCP — previously the field was silently dropped on the way in.
- feat(mcp): new `update_person_name` tool — retype an existing `person_name` (e.g. flip the auto-stamped primary `birth` to `aka` when the actual birth surname differs), set `date_from`/`date_to`, attach `nickname` / `preferred_name`. Closes the gap that left the `MULTIPLE_BIRTH_NAMES` quality warning unfixable from the agent side.
- feat(mcp): new `delete_person_name` tool — drop a single `person_name` record without deleting the person.
- fix: name reorder arrows now disable (with tooltip) when chronological order forbids the swap, instead of clicking through to a red error
- fix: fan chart generation 6 ring is wider so birth and death dates fit alongside the name
- fix: dragging the side panels next to the fan chart no longer stutters — the chart re-fits once you release
- perf: Family in a Year report no longer pegs CPU or crashes the database worker on large trees
- fix: events list in side panels drops the Fact column and stops wrapping place names — narrow panels truncate cleanly instead of contracting
- fix: map view now refreshes pins automatically when places change anywhere in the app — no more switching tabs to see edits

## v0.204.0 — GEDCOM round-trip fidelity registry + coverage guard

- **feat:** Every column in every non-exempt schema table now has an explicit round-trip status under GEDCOM 5.5.1 and 7.0, declared in `src/api/gedcom_fidelity_registry.ts`. A schema-introspection unit test asserts the registry covers every column — adding a new column to `src/api/schema.ts` without registering it fails CI immediately with the column name and a pointer to the registry. The user's choice to use this app remains reversible: the data they hand us comes back out, with documented `lossy` / `excluded` exceptions instead of silent loss.
- **test:** Three new tests enforce the contract — `tests/unit/gedcom-fidelity-registry-coverage.test.ts` (schema gate), `tests/unit/gedcom-fidelity-per-field.test.ts` (per-(table, column, version) round-trip, 187 cases + 100 documented exclusions), `tests/unit/gedcom-fidelity-golden.test.ts` (multi-row, multi-table seed → round-trip → canonical equality).
- **fix(gedcom):** `formatGedcomDate` was emitting the start of `BET..AND` through ISO→GEDCOM but the end raw, breaking `events.date_value_end` round-trip. Both ends now go through the converter.
- **fix(gedcom):** Repository address sub-fields (`CITY`/`POST`/`STAE`/`CTRY`) were attaching as orphans to the preceding `1 NAME` line when address itself was empty; the importer dropped them. Now emits a `1 ADDR` parent (with empty value if needed) whenever any address sub-field is present.
- **docs:** New "⚠️ Prime Directive (cont.): Round-Trip Fidelity" section in `CLAUDE.md` codifies the directive as co-equal with authored-data preservation. Lifecycle direction is GEDCOM → DB → user → DB → GEDCOM end-to-end.

## v0.203.0 — GEDCOM round-trip fidelity for fact-shaped events

- **feat:** Occupation, education, religion, title, and other GEDCOM-X fact-shaped events now preserve the line value (e.g. `OCCU "Carpenter"`) end-to-end. Previously the importer silently dropped the value; now it lands in a dedicated `events.value` column and round-trips back through GEDCOM export byte-for-byte.
- **feat:** EventModal shows a type-aware "Value" field (Yrke / Examen / Trossamfund / etc.) for fact-shaped event types, plus an always-visible Notes textarea. The Value field is hidden for non-fact-shaped events (BIRT/DEAT/MARR/etc.) but Save preserves authored data regardless of UI mode — Prime Directive guard.
- **feat:** EventList renders the value bold over a muted notes line for richer at-a-glance reading.
- **feat:** New event types `title`, `religion`, `description`, `fact` to route TITL/RELI/DSCR/FACT GEDCOM tags cleanly (previously TITL was coerced to occupation; RELI/DSCR/FACT silently dropped).
- **feat:** MCP `record_event` / `update_event` accept `value` and `notes` fields; the legacy `description` parameter is kept as a deprecated alias that routes to `notes` for backwards compatibility with existing AI agents.
- **feat:** CSV export adds a `value` column.
- **fix:** Genney importer maps fact-shaped event values into `events.value` instead of concatenating into notes.
- **fix:** PersonTimeline and PlaceTimeline rendered events.description (which no longer exists) — now render value + notes.
- **schema:** `events.description` renamed to `events.notes`; new `events.value TEXT` column. Migration is idempotent and preserves all authored data.

## v0.202.4 — Research task row click opens the editor in place

- fix: clicking a research task in PersonPanel or PlacePanel now opens ResearchTaskModal in edit mode in the panel, matching how names and events behave. Was navigating to `/research-tasks/:id` and yanking you out of the person/place you were on.

## v0.202.3 — UX_INVENTORY surface walk complete

- chore: filled in the last 4 modal Purposes (ResearchTaskModal, MergePersonsModal, LinkRuleModal, ConfirmModal). Every bounded UI surface in the renderer now has a user-stated Purpose sentence. Recorded the row-click inconsistency on ResearchTaskModal (panels navigate to /research-tasks instead of opening the modal in-place — names/events open in-place) for a future fix.

## v0.202.2 — UX_INVENTORY purposes for modals + finding #10

- chore: filled in user-stated Purpose sentences for 7 more surfaces in docs/UX_INVENTORY.md (ExportOptionsPanel, PersonModal, PersonNameModal, PlaceModal, PlaceTreePickerModal, RelationshipModal, GroupModal). Added cross-cutting finding #10 capturing the design principle that creation modals for referenceable entities should also offer "find existing" in the same flow. Internal docs only.

## v0.202.1

- fix: PlacePanel resolved-parent placeholder now shows the correct parent when the user's leaf token isn't in the gazetteer. For places like "Uvira, Belgiska Kongo" where the gazetteer matches only at parent level (→ "Kingdom of Kongo"), the matched node IS the parent — keep the full path instead of slicing it off. Resolved-type placeholder is also nulled in this case, since the gazetteer's type describes an ancestor, not the user's place.

## v0.202.0 — Place-as-biography

- feat: PlacePanel reshaped to read like a place's biography. Hero photo above the place name (first attached image by `media_links.sort_order`; click → MediaPanel; falls back to text-only when no qualifying media). Persons section now shows year ranges (`first_year–last_year`) per resident, sorted earliest-first, and excludes witnesses/godparents/officiants — only primary-role events count someone as a resident. New Research Tasks section linked to the place via the existing polymorphic `task_links` schema (no migration). Section order rewritten to biography flow: Place → Events → Timeline → Persons → Media → Media Timeline → Research Tasks → Quality. No new database schema; everything derives from data the user already authored.

## v0.201.0 — Inline media picker across entity panels

- feat: every right-side entity panel media section (Person, Place, Relationship, Source, Group, ResearchTask) now hosts the same inline `[picker | Add | Cancel]` add-row. The `+ Attach` action no longer jumps straight to the OS file dialog — type to autocomplete against existing media (already-linked items filtered out), or click the in-field 📎 icon / dropdown footer "Attach file…" to upload a new file. Same shape across all three section flavors (PersonMediaSection, EntityMediaSection, LinkedMediaSection).
- feat: new `media:createFromFile` IPC creates a media row without linking — lets `MediaAddRow` stay link-table agnostic across `media_links` / `group_links` / `task_links`.
- fix: MediaPicker `aria-expanded` now reflects the dropdown's always-on footer item (was stale when only the footer was visible).

## v0.200.2 — UX_INVENTORY purposes filled in (PlacePanel, SourcePanel, side panels)

- chore: filled in user-stated Purpose sentences for 14 panel and section surfaces in docs/UX_INVENTORY.md (PlacePanel sections, SourcePanel sections, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel). Internal docs only.

## v0.200.0 — Relationships are managed per-person, not as a standalone view

- feat: removed the Relationships nav entry, list view, and side panel. Relationships are managed per-person from PersonPanel → Relations (which already does what users actually reach for). The data, MCP tools, GEDCOM FAM round-trip, and RelationshipModal (for editing relationships inline from PersonPanel) all stay.
- fix: search results no longer show a Relationships section — the rows had no canonical destination. Persons and sources sections still work; searching still finds people involved in relationships.
- fix: bookmarks to `/relationships` and `/relationships/:id` redirect to `/persons` instead of breaking.

## v0.199.1 — Trim Repositories section from SourcePanel

- chore: removed the Repositories section from SourcePanel — structured GEDCOM REPO records had no real authoring path here (no /repositories view, no RepositoryModal). The free-text `repository` field on the source covers the "what archive" question for hand-typed sources. Importers and exporters keep round-tripping REPO records as before.

## v0.198.2 — Trim place address fields from PlacePanel

- chore: removed the Address section from PlacePanel — street/postal code/city/country exist only to round-trip GEDCOM event-level ADDR sub-tags, no reason for a researcher to type them by hand. Importers and exporters keep populating and emitting the columns.

## v0.197.1 — Trim place-level citations from PlacePanel

- chore: removed the Citations section from PlacePanel — citing a place directly (vs an event at the place) didn't earn a section. Existing data and the underlying API are preserved.

## Unreleased

- chore: PLAN.md trimmed to active items; done milestones live only in the archive going forward.
- feat: PlacePanel gains a Timeline section that mirrors PersonPanel's Timeline — chronological events at this place with the same dot rail, gap markers on >20-year jumps, dated/undated split, and approximate-date affordance. Read-only derived view of the Events section; clicking a row opens the same event editor; `+ Event` chip routes to the same add flow (no second authoring path).
- feat: PlacePanel place section now communicates *how* a place is anchored — Type, Parent place, and Coordinates each show a "Resolved" hint with the gazetteer's value when you haven't authored one yourself.
- ux: Resolved hints sit inside the Type, Parent place, and Coordinate fields (was below); the place name field is relabelled "Place".
- fix: missing place-type translations (historical_state, state, region, division, church, language, root) added in en + sv.
- fix: panel CTA cleanup — Groups row in PersonPanel now navigates to GroupsView (was a dead click), unlink buttons across MediaPanel + EntityMediaSection use `IconUnlink` instead of raw `✕` (face-tag delete uses `IconTrash`), GroupPanel + ResearchTaskPanel unlinks now show the same confirm dialog PersonPanel has, the misleading "Add relationship" header button (silently picked spouse) is gone, and face-tag rows in MediaPanel show an explicit pencil affordance for reassignment. Convention regression-tested by `tests/components/panel-cta-conventions.test.ts`.
- feat: lat/long sit on a single row with a 📍 button — click to set coordinates by clicking on the map. A blue banner names the target place; Esc cancels.
- feat: PlacePanel Hierarchy section removed — the place picker already exposes the place tree.
- feat: persons with both a current and a birth-name record render as `Anna Andersson (f. Svensson)` (sv) / `(b. Svensson)` (en) across the panel header, persons list, search, person picker, relationships list, person timeline, linked-persons sections, and HTML site export.
- feat: 7 keepsake reports (A Life, A Marriage, Life on One Page, Photo Album, Your Ancestors, Place Chronicle, Family in Year) each get a per-report "Show birth name in parenthesis" toggle, inheriting the global default and overridable per-report.
- feat: Settings → Defaults gains a "Visning / Display" section with a global toggle for the birth-name parenthetical (defaults to on). Toggle re-renders open views immediately.
- feat: low-importance quality check `LIKELY_INLINE_BIRTH_NAME` flags name records like `"Andersson (f. Svensson)"` packed into a single field. The user splits them by hand via the existing name-edit modal — no auto-splitting (Prime Directive).
- fix: GEDCOM importer now maps `2 TYPE NAME_CHANGE` to `name_change` (was silently falling back to `birth`). Round-trip regression test covers all five `name_type` values via export → re-import.
- fix: MCP server survives Electron app restarts without forcing a manual reconnect
- chore: CSV export gains a comment explicitly forbidding baking the parenthetical form into surname cells (would round-trip as a literal string and trip the new quality check).

## v0.196.0 — Name changes on the timeline

- feat: a name (married, name change, alias, aka) with a "from" date now appears on the person's timeline at that date — the type label reads "Name change" with the new full name beneath
- feat: marriage / wedding / engagement event modal has an opt-in "Also record a name change for X" companion (off by default) that creates a separate `married` name with `date_from` = the event date
- ux: the name editor surfaces the from-date field inline for any non-birth name type (no longer hidden in the "more" details), with a hint explaining timeline visibility
- fix: clicking a name-change entry on the timeline opens the name editor (not the event editor)

## v0.195.0 — Right-panel action clarity

- feat: row actions in right-side panels now use distinct icons — trash for "delete entity permanently", unlink for "remove this connection". Tooltips spell out the blast radius. Replaces the overloaded `✕`.
- feat: clicking a relationship row in PersonPanel opens RelationshipModal in edit mode (consistent with names and events).
- feat: "Add father / mother / spouse / son / daughter" defaults to Find Existing Person when the database has more than one person, with helper text above the toggle. Prevents accidental duplicates.
- feat: External identifiers section removed from PersonPanel (round-trip-only data, surfaced via import/export). Dead `PersonIdentifierModal` and orphaned i18n / entity-color tokens cleaned up.
- fix: replaced hex colors and invented design-token names with real tokens in Names table, Research Tasks table, and Groups table. High-contrast and dark themes now adjust these correctly.
- fix: Quality section is consistently the last data section across all panels (PlacePanel was the only violator).
- fix: Names section is open by default in PersonPanel.
- fix: birth-name shows a disabled trash icon with explanatory tooltip instead of disappearing.
- chore: IconTrash + IconUnlink are now shared `ui/` primitives; PersonPanel Danger zone uses the shared trash too.
- chore: hand-rolled 1500ms debounce in PersonChecksSection documented (orthogonal to useEntityData's mutation debounce — debounces selection changes during list navigation).
- chore: UX_INVENTORY filled out for PersonPanel surfaces; cross-cutting icon convention documented; cross-cutting findings #1 (`✕` overload) and #2 (Add-relative duplicates) marked resolved.

## v0.194.2 — Person panel cleanup

- fix: name list reads chronologically — oldest at top, current/at-death name at the bottom
- fix: removed misleading "Living/Deceased" badge — death events already speak for themselves
- chore: UX inventory captures CTA shape for every panel section and modal (internal docs)

## v0.194.1 — Event-type change preserves authored data

- fix: changing event type no longer silently nulls cause-of-death or end date — authored values stay until you clear them
- fix: type-change warning now lists exactly what's at risk (orphaned spouse, missing spouse, citations written about the old type)

## v0.194.0 — Citation modal redesign + span end-date + place tree polish

- feat: citation source is now an autocomplete with in-field edit, changeable on existing citations
- feat: citation modal — notes resizable, defaults to Primary evidence, save button always visible
- feat: span event end date uses the same picker as the main date and defaults to unknown
- fix: place tree picker scrolls properly and filter searches the whole DB from the first character

## v0.193.3 — Internal only

- chore: UX intent-mapping skill + UX_INVENTORY use English consistently; UI-label Swedish stays in i18n only.

## v0.193.2 — Place tree picker attaches as side subpanel

- fix(modals): the place tree picker, when opened from a `PlacePicker` field inside another modal (e.g. EventModal), now renders as a side-attached subpanel via Teleport instead of stacking an overlay on top of the parent modal — matches the CitationModal pattern.

## v0.193.1 — Internal only

- chore: UX intent-mapping skill + surface inventory for renderer panels/modals.

## v0.193.0 — Scoped DOM tools for layout debugging

- feat(mcp-dev): `ui_get_dom` takes an optional `selector` so it returns one element's HTML instead of the full document.
- feat(mcp-dev): new `ui_query_styles` returns computed styles, bounding rect, and scroll metrics for matched elements.
- feat(mcp-dev): `ui_screenshot` accepts an optional `selector` (and `padding`) to crop the PNG to a single element.

## v0.192.1 — Right side panels scroll again

- fix: right side panels scroll when their content overflows — deep panels no longer clip below the viewport.

## v0.192.0 — Life timeline tells the story of a life

- feat(reports): A Life Report's timeline now shows the **story of the subject's life** — own events plus parent deaths, spouse death, and each child's birth/foster_placement/death that fell within the subject's lifetime. Family events render with a sex-typed relationship suffix ("Maria (mor)", "Lars (son)") so multiple Bortgång/Födelse markers in the same year stay readable.
- feat(reports): two opt-in toggles in ReportPanel — "Inkludera barns äktenskap" and "Inkludera syskons bortgång" — surface children's marriages and sibling deaths during the subject's lifetime when enabled.
- feat(panel): PersonTimeline (the timeline section in PersonPanel) now consumes the same canonical `getTimeline()` API. Previously it duplicated the EventList sitting next to it; now it tells the life story too. Clicking a family entry navigates to that person's panel; clicking a self entry still opens EventModal for editing.
- feat(api): `getTimeline(db, personId, options?)` is now the single source of truth for life timelines. Lifetime constraint is applied server-side (events outside the subject's birth–death window are dropped; child births get a +9-month posthumous extension to capture postpartum births).
- feat(mcp): `get_timeline` MCP tool exposes the new categories with a typed `relationship_label` ("self" | "father" | "mother" | "parent" | "spouse" | "son" | "daughter" | "child" | "sibling") and `include_children_marriages` / `include_sibling_deaths` parameters for AI-driven research.
- Supersedes Phase 4 of `docs/plans/2026-04-29-ben-reactivity.md` (BEN #31).

## v0.191.1 — Swedish continent names resolve

- fix(gazetteer): "Afrika", "Europa", "Asien", "Nordamerika", "Sydamerika", "Antarktis", and "Oceanien" now resolve to the corresponding continent in `world-boundaries`. The continents-in-world-boundaries plan added the geometries with English-only names; the Swedish-exonyms-expansion plan stopped at admin1 + capitals. The continents fell through the gap. `scripts/build-lang-sv-wikidata.ts` now also queries the 7 continent QIDs (Q15/Q51/Q48/Q46/Q49/Q538/Q18) and emits a `world-boundaries` translation block (Q538's English label is "Insular Oceania", so we key by QID and map QID → our gazetteer's continent name).

## v0.191.0 — Every right-side panel uses the EntityPanel shell

- refactor: MediaPanel, ReportPanel, and WebsitePanel now use the shared `EntityPanel` shell — same `.side-panel` root, same role-label band, same ▶ collapse button, same surface/radius/shadow chrome as Person/Place/Source/Relationship/Group/ResearchTask. The user-visible outcome: every paneled route's right pane is layout-identical and behavior-identical, no more "this one looks slightly different" drift. ExportOptionsPanel is documented as a deliberate exception (it's an embedded options form, not a list-view-hosted side panel).
- feat(website-export): WebsitePanel can now be collapsed and reopened from the WebsiteExportView, mirroring the ReportsView pattern (◀ reopen affordance + localStorage-persisted open state).
- test: new `tests/components/panel-layout-consistency.test.ts` mounts every right-side panel and asserts the root has `.side-panel` and rejects the `.entity-panel` collision class — catches the v0.190.0-class of bug at CI time.
- docs(rules): renderer.md now requires a class-name collision grep before introducing a new CSS class on any element in `src/renderer/`, and codifies "pattern migrations are all-or-nothing" at the component level (companion to plans.md Rule A2). EntityPanel is documented as canonical for ALL right-side panels in the Shared component catalog. The `add-feature` skill links to both rules.

## v0.190.3 — Process capture from panel-composables RCA

- chore: project-local rules + skills capturing six lessons from the panel-composables refactor. New `.claude/rules/plans.md` (every plan opens with User goal, full pattern scope, user-observable verification, RCA footer). New `.claude/skills/subagent-handoff/` with project-local prompt templates centering user goals over spec compliance + dispatcher verification rule. New `.claude/skills/dom-first-debugging/` (read truth before reasoning about CSS). The `panel-consistency-finish` plan retrofitted to comply with the new rules — proof the rules fire correctly. No upstream `superpowers:*` skills patched; everything project-local survives plugin updates.

## v0.190.2 — Right side panels fill width and height again

- fix: the new EntityPanel root class collided with `.entity-panel` in `shared.css` (the BaseSubPanel modal-chrome class), which forced `width: 320px`, `max-height: calc(100vh - 64px)`, `flex-shrink: 0`, and `overflow: hidden` on every migrated side panel — making them fixed-width, height-clipped, and unable to fill the app. The collision is removed; panels now use `.side-panel` alone.

## v0.190.1 — Tree no longer remounts on name save

- fix: editing a non-focal person's name in the side panel now updates that one box in place instead of remounting the entire tree (lost zoom/scroll). The chart's `useEntityData` already auto-refreshes on mutation; the redundant `@person-changed="reloadChart"` and `@relative-added="reloadChart"` event bindings on PersonsView's PersonPanel are removed. `reloadChart` (full remount) is reserved for focal-person change and context-menu add/delete.

## v0.190.0 — Entity panel foundation

- feat: panel composables refactor — useEntityData and usePagedList now bake in cross-view reactivity (left list + right panel + center view all auto-update on any mutation), new EntityPanel shell component, useEditableFields composable, centralized localStorage key registry; all 7 entity panels migrated

## v0.189.0 — German gazetteer (de-gemeinden)

- feat: new bundled gazetteer `de-gemeinden` — 16 Bundesländer → ~400 Kreise → 3052 populated places (≥ 5000 pop) from GeoNames CC BY 4.0
- chore: `DE_RULES` suffix-strip set added (Land, Bezirk, Kreis, Landkreis, Stadtkreis, Gemeinde, Stadt, Markt, Ortsteil) — user queries like "Landkreis Schwabach" now resolve to the same node as "Schwabach"
- note: boundary gazetteer (`de-gemeinden-boundaries`) deferred — Wikimedia Maps geoshape endpoint returns HTTP 403; will ship when an alternative boundary source is identified

## v0.188.0 — Swedish-language exonyms broadened

- feat: 212 new EU admin1 Swedish exonyms — "Flandern" (Flanders), "Bayern" (Bavaria), "Toscana" (Tuscany), "Katalonien" (Catalonia), "Skottland" (Scotland), "Brysselregionen" — now resolve to their admin1 region
- chore: 346 city-level Swedish exonyms ("Bryssel", "Wien", "Köpenhamn", "Florens", "Rom", …) pre-positioned in `lang-sv-geonames`. Dormant until a future plan adds city-level nodes to `world-admin1`; will activate automatically with no rebuild

## v0.187.0 — Swedish landskap as a gazetteer

- feat: new bundled gazetteer `sv-landskap` with all 25 historical Swedish provinces (Skåne, Bohuslän, Ångermanland, Lappland, …) — names that didn't fit the modern län/kommun tree now resolve to a real geographic anchor
- chore: `landskap` added to Swedish suffix-strip rules so "Skåne landskap" matches the same as "Skåne"

## v0.186.0 — Continents in the boundary gazetteer

- feat: world-boundaries now contains the 7 continents (Africa, Antarctica, Asia, Europe, North America, Oceania, South America) as siblings of countries — bare-continent inputs ("Afrika", "Europa") resolve to the continent polygon
- chore: new build script `build-world-continents-boundaries.ts` (Wikidata primary, Natural Earth fallback)

## v0.185.3 — Media filters actually filter

- fix: Type / Status / Face-tag chips in the media library now filter results — were being ignored server-side

## v0.185.2 — Skill rules: filter chips on every center view

- chore: internal only

## v0.185.1 — Avatars show your photos again

- fix: avatars and tree boxes show the linked profile photo, not just initials, when no face has been tagged
- fix: relationship rows and the duplicates list now use the same avatar as everywhere else

## v0.185.0 — Filter the media library

- feat: media library has filter chips for Type (image/document/audio/video), Status (missing on disk, orphaned), and Face tags

## v0.184.1 — Filter chips wrap instead of scrolling

- fix: filter chip rows wrap to a second line when full instead of hiding overflow behind a scroll

## v0.184.0 — Filter places by country

- feat: places filter is now country-based with live counts (Sverige 4657, USA 463, …) instead of the unhelpful place-type chips
- fix: filter chip pill no longer drifts visually between views — same look in Persons, Places, Settings

## v0.183.1 — Places list shows the resolved gazetteer path

- feat: each row in the places list now shows the gazetteer-matched path under the name

## v0.183.0 — Bug fixes + bigger test net under the build

- fix: `run_checks` MCP tool now returns the quality issues — was returning `{}` for every call
- fix: profile pictures no longer stay stuck on a loading spinner after a network/IPC hiccup
- chore: test suite grew to 2773 tests; coverage floor locked at 80% to block regressions

## v0.182.1 — Place lookup: tolerate trailing punctuation

- fix: a stray trailing `.` or `,` in a place name (e.g. `Vallsjö., Sverige`) now resolves cleanly

## v0.182.0 — Place tree picker: stage selection, OK to confirm

- feat: clicking a row stages the choice — press OK to commit, like other selection modals
- feat: inline `+ Add child` also stages instead of committing on the spot

## v0.181.1 — Place tree picker: single scrollbar

- fix: place tree picker no longer shows two scrollbars stacked on top of each other

## v0.181.0 — Place tree picker: orphan places under their gazetteer parent

- feat: orphan DB places (e.g. unparented "Solna") now appear nested under their gazetteer parent

## v0.180.0 — Place tree picker: searchable across the whole DB

- feat: filter searches the full database with infinite scroll instead of walking the loaded tree

## v0.179.2 — Place tree picker: load resilience + filter style

- fix: picker recovers with an error toast instead of getting stuck on "Loading…"
- fix: filter input now matches the styling of other entity-list filters

## v0.179.1 — Place tree picker: button inside the input

- fix: tree-picker button sits flush inside the place input, like the calendar button on date inputs

## v0.179.0 — Place tree picker

- feat: new tree-button on the place picker opens a hierarchical browser of your places + gazetteers
- feat: each tree row has expand/collapse and an inline `+ Add child` for new places under that node

## v0.178.1 — Lint cleanup

- chore: internal only

## v0.178.0 — Duplicates: infinite scroll + cleaner labels

- feat: Duplicates view shows all candidates with infinite scroll instead of capping at 100
- fix: row-action button reads "Merge" instead of "Merge Persons" (English)

## v0.177.0 — Duplicates: ignore a pair from the list

- feat: small ✕ on each Duplicates row marks the pair as ignored — won't reappear on the next scan

## v0.176.0 — Citations available while creating an event

- feat: can attach citations while creating a new event — was only available when editing

## v0.175.3 — Names: aligned date inputs

- fix: date fields in the Add/Edit Name modal now use the same date picker as the rest of the app

## v0.175.2 — Settings: drop redundant clear button

- fix: removed the duplicate ✕ next to the tree-subject picker — the picker has its own clear

## v0.175.1 — Media: missing-file count from the whole DB

- fix: Media footer's "N missing" reflects the whole library, not just the rows you've scrolled past

## v0.175.0 — Duplicates nav badge

- feat: Duplicates nav entry now shows a count badge (matches Quality and Tasks)

## v0.174.4 — Simpler horizontal nav header

- fix: horizontal nav layout collapses from two rows to one
- fix: dropped the redundant global search picker from the header — still reachable from People

## v0.174.3 — Agent tooling cleanup

- chore: internal only

## v0.174.2 — Agent tooling cleanup

- chore: internal only

## v0.174.1 — Agent tooling cleanup

- chore: internal only

## v0.174.0 — Agent tooling cleanup

- chore: internal only

## v0.173.0 — Agent tooling cleanup

- chore: internal only

## v0.172.9 — Repo settings cleanup

- chore: internal only

## v0.172.8 — Update security contact email

- fix: SECURITY.md vulnerability-disclosure address switched to the maintainer's personal email

## v0.172.7 — Agent tooling cleanup

- chore: internal only

## v0.172.6 — Imported databases load in seconds, not on quality-check delay

- fix: after a large import, Persons / Media / Places no longer mount empty while checks run
- perf: gazetteer-aware quality checks now share one load and yield to the worker

## v0.172.5 — Photos with junk format strings show their thumbnails

- fix: imported media with garbled `format` values (e.g. `KÄL`, `COM`) now show the thumbnail anyway

## v0.172.4 — Picker-created places stay on the map

- fix: picking an exact-match place suggestion now keeps its parent chain so the map can locate it

## v0.172.3 — More modal padding fixes

- fix: GEDCOM export, merge-persons confirm, and every delete-confirm now have proper edge padding

## v0.172.2 — Import/export report modal styling

- fix: import/export report modals now have proper edge padding and section spacing

## v0.172.1 — Researcher email placeholder

- fix: researcher-email placeholder renders as `name@example.com` instead of being parsed as a token

## v0.172.0 — Data fidelity: stop persisting inferred values

- policy: resolved coordinates, guessed date types, and fuzzy normalizations are never written to the DB
- fix: place picker no longer writes gazetteer-derived coordinates onto picker-created places
- fix: MCP tools no longer guess `date_type='exact'` when only a date value was given
- note: databases that picked up inferred coordinates in v0.169–v0.171 keep them until you re-edit the place

## v0.171.1 — Map place-type filter actually filters

- fix: the place-type chip bar above the map now filters map points and re-fits bounds (was dead UI)

## v0.171.0 — Place quality checks

- feat: flag places whose name looks like a date (`1736`, `1736-11-11`) — typed into the wrong field
- feat: flag broken länsbokstav notation like `Borås (PI` where `)` was typed as `I` or `|`
- feat: flag missing-comma names like `Solna Stockholm` that should be `Solna, Stockholm`
- feat: flag places used by events but with no parent and no gazetteer match — typos, addresses, occupations

## v0.170.0 — Place resolver overhaul

- feat: Swedish abbreviations `kn` / `sn` / `fs` (kommun, socken, församling) now resolve like the full word
- feat: parens around county letters (`Stockholm (A)`) and mangled forms (`Hässleholm L)`) now resolve
- feat: `Husby Rekarne` and `Husby-Rekarne` are equivalent during compare
- feat: country-name aliases (`Skottland`, `Tyskland`, `Kina`) resolve even with a restricted gazetteer config
- internal: per-gazetteer normalization rules — third-party gazetteers can now ship their own conventions

## v0.169.0 — Place picker: parent-aware autocomplete, county codes

- feat: picker reads strings right-to-left so `Hörningsholm, Mosås (T)` anchors on Örebro län (BEN #27)
- feat: every Swedish län carries its A–BD county-letter code as an alias (`Solna (B)` → Stockholms län)
- feat: accepting a hierarchical suggestion creates the matched parent chain in one step
- fix: clicking "Skapa ny ort" in an event modal no longer closes the surrounding modal (BEN #19b)
- fix: after creating a place, the "Skapa ny plats" suggestion no longer reappears on next focus (BEN #34)

## v0.168.1 — Preload signature fix

- fix: list views no longer crash with "is not a function" — preload signatures matched to v0.168.0 channels

## v0.168.0 — List filter and sort now span the whole database

- feat: filter and sort in Persons / Places / Sources / Media now operate on the whole DB
- feat: Sources view gets a filter input, sortable headers, and infinite scroll for the first time

## v0.167.0 — Tree refresh keeps zoom and scroll

- feat: editing events no longer resets your place in the tree — zoom and scroll position stick (BEN #37)

## v0.166.1

- fix: centre segment of the fan chart no longer links to a wrong ancestor (the proband has no page)
- fix: fan-chart hover uses the standard browser tooltip instead of a bespoke floating panel

## v0.166.0 — Reports: researcher info, page numbers, richer citations, GEDCOM SUBM fix

- feat: researcher info (name, address, phone, email) configurable from Settings → "Forskarinformation"
- feat: keepsake reports now show researcher header / footer and "X / Y" page numbers in the printed PDF
- feat: GEDCOM export's SUBM record writes the researcher's name + contact details
- feat: citation appendix in keepsake reports now shows publication, repository, URL, and per-source pages

## v0.165.0 — Names: displayed name follows latest name change date

- feat: displayed name follows the latest "valid from" date instead of a manually starred entry
- feat: names list shows a "Datum (giltig från)" column with date-descending sort + tie-break reorder
- feat: adding a Vigselnamn or Namnändring pre-fills the current name so only changes need editing
- feat: renamed "Gift namn" → "Vigselnamn"; name-type picker now sorts alphabetically

## v0.164.0 — Gazetteer placement diagnostics

- feat: map popup and PlacePanel show which gazetteer resolved a place + match quality
- chore: internal — diagnostic script and skill for auditing place-resolution outliers

## v0.163.1 — Commit skill compatibility

- chore: internal only

## v0.163.0 — Events: sort order setting + date ranges for span events

- feat: Defaults toggle for event-type picker — alphabetical (default) or life-arc order
- feat: residence, education, occupation, military, and travel events accept an optional end date
- feat(events): added "Resa" / Travel as a first-class event type
- feat(events): event lists and reports render "start – end" for span events with an end date set

## v0.162.7 — Reactivity: panels and tree refresh on mutation

- fix: section count badges in PersonPanel update immediately after adding/editing/deleting an event
- fix: family tree re-renders after editing the focal person's events, names, or relationships
- fix: PersonPanel timeline and map re-fetch automatically when same-person events change

## v0.162.6 — Ben feedback round: labels, event-type cleanup, About menu

- fix: event-modal labels tightened — Källa, Dödsorsak on death, "Övriga händelser" dropdown
- fix: media panel notes section retitled "Bildtext"
- fix: "Dop" no longer appears twice — baptism/christening collapsed to one type with auto migration
- fix: adding a new event no longer pre-selects a type when smart defaults are off
- fix: editing an event warns if you change its type — registration data may be inconsistent
- fix: production launch no longer auto-opens DevTools
- feat: Help → About OurLegacy shows the live version with a GitHub link

## v0.162.5 — Polymorphic link helpers

- refactor(api): consolidate "get linked entities" SQL queries into 2 helpers — internal only

## v0.162.4 — Website export

- fix: static site no longer ships broken-image entries for media whose source files are missing

## v0.162.3 — Stale-load race fix

- fix(panels): rapidly switching between entities no longer leaves a panel showing stale data
- fix: exported static sites opened over `file://` no longer flood the console with CORS / map errors

## v0.162.2 — Website export polish

- fix(website-export): media list footer reads "Mediaregistret" instead of mislabeled "Personregistret"
- fix(website-export): preview-iframe media truncation now explained where the truncation happens

## v0.162.1 — Preload regression fix

- fix(build): startup OOM caused by preload bundle pulling in the full api layer

## v0.162.0 — IPC channel registry

- chore: internal only

## v0.161.0 — Live preview iframe

- feat: export view renders the actual static site in an iframe with inlined photo thumbnails

## v0.160.0 — Component inspector

- feat(dev): hold-Alt component & i18n inspector for describing UI to Claude (dev mode only)

## v0.159.0 — Auto-refresh export preview

- feat: website-export right panel is a flat list of collapsible sections with live preview auto-refresh

## v0.158.7 — Last-route restore

- fix: reload restores the last route instead of always landing on Persons

## v0.158.6 — Place resolver

- fix(gazetteers): "California, USA" resolves to the state, not a tiny CDP of the same name

## v0.158.5 — Panel collapse-tab alignment

- fix(panels): every panel and list column reserves the same slot for its `▶`/`◀` collapse tab

## v0.158.4 — Media list infinite scroll

- fix(media): left list column infinite-scrolls on its own instead of bottoming out at the gallery's page size

## v0.158.3 — Media gallery aspect

- fix(media): gallery cards use a portrait 1:1.35 thumbnail that scales with column width

## v0.158.2 — Media gallery face crop

- fix(media): gallery cards bias the photo crop toward the top so faces stay visible

## v0.158.1 — Selected card scroll-into-view

- fix(media): selecting a media item scrolls both the list and the gallery so it stays visible

## v0.158.0 — Collapsible side panels everywhere

- feat(panels): every right-side panel gains a `▶` collapse tab on its left edge (was: PersonPanel only)
- feat(panels): PlacesView gets the matching `◀` reopen button it was missing
- feat(panels): Reports/Prints panels can now fully collapse

## v0.157.10 — Permanent media list

- feat: MediaView always shows a left-side list column alongside the gallery (with collapse + resize)
- fix(media): search filter moves into the list column; right MediaPanel is now collapsible

## v0.157.9 — Top-bar search picker

- fix(nav): horizontal top-bar search uses the same PersonPicker typeahead as the sidebar

## v0.157.8 — Tree subject vs. selected person

- feat: rename "focus person" to "tree subject" — clicking a person opens their panel without re-rooting
- feat: "🌳 Set as tree subject" is the only action that changes the chart's root

## v0.157.7 — Square avatars, face-cropped tree photos

- feat(avatars): every profile picture is a rounded square matching the tree-box style
- feat: tree boxes show the same face-cropped photo as avatars; untagged falls through to sex-colored initials

## v0.157.6 — Consistent face-tag styling

- refactor(media): face-tag boxes look identical in the viewer and in reports

## v0.157.5 — Panel close button alignment

- fix(panels): the × in PersonPanel and MediaPanel now lines up with the panel title

## v0.157.4 — Consistent panel close buttons

- fix(panels): every side panel shares one close-button style anchored top-right
- fix(persons): "🌳 Show in tree" moves to the dates row in PersonPanel
- fix(media): MediaPanel renames the open-viewer button to "View" and moves it to the format row

## v0.157.3 — Sidebar PersonPicker

- feat: sidebar search now opens a person's panel without re-rooting the tree
- fix(nav): remove the "Fokusperson" label above the sidebar

## v0.157.2 — Restore separate selected vs. focal person

- fix: clicking in the tree opens the panel; only "🌳 Show in tree" refocuses the chart

## v0.157.1 — Sex-typed child placeholders

- fix: "+ Barn" outline split into "+ Son" and "+ Dotter" — clicking either pre-fills sex

## v0.157.0 — Modal context in headings

- feat: modal headings state who or what you're working on (e.g. "Birth of John Doe")

## v0.156.5 — Report panel slider caps

- fix(reports): Hourglass and Descendant generations sliders go up to 20, matching the tree view's `+` button

## v0.156.4 — Draw face tag opens viewer

- fix: clicking "Draw" on Face Tags opens the media viewer so the box can be drawn immediately
- fix(media): Face Tags section moves directly after Linked Persons

## v0.156.3 — Consolidated avatars

- fix: profile pictures everywhere update automatically when face tags or media order change

## v0.156.2 — Drop the stored "living" flag

- fix: living/deceased is now derived from events — the Living/Deceased toggle is removed
- **breaking**: Genney persons marked deceased without a death event now appear as living after import

## v0.156.1 — Click-to-refocus tree

- fix: clicking a person in the tree refocuses the chart and opens the panel — all in one click

## v0.156.0 — Drop chart hover tooltip

- fix: removed the floating hover tooltip from the tree charts — names are already legible inside boxes

## v0.155.4 — Marriage events: pick second person

- feat: marriage / wedding / engagement / divorce events from a person panel offer a partner picker

## v0.155.3 — Birth events: optional baptism

- feat: birth events include optional Dopdatum + Faddrar — a baptism event is created when filled

## v0.155.2 — Add child: pick the other parent

- feat: adding a child shows an "Other parent" picker (auto-selected if there's one partner)

## v0.155.1 — Partner sex defaults to opposite

- feat: adding a partner from a tree view defaults sex to the opposite of the focused person

## v0.155.0 — PersonModal no longer creates events

- feat: "Create new person" is separated from event creation — events are added afterwards

## v0.154.5 — Reorder add-person fields

- feat(persons): new-person form is now Sex → Living → Relationship type → Name

## v0.154.4 — Preferred name underline in trees

- feat(charts): preferred-name marker is visible in all three tree views, matching lists and panels

## v0.154.3 — Parent/child labelled relationship pickers

- feat(relationships): RelationshipModal labels its pickers as Parent / Child for `parent_child` type
- fix(relationships): saving validates both pickers are filled and different — was silently saving nulls

## v0.154.2 — Auto-focus child name input

- fix(persons): clicking a son/dotter/unknown button auto-focuses the given-name input

## v0.154.1 — Add child: pick sex up front

- feat(persons): "Add child" opens a son/dotter/unknown picker before the person form
- feat(persons): "New / Existing person" toggle visible from the first frame in every "add related" flow

## v0.154.0 — Hide redundant parent placeholders

- feat: father/mother outline placeholders are hidden when a real parent of that sex already exists

## v0.153.1 — Cancel actually closes Add Related modals

- fix(modals): the cancel button and click-outside on Add father / mother / spouse / child now close the modal

## v0.153.0 — Swedish couple-subtype rename

- fix(i18n): "Äktenskap" → "Gift" in Swedish

## v0.152.4 — Theme-aware quality chips

- fix: quality chips use the same theme-aware colors as modal headers; new Media color (rose)

## v0.152.3 — Notes monospace toggle

- fix(panels): notes monospace toggle ("iWi") only swaps font-family — no more bulging above the heading

## v0.152.2 — Wider event/citation modals

- fix(modals): event and citation modals open at 480px and can be resized below the content height

## v0.152.1 — Two-phase citation modal

- feat: CitationModal opens on "Choose a source" when no source is preset, then shows it as a card

## v0.152.0 — Single-field date input

- feat: DateInput is one monospace YYYY-MM-DD field with the calendar icon inside; partial dates still work

## v0.151.3 — Accessible delete buttons

- fix: every row-level delete/unlink button announces what's about to be removed to screen readers

## v0.151.2 — Unified input styling

- fix: all inputs across modals and panels share one resting/focus look

## v0.151.1 — High-contrast count chips

- fix: sidebar chips, soft buttons, and citation links now meet AA contrast in dark and high-contrast modes

## v0.151.0 — Cleaner empty states

- fix: empty-state placeholders drop the duplicate "+ X" button — the section header is the entry point

## v0.150.4 — Print-safe chart reports

- fix: chart report previews hide zoom controls and stop picking up dark/high-contrast surface colors
- fix: long person names in the timeline report no longer clip at the SVG's left edge

## v0.150.3 — Narration coverage

- feat(a11y): Source / Group / Media pickers, modal headers, and the MediaViewer narrate to screen readers
- feat(a11y): face tag regions are keyboard-focusable

## v0.150.2 — Theme-aware entity colors

- feat: per-entity colors flip with appearance and theme; entity color regressions fail CI

## v0.150.1 — Side-panel table polish

- fix(panels): hide column headers on side-panel tables (avatar + name link is self-evident)
- fix(panels): drop fixed table layout that was squashing identifier / relationship / media / task tables

## v0.150.0 — Unified panel shell

- chore: all 8 entity side panels share one shell with consistent header padding and close buttons
- fix(panels): PersonPanel and MediaPanel gain a close button they were missing
- fix(panels): MediaPanel and ReportPanel persist section state across reloads

## v0.149.0 — Multi-entity tasks and groups

- feat: research tasks and groups can now link to multiple persons, places, and media items

## v0.148.0 — Nav rename

- feat(nav): "Research Tasks" → "Tasks" / "Uppgifter"
- feat(reports): "Framable prints" → "Charts" / "Diagram"

## v0.147.x — Static export polish

- feat: Person/Place/Media side panels are back in the static export (read-only — no edit affordances)
- fix(website-export): static site shows charts, maps, and media; CartoDB Voyager tiles work over `file://`
- fix(website-export): gazetteer-resolved coordinates baked into the snapshot so places appear on the map
- feat: privacy option to drop media only attached to events / places / sources / relationships
- fix(charts): zoom controls and click-to-select work in readonly mode (navigation, not editing)
- fix(map): backdrop uses the surface color, no surrounding border
- feat(media): viewer previews the report-style caption ("From left: …" + notes) under the picture

## v0.146.0 — App-look website export

- feat: export produces a read-only SPA that visually matches the app — same sidebar, layout, minus editing
- feat(website-export): focus-person + N ancestor / M descendant scope filter
- feat(website-export): living-person privacy controls (exclude or redact to decade)
- feat(website-export): pre-rendered keepsake reports and frameable chart prints in the bundle
- fix(website-export): no longer locks up on libraries with thousands of media files

## v0.145.0 — Universal side panels

- feat: every entity-list view (persons, relationships, sources, places, groups, tasks) gets a side panel
- feat(panels): new SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel
- feat(routing): `:id` routes navigate to the list view with the panel pre-selected
- chore: removed all DetailView components — editing happens through modals from inside panels

## v0.144.0 — Split Present nav

- feat(nav): Present section now has Reports (keepsake), Framable prints, and Website as separate items
- chore: HTML site export removed from Import / Export tabs

## v0.143.0 — Universal entity-panel modals

- feat(modals): every modal uses BaseSubPanel with `mode='standalone'|'subpanel'`
- feat(modals): new LinkRuleModal, PersonIdentifierModal; add-related-person folded into PersonModal
- feat(citations): CitationModal supports inline source picking when no source is preset

## v0.142.x — Modal redesign and panel polish

- feat: unified Person / Event / Citation / Source modals replace the older split add-and-edit forms
- fix(panels): PlacePanel no longer reloads when switching list↔map
- fix(modals): standalone BaseSubPanel simplified; dropdowns capped at 5 results

## v0.141.x — Nav and focal defaults

- feat(nav): Sources and Relationships moved to Review, Reports moved to Present
- fix: visualization focal person uses `default_person_id` instead of always falling back to first
- fix(modals): AddResearchTaskModal shows PersonPicker when opened without a pre-passed personId
- fix(charts): descendant and hourglass connectors share one horizontal segment height per generation
- fix(media): empty state gains an "Attach media" action button

## v0.141.0 — Independent fan chart settings

- feat: Your Ancestors gets a Fan Chart section with independent arc span, color, and generation limit
- feat: ancestor pages go up to 10 generations independently of the embedded fan chart

## v0.140.0 — Empty states + chart outline fixes

- feat(ui): two-tier empty state system — `SectionEmpty` for in-section, `AppEmptyState` for full-view
- fix(charts): pedigree and descendant placeholder children no longer affect real-node placement
- fix(map): always renders the map; "no places" / "no matches" become floating pill overlays
- fix(modals): titles read "Add [Entity]"
- fix(i18n): standardised Swedish "plats", "Hänvisning" for citations, "Forskningsuppgift" for tasks
- fix(quality): checks defer 1500ms after navigation to avoid contention with main data load

## v0.139.0 — Multilingual historical gazetteer

- feat: historical place names in any language ("Sovjetunionen", "Sowjetunion", etc.) now resolve correctly

## v0.138.0 — Your Ancestors photos

- feat: Photos checkbox in Your Ancestors renders per-ancestor photo pages (was silently ignored)
- feat(reports): Captions and Photo Notes checkboxes added

## v0.137.x — Report and print fixes

- fix(reports): anchor links no longer trigger Vue Router warnings
- feat(reports): fan chart segments scroll to matching ancestor section on click
- fix(reports): map previews are static (no pan/zoom)
- fix(print): chart colors now appear when printing
- feat(reports): ReportPanel replaces ChartExportControls; ReportsView is panel + preview with drag handle
- fix(reports): keepsake PDF right margin no longer cropped
- fix(reports): framable prints tab labels match visualization chart names

## v0.136.5 — Timeline chart improvements

- fix(timeline): tick labels below axis with mirrored top axis above
- fix(timeline): today label and event markers no longer clip
- fix(timeline): per-event marker tooltips
- fix(timeline): tooltip width adapts to long names; height grows with event count
- fix(timeline): birth/death year labels inline with symbol

## v0.136.x — Build, install, CI

- fix(build): downgrade `@electron/fuses` to satisfy Forge peer dep
- fix(make): comment out Linux RPM/DEB makers (incompatible with rpmbuild on Debian trixie)
- fix(ci): e2e smoke timeout 30s → 90s
- feat(mcp): `search_persons` gains optional `limit` parameter (1–200, default 20)

## v0.135.x — Devcontainer and release workflow

- fix(devcontainer): `xvfb-start.sh` exports `DISPLAY=:99` so `source` works
- fix(devcontainer): postCreateCommand chowns `~/.claude` for named-volume permissions
- fix(ci): claude.yml uses `claude_code_oauth_token` for Claude Max compatibility
- fix(ci): release workflow compares against the last git tag instead of `HEAD~1`
- feat(reports): ReportsView uses the standard paneled layout with drag-resize ReportPanel

## v0.132.0 — Cropped face-tag profile pictures

- feat: every avatar shows a person's starred face tag as a cropped square (rendered live, no extra storage)
- feat(avatars): live updates when tags are starred, reassigned, reordered, or unlinked

## v0.131.0 — Keepsake reports redesign

Reports view rebuilt around family-facing keepsake narratives.

- feat(reports): **A Life** — life map, visual timeline, family, events, notes, photos, sources appendix
- feat(reports): **A Marriage** — dual life map, shared timeline, couple, children grid, narrative, photos
- feat(reports): **Place Chronicle** — boundary map, persons, events, description, photos, child places
- feat(reports): **Your Ancestors** — fan chart cover, full-page fan, per-ancestor pages, surname index
- feat(reports): **Life on One Page** — single framable sheet
- feat(reports): **Family in Year X** — snapshot of everyone alive in a target year
- feat(reports): **Photo Album** — chronological media gallery (person / couple / place / all)
- chore: removed Individual Summary, Family Group Sheet, tabular Ancestor Sheet (replaced by the new reports)
- feat: new `researcher_name` setting for "Compiled by …" attribution
- feat: identifiers always hidden for living persons; per-report toggle redacts birth year to decade
