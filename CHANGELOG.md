# Changelog

## v0.174.3 — Remove the InstructionsLoaded hook (zero signal)

- fix(agent): removed `.claude/hooks/log-instructions-loaded.py`, `.claude/hooks/audit-rule-firing.py`, the `hooks.InstructionsLoaded` block in `.claude/settings.json`, and the `.claude/instructions-loaded.log` gitignore line. The hook fired correctly for `CLAUDE.md` `session_start` events but never fired for `.claude/rules/*.md` files even when matching paths were read. Either Claude Code's harness has a quirk in our setup or path-scoped rule loading just doesn't surface this event for us; either way, instrumentation that produces zero useful signal isn't worth the carrying cost. Path-scoped rules themselves remain in place — they're auto-discoverable; we just can't observe their firing through the hook.

## v0.174.2 — Subagents: require investigation before writing code

- fix(agent): smoke-tested all five project subagents (api-implementer, test-writer, ipc-mcp-wirer, vue-ui-builder, ux-reviewer) against general-purpose controls on realistic dry-run prompts. Two failed silently: `vue-ui-builder` did 0 tool reads and produced fabricated CSS classes / file paths; the general-purpose control read 10 files and produced correct code. `test-writer` was much better than control because it read the existing test file, but the control wrote tests using a non-existent `is_primary` field — a clean inversion of what we want. Root cause: the slim agent body relies on auto-loaded rules that only trigger when matching files are read; if the agent never reads source files, no rules fire and the agent writes code from memory.
- fix(agent): added an explicit "investigate before writing" section to all five agent bodies that names the specific sibling files to read first (e.g. for vue-ui-builder: read at least one sibling section component, the relevant composables `usePersonPanelData` / `usePanelSections` / `useEntityData`, the host panel, and both i18n files). The ux-reviewer agent got a different fix: a "compare against the canonical reference panel; count occurrences before flagging" framing to stop it pattern-matching against a checklist (it had over-flagged `.panel-collapse-btn` as a deviation when 7 panels use it as the de-facto convention).
- chore(agent): rule-firing audit script `.claude/hooks/audit-rule-firing.py` parses the `instructions-loaded.log` and reports which `.claude/rules/*.md` files have fired vs never triggered, with reusable structure for the eventual scheduled audit. Independent finding from the smoke-test session: zero `.claude/rules/*.md` firings observed even after touching matching paths, while CLAUDE.md fires `session_start` correctly — flagging the discrepancy rather than blocking on it.

## v0.174.1 — Slim subagent bodies; remove doc-syncer antipattern

- fix(agent): trimmed all six subagent bodies from 754 → 209 lines (-72%) — each is now ~30 lines of agent-unique content (scope, resource pointer, deliverables, status protocol). The harness already auto-loads CLAUDE.md plus the matching `.claude/rules/*.md` and skills when relevant files are touched, so embedding implementation patterns in the agent body just causes drift. **Fixed two actively-broken bodies along the way**: `ipc-mcp-wirer` was teaching the OLD `wrapHandler('foo:bar', ...)` pattern in a single `src/main/ipc.ts` file plus the deprecated 4-arg `server.tool()` overload — both wrong since the codebase moved to `defineChannel()` registry + `registerTool()` months ago. `vue-ui-builder` was teaching raw `<div class="modal-overlay">` modals (canonical pattern is `<BaseSubPanel>`) and a stale `declare const window` block (`window.api` is typed globally in `src/renderer/api.d.ts`). Both now defer to `.claude/rules/ipc.md` / `renderer.md` and the `/mcp-dev` / `/frontend-design` skills, which are the source of truth.
- fix(agent): removed the `doc-syncer` subagent. Its premise — "commit feature first, then sync docs in a follow-up phase" — directly contradicts the `/commit` skill's bundle rule: *"Bundle every file your change touched (sources, tests, CHANGELOG, package.json, project instructions, docs) — never selectively skip a file inside the same concern."* Each implementer agent (api-implementer, test-writer, ipc-mcp-wirer, vue-ui-builder) now lists its own docs in the "What to deliver" section so docs ride in the same commit as the code that necessitated them. Multi-commit milestone closeout (plan archival, PLAN.md roadmap update, `## vX.Y.Z` CHANGELOG header) is already covered by `/commit`'s "Plan + Roadmap sync" section in the last commit of the milestone.

## v0.174.0 — Promote `.claude/agents/*` to real Claude Code subagents

- feat(agent): added YAML frontmatter (`name`, `description`, `tools`) to all six files in `.claude/agents/` (`api-implementer`, `test-writer`, `ipc-mcp-wirer`, `vue-ui-builder`, `doc-syncer`, `ux-reviewer`) and dropped the `## Your task / {{TASK}}` placeholder block. They were previously prompt templates that needed `superpowers:subagent-driven-development` to substitute `{{TASK}}` and dispatch as `general-purpose`. With proper frontmatter the harness now auto-registers each as a Task tool `subagent_type`, so the Task tool itself can invoke them by name.
- chore(agent): refreshed `.claude/agents/README.md` and the "Speeding up with subagents" section in the `add-feature` skill to describe the new dispatch model. `ux-reviewer` is read-only (`tools: Read, Grep, Glob`); the rest get `Read, Write, Edit, Grep, Glob, Bash` (or `Read, Edit, Grep, Glob, Bash` for `doc-syncer` since it doesn't create new files).
- Quality is unverified — these were templates that were never run. Next session that uses one will tell us whether the agent bodies are still useful or need rework.

## v0.173.0 — Wire up the InstructionsLoaded hook for path-scoped rule debugging

- feat(agent): added an `InstructionsLoaded` hook in `.claude/settings.json` pointing at `.claude/hooks/log-instructions-loaded.py`. Every time Claude Code loads a CLAUDE.md or `.claude/rules/*.md` file (at session start OR lazily on a path-glob match / nested traversal), the hook appends a one-line summary to `.claude/instructions-loaded.log` (gitignored). Format: `<utc-ts> <load_reason> <memory_type> <file_path> [trigger=…] [globs=…] [parent=…]`. Lets us verify the new path-scoped rules in `.claude/rules/` actually trigger on the right file paths instead of trusting the harness silently. Hook is observability-only — cannot block loads.

## v0.172.9 — Stop tracking `.claude/settings.local.json`; share project MCP enablement

- fix(repo): `.claude/settings.local.json` holds per-machine personal config (Bash allow-list, absolute home-directory paths, the personal Gmail MCP) and shouldn't be in version control. Removed from git tracking and added to `.gitignore` alongside the other `.claude/` per-machine entries.
- fix(repo): migrated the genuinely project-level subset into the tracked `.claude/settings.json` so anyone cloning the repo gets the project's MCP servers auto-enabled — `enableAllProjectMcpServers: true`, `enabledMcpjsonServers: ["slaktforskning", "slaktforskning-dev"]`, and the matching `permissions.allow` entries for `mcp__slaktforskning__*`, `mcp__slaktforskning-dev__*`, and `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*` (the chrome-devtools plugin is already in `enabledPlugins`). Did NOT migrate the Bash allow-list (varies per developer's risk tolerance) or any absolute-path entries.

## v0.172.8 — Update security contact email

- fix(security): switch the SECURITY.md vulnerability-disclosure address from the work email to the maintainer's personal email (this is a personal project, not an Imeto one).

## v0.172.7 — Agent tooling: split CLAUDE.md into path-scoped rules

- chore(agent): introduced `.claude/rules/` with six path-scoped rule files (`api.md`, `ipc.md`, `renderer.md`, `mcp.md`, `tests.md`, `build.md`). Each has `paths` frontmatter so its content loads only when files matching the pattern are read, per Claude Code's documented best practice. Migrated layer-specific reference material out of root CLAUDE.md (Domain Types, Database Schema, IPC Bridge, Vue Component Patterns, Testing, MCP Server, Build Configuration) and out of the napkin (drag/maps/static-SPA gotchas, security-hook false positive, vue-tsc OOM, type-check filtering).
- chore(agent): trimmed root CLAUDE.md from 1166 → 115 lines (-90%) and napkin from 182 → 29 lines (-84%). Always-loaded session context dropped from 1348 → 144 lines (-89%). Removed self-references to `CLAUDE.md`, the redundant Skills/install-snippet section (project plugins are managed via `.claude/settings.json` `enabledPlugins`), and the Approach section (every line duplicated the system prompt).
- chore(agent): three skills (`a11y`, `gazetteer-testing`, `reports`) were silently failing to load because they lived as flat `.md` files instead of `<name>/SKILL.md` directories. Moved them into directory form. Added missing frontmatter to `reports` and `sqlite-finalize` so their descriptions register correctly in the session reminder. Removed `frontend-design-workspace/` eval cruft (77 files left over from skill iteration testing).
- chore(agent): deduplicated `add-feature` skill (593 → 429 lines) — Vue UI section now defers to `/frontend-design`, MCP section to `/mcp-dev`, test section to `/test`. Fixed the BaseModal/BaseSubPanel self-contradiction. Updated stale `src/main/ipc.ts` and `src/mcp/createServer.ts` paths in `add-feature`, `mcp-dev`, `electron-dev`, `performance-profiling` to match the registry-driven IPC layer and the `createProdServer.ts` / `createDevServer.ts` split.
- chore(agent): napkin reduced to four genuinely transient items (Electron-launch env caveat, two performance diagnostics, two design heuristics). Everything else either migrated into a skill/rule or removed as obsolete (chart export rules, IPC channel pattern, plan-path convention, GPG-signing workaround, etc.). Documented the `oss-*` skills as maintainer-bot-only so they're not confused for developer-facing tools.

## v0.172.6 — Stop quality checks from blocking the worker thread post-import

- fix(perf): after importing a large GEDCOM, the renderer's media/person/places list IPCs were queued behind an 11-second `runAll` of quality checks, so the views mounted to empty states until the checks finished. Three orthogonal regressions stacked on top of each other since v0.171.0:
  1. The three gazetteer-aware checks (`checkGazetteerMatchQuality`, `checkPlaceMissingComma`, `checkPlaceNameNoRegion`) each called `loadGazetteersForChecks(db)` independently, deep-cloning ~42 MB of bundled data three times per `runAll`. Hoisted to a closure-level memo in `getAllCheckFunctions()` so all three share one load.
  2. The slowest checks ran their place-resolution loops synchronously, blocking the worker for several seconds at a time. Made them `async` and added `setImmediate` yields every 200 places so queued IPCs (`media:listPage`, `persons:list`, `db:getSetting`) interleave between batches. `NamedCheck.fn` now allows `Promise<CheckResult[]>` and the worker dispatcher awaits it.
  3. The resolver's name-depth cache (`getGlobalNameDepth`) used array-identity equality, but `loadGazetteers` returns freshly-cloned gazetteers, so every call missed and re-walked all 27 gazetteer trees. Replaced with a per-root `WeakMap<GazetteerNode, …>` plus an array-level memo — heavy walk runs once per root identity regardless of how the surrounding array changes. The OTHER cache (`nameIndexCache`) keeps full-`Gazetteer` keying because it uses per-locale normalization; depth-map keys are universal-normalized so root-keying is safe.
- chore(checks): `checkPlaceNameNoRegion` got the same name-cache that `checkGazetteerMatchQuality` already had; duplicate place names no longer re-resolve.
- test(checks-perf): three regression tripwires in `tests/unit/checks-perf.test.ts` — (1) `getImportedGazetteers` is called ≤1 time per `runAllChecks`, (2) `resolvePlace` reuses the cached depth map on a second call with the same gazetteer, (3) the per-root cache survives even when the surrounding gazetteer array changes (catches the array-identity-cache regression directly). All deterministic, no wall-clock dependence. Six existing check test files migrated to `await runAllChecks(db)` / `it(..., async () => {})`.

## v0.172.5 — Tolerate junk media `format` values in the gallery

- fix(media): the gallery, person/entity media sections, media panel, media timeline, and report mini-card all relied on the `media.format` column being a known image extension to decide whether to load a thumbnail. Some imported GEDCOMs carry junk in `format` (e.g. `"SE'"`, `"COM"`, `"KÄL"` — extracted by upstream tools from the wrong dot segment of filenames like `…Familjesidan.se'(jan2022).jpg`), so those rows rendered as a placeholder file icon in the gallery while the viewer still showed them correctly because it falls back to the `file_ref` extension. Hoisted `IMAGE_FORMATS` and a new `isImageMedia(format, file_ref)` helper into `mediaUtils.ts` (format match OR file_ref extension match — strict superset of the old check), and routed all 7 consumers (`MediaView`, `MediaViewer`, `MediaPanel`, `PersonMediaSection`, `EntityMediaSection`, `MediaTimeline`, `PersonMiniCard`) through it. The DB rows are untouched per the prime directive — render-time tolerance only. Side benefit: `PersonMiniCard` and `MediaTimeline` previously had local sets missing `svg`/`tiff`/`tif`; they now match the rest of the app

## v0.172.4 — Persist gazetteer parent chain on exact-match picks

- fix(places): when the user picks an exact-match gazetteer suggestion, `PlacePicker` now persists the structural parent chain alongside the leaf (names only — not coordinates or `place_type`, per the prime directive). The previous code created only a bare leaf via `findOrCreate(leafName)`, leaving `parent_place_id = null`, so the map's render-time resolver got just the leaf name and could not disambiguate when multiple gazetteer nodes share a name. Picker-created places dropped off the map after v0.172.0 stopped persisting inferred lat/lon. The unmatched-leaf branch already used `findOrCreateWithChain`; the exact-match branch now does the same when `gaz.pathNodes` has ancestors

## v0.172.3 — More unstyled modals

- fix(export): GEDCOM export report modal got the same `.report-body` wrapper as the import modals (was flush against the panel edges)
- fix(merge): merge-persons confirmation modal had no edge padding — the side-by-side person cards and the warning banner sat against the panel border. Wrapped the body in `.ep-fields`
- fix(confirm): every delete-confirm dialog (`ConfirmModal`) was rendering bare `<p>` tags directly into the panel body. Wrapped in `.ep-fields` with consistent paragraph spacing — the modal is heavily reused, so this affects every "Delete X?" prompt across the app

## v0.172.2 — Import/export report modal styling

- fix(import): import/export report modals (GEDCOM, Holger, Genney/Derby, archive) now have the same edge padding and inter-section spacing as the rest of the modals. Content was slotted into `.ep-body` without the `.ep-fields` wrapper, so it sat flush against the panel edges and the `<p>` / `<ul>` / `.report-section` blocks had no consistent gaps. Adds a global `.report-body` wrapper class (padding + flex-column gap), tightens `.report-section ul` line spacing, and removes a duplicated scoped block in `GenneyImportSection` that used hardcoded `#eee` / `#444` / `#555` colors instead of design tokens. Holger's `.section-instructions` callout also moves off hardcoded colors

## v0.172.1 — Researcher email placeholder

- fix(i18n): escape `@` in the researcher email placeholder (`{'@'}`) so vue-i18n stops interpreting `@example.com` / `@exempel.se` as a linked-message reference and renders the placeholder verbatim

## v0.172.0 — Data fidelity prime directive: stop persisting inferred values

- **policy(CLAUDE.md):** added the data-fidelity prime directive. The user's data is sacred — algorithmically-inferred values (gazetteer-resolved coords, "best guess" date types, fuzzy normalizations, default-when-omitted synthesis) are NEVER written to the database. The display/resolver layer computes them at render time, every render. Past violations corrupted real databases; the rule is non-negotiable going forward.
- **fix(places):** the place picker (`PlacePicker.vue`) no longer persists gazetteer-derived `latitude`, `longitude`, or `place_type` onto picker-created place rows or their parent chain. Coordinates are computed by the resolver at view time. The map-popup "via X" gazetteer attribution returns automatically.
- **fix(mcp):** `create_person`, `record_event`, and `add_relationship` no longer infer `date_type='exact'` when the agent supplied `date_value` without `date_type`. Tools now pass through what the agent gave; `date_value` is only persisted when the agent also confirmed `date_type`, otherwise the raw input is preserved as `date_original` and `date_type`/`date_value` default to NULL/'unknown'. Tool descriptions document the contract.
- **policy(skills):** the `gazetteers`, `add-feature`, `data-modeling`, and `mcp-dev` skills now lead with the data-fidelity directive. Future agents extending the codebase get the rule before they touch the schema, the picker, or the MCP layer.
- **note:** existing databases that picked up persisted gazetteer-resolved coordinates from v0.169.0–v0.171.1 retain those values until the user re-edits the affected places. No automatic migration is provided — clean databases are the way forward; stale persisted coordinates fade as users update places.

## v0.171.1 — Map place-type filter

- fix(places): the place-type chip bar above the map now actually filters map points (and re-fits bounds). Previously `activeTypeFilter` was set on click but never read by `MapView` — the chips were dead UI

## v0.171.0 — Place quality checks

- feat(checks): four new quality checks surface the genuine data issues that survive the v0.170.0 place-resolver overhaul (the 2.6 % truly unmatched cases — typos, dates, addresses, mangled länsbokstav notation):
  - `PLACE_NAME_LOOKS_LIKE_DATE` (error) — flags places whose name matches `1736`, `1736-11-11`, `1736/11/11`, etc., catching dates accidentally typed into the place field
  - `PLACE_NAME_BROKEN_LANSBOKSTAV` (warning) — flags county-letter notation where the closing paren got typed as `I` or `|` (e.g. `Borås (PI`, `Hed (UI`, `Byske (ACI`); validates the captured letters against the canonical länsbokstav set so `(XYI` is ignored; suggests a fixed string `Borås (P)`
  - `PLACE_MISSING_COMMA` (warning) — flags single comma-components that decompose into 2+ adjacent gazetteer-known names where at least one is at depth ≤2 (country / admin1); proposes a comma-separated split. Tightened depth floor avoids false positives on legitimate multi-word leaf names like `Saint Mary's Parish`
  - `PLACE_NAME_NO_REGION` (notice) — flags places referenced by ≥1 event with no parent place that fully fail to resolve; surfaces typos (`Stockhom`), street addresses (`Fredsgatan 16`), and occupation strings without geographic context
- internal: `LAN_LETTER_CODES` now exported from `place-gazetteers/bundled.ts` so checks share a single source of truth for valid Swedish county letters
- internal: 29 new unit tests; full suite 2275 passes

## v0.170.0 — Place resolver overhaul: universal rules + per-gazetteer normalization

- refactor(place-resolver): the resolver no longer hardcodes admin-suffix vocabulary for six languages (församling/socken/sogn/county/etc.) inside `normalize()`. Country-specific rules now live with each gazetteer via a new `Gazetteer.normalize` field carrying `stripSuffixes`/`stripPrefixes`/`stripPatterns`. Shared rule sets (SV/DK/NO/FI/IS/EN_RULES) are exported from `src/gazetteer-build/normalize-rules.ts` and attached to bundled gazetteers at load time — no JSON regeneration needed. Imported third-party gazetteers can ship their own rules
- feat(place-resolver): Swedish gazetteers now also strip the abbreviations `kn` (kommun), `sn` (socken), and `fs` (församling) — common in genealogy databases. `Åkersberga, Österåkers kn` now resolves cleanly to Österåkers kommun > Åkersberga
- feat(place-resolver): parens are stripped during normalization, so `Stockholm (A)` flows into the matcher as `Stockholm A` and resolves via the existing länsbokstav A → Stockholms län alias. Combined with token-scan inside an unmatched component, mangled länsbokstav like `Hässleholm L)` (missing opening paren) also resolve
- feat(place-resolver): hyphen and space are equivalent during compare — `Husby Rekarne` and `Husby-Rekarne` resolve to the same node
- feat(place-resolver): input-split also splits on `.` directly followed by uppercase, so `Saint-Claude College, Minn.USA` parses cleanly without the trailing country glued to a state abbreviation
- fix(checks): quality-check loader now always includes language gazetteers regardless of the user's `gazetteer_config` — country-name aliases like `Skottland`, `Tyskland`, `Italien`, `Kina` reach the resolver even when the database has a restricted gazetteer config (e.g. `["sv-parishes"]` auto-set on Genney import)
- internal: against a real ~6 300-place database, exact-match coverage rose from 16.9 % to 38.7 % and unmatched dropped from 36.1 % to 2.6 %. The remaining 2.6 % are genuine data-quality cases (typos, occupations entered as places, dates entered as places) — targeted by future quality checks
- internal: 8 new resolver tests added; full test suite (2246) passes

## v0.169.0 — Place picker: parent-aware autocomplete, county letter codes, no dataloss

- feat(places): place picker now reads strings right-to-left like Swedish records — `Hörningsholm, Mosås (T)` anchors on Örebro län (T) and matches Mosås only inside it, no longer dragging the pin to a same-named hamlet in Norrland (BEN #27)
- feat(gazetteers): every Swedish län now carries its standard one- or two-letter county code as an alias — `Solna (B)` resolves to Stockholms län, `Mosås (T)` to Örebro län, etc. (full A–BD coverage including pre-1997 codes O/P/R/L/M/W)
- feat(places): accepting a hierarchical suggestion creates the matched parent chain in the database in one step — the new farm/locality is parented under the right parish/municipality/län without manual fix-up; intermediate places are created once and reused on subsequent picks
- fix(places): typing a place name and clicking "Skapa ny ort" inside an event modal no longer closes the surrounding event modal or loses the typed-in event data — dropdown items now stop click propagation explicitly (BEN #19b)
- fix(places): after creating a new place via the picker, the same "Skapa ny plats" suggestion no longer reappears on next focus — the picker now suppresses the create option whenever a place is already selected, and re-runs the search after creation so the new place shows up as a real match (BEN #34)
- feat(api): new `findOrCreatePlaceWithChain(name, chain)` API + IPC channel for renderer code that needs to materialise an ancestor chain of places in one call

## v0.168.1

- fix(preload): expose new `places.listPage`, `sources.listPage` and update `persons.listPage` / `media.listPage` signatures on `window.api` — v0.168.0 added the IPC handlers but the preload is hand-maintained (not registry-driven), so the renderer hit `is not a function` at runtime
- internal: new `tests/unit/preload-coverage.test.ts` parses the preload source and fails CI if any registered channel is missing — prevents this gap from recurring
- docs: corrected CLAUDE.md description of the preload (was incorrectly described as registry-driven)

## v0.168.0 — List filter and sort now span the whole database

- feat(lists): the filter input and sortable headers in PersonsListTab, PlacesView, SourcesView, and MediaView now operate against the full database instead of just the rows already paginated into memory — the four left-hand list panels were all running a client-side filter over the loaded page, which silently hid matches and miscounted the "Showing X of Y" footer
- feat(api): each domain gained a paginated `listPage(limit, offset, sortBy, sortDir, query?)` returning `{ items, total }` — total reflects the filtered count when a query is active
- feat(sources): SourcesView gained a filter input, sortable headers (title/author/type), and infinite scroll for the first time
- internal: new `usePagedList<T, SortBy>` composable with debounced filter (200 ms), stale-response guard via sequence id (faster query can't be clobbered by an in-flight slower one), reset-on-filter/sort, and built-in IntersectionObserver wiring — used by all four views so the UX stays consistent

## v0.167.0 — Tree refresh keeps zoom and scroll

- feat(charts): editing a person's events no longer wipes your place in the tree — Pedigree, Hourglass, and Descendant charts now refetch in place when data changes, preserving zoom, scroll position, and expanded/collapsed branches (BEN #37, Phase 3 of the reactivity audit)
- internal: each chart exposes a `refetch()` method; `PersonsView` calls it from the `onDataChanged` listener instead of bumping `chartKey`. Hard remounts (focal person change, focal-person deletion) still go through `reloadChart()`

## v0.166.1

- fix(fan chart): centre segment in the "Your Ancestors" report no longer links to a wrong ancestor — the proband (ahnentafel #1) has no dedicated ancestor page, so the centre is now rendered without a hyperlink
- fix(fan chart): hover on a segment now uses the standard browser tooltip (the same pattern as the rest of the app) instead of a bespoke floating panel

## v0.166.0 — Reports: researcher info, page numbers, richer citations, GEDCOM SUBM fix

- feat(settings): four researcher fields (name, address, phone, email) live in `db_settings` and are configurable from Settings → "Forskarinformation"
- feat(reports): every keepsake report now renders a header with the researcher name + system name, a footer with email/phone, and "X / Y" page numbers in the printed PDF — toggle "Sidhuvud och sidfot" in ReportPanel (default on, persisted as `report_show_header_footer`)
- feat(gedcom): GEDCOM export's `SUBM` record now writes the researcher's NAME / ADDR / PHON / EMAIL (the genealogist filing the file). Falls back to the proband's name when researcher info is unset, preserving Holger round-trip compatibility
- feat(reports): citation appendix in A Life, A Marriage, Place Chronicle, and Your Ancestors now includes `publication_info`, `repository`, and `URL` — and A Life additionally lists per-source pages — so toggling "Show sources" produces a visibly richer research trail

## v0.165.0 — Names: displayed name follows latest name change date

- feat(names): the displayed name for a person is now picked by the latest non-null `date_from` instead of a manually starred entry; the birth name's effective date comes from the birth event when available
- feat(names): names list now shows a "Datum (giltig från)" column, sorts by that date descending, and offers ▲/▼ reorder buttons for ties between undated entries — moving a younger-dated row above an older one is blocked with a toast
- feat(names): adding a `Vigselnamn` or `Namnändring` pre-fills the form with the current displayed given name + surname so only the parts that change need editing
- feat(names): renamed "Gift namn" → "Vigselnamn"; the name-type picker now sorts alphabetically by translation

## v0.164.0 — Gazetteer placement diagnostics

- feat(places): map popup and PlacePanel info section now surface which gazetteer resolved a place plus the match quality (exact / partial / ambiguous), so outliers like `Richmond, Kalifornien USA → ca-divisions-boundaries` are visible at a glance
- feat(scripts): add `scripts/check-us-places.ts` — readonly diagnostic that resolves every US-tagged place in a database and buckets outliers (NOT_US, STATE_MISMATCH, AMBIGUOUS, UNRESOLVED) with the matched path and gazetteer ID
- feat(skill): new `/gazetteer-testing` skill — workflow for auditing place resolution on real data, common outlier buckets, and a symptom→file map for fixes

## v0.163.1

- fix(skill): commit skill now uses multiple `-m` flags instead of heredoc, so the same skill works in both interactive Claude Code and headless `claude -p` (the agentic-dev-pipeline runs the agent in headless mode where heredoc terminators corrupt under the bash wrapper)

## v0.163.0 — Events: sort order setting + date ranges for span events

- feat(settings): new Defaults toggle "Sorteringsordning för händelsetyper" — choose between alphabetical (default) and life-arc order for the event-type picker
- feat(events): residence, education, occupation, military, and travel events now accept an optional end date even when date type is not "between"
- feat(events): added "Resa" / Travel as a first-class event type
- feat(events): event lists and reports render "start – end" for span events with an end date set

## v0.162.7 — Reactivity: panels and tree refresh on mutation

- fix(person-panel): "Händelser (n)" and the other section count badges update immediately after adding/editing/deleting an event — no longer require a panel switch
- fix(persons-view): the family tree (Pedigree/Hourglass/Descendant) re-renders after editing the focal person's events, names, or relationships
- fix(person-panel): timeline and map re-fetch automatically when same-person events change

## v0.162.6 — Ben feedback round: labels, event-type cleanup, About menu

- fix(events): the "Källa (valfritt)" label is now just "Källa", "Orsak" reads "Dödsorsak" on death events, "Pension/Medborgarskap/Yrke" → "Pensionering / Nytt medborgarskap / Yrke/Anställning", and the "..." quick-pick button is labelled "Övriga händelser"
- fix(media): the notes section in the media panel is now titled "Bildtext"
- fix(events): "Dop" no longer appears twice — `baptism` and `christening` collapse to a single `christening` type, with a one-shot migration for existing rows and updated GEDCOM/Genney importers
- fix(events): adding a new event no longer pre-selects a type when smart defaults are off
- fix(events): editing an existing event shows a soft warning if you change its type — registration data may be inconsistent
- fix(events): the "Övriga händelser" dropdown shows only types not in the quick row, and starts blank
- fix(main): production launch no longer auto-opens the DevTools panel
- feat(menu): Help → About OurLegacy shows the live version with a GitHub link

## v0.162.5 — Polymorphic link helpers

- refactor(api): consolidate "get linked entities" SQL queries into 2 helpers — internal only

## v0.162.4 — Website export

- fix(website-export): static site no longer ships broken-image entries for media whose source files are missing

## v0.162.3 — Stale-load race fix

- fix(panels): rapidly switching between entities no longer leaves a panel showing stale data
- fix(static-export): exported sites opened over `file://` no longer flood DevTools with CORS, Leaflet, and router errors

## v0.162.2 — Website export polish

- fix(website-export): media list footer reads "Mediaregistret" instead of mislabeled "Personregistret"
- fix(website-export): preview-iframe media truncation now explained where the truncation happens

## v0.162.1 — Preload regression fix

- fix(build): startup OOM caused by preload bundle pulling in the full api layer

## v0.162.0 — IPC channel registry

- refactor(ipc): one `defineChannel` entry replaces synchronized edits across main / worker / preload — internal only

## v0.161.0 — Live preview iframe

- feat(website-export): export view now renders the actual static site in an iframe, with inlined photo thumbnails and the editor's tree subject as the landing page

## v0.160.0 — Component inspector

- feat(dev): hold-Alt component & i18n inspector for describing UI to Claude (dev mode only)

## v0.159.0 — Auto-refresh export preview

- feat(website-export): right panel is a flat list of collapsible sections; live preview auto-refreshes on field changes

## v0.158.7 — Last-route restore

- fix(router): reload no longer always lands on Persons; the last route is restored before the redirect can clobber it

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

- feat(media): MediaView always shows a left-side list column with collapse tab and resize handle, alongside the gallery
- fix(media): search filter moves into the list column; right MediaPanel is now collapsible

## v0.157.9 — Top-bar search picker

- fix(nav): horizontal top-bar search uses the same PersonPicker typeahead as the sidebar

## v0.157.8 — Tree subject vs. selected person

- feat(persons): rename "focus person" to "tree subject" and split the role from panel selection — clicking a person opens their panel without re-rooting the tree
- feat(persons): "🌳 Set as tree subject" is the only action that changes the chart's root

## v0.157.7 — Square avatars, face-cropped tree photos

- feat(avatars): every profile picture is a rounded square matching the tree-box style
- feat(charts): tree boxes show the same face-cropped photo the avatars use; untagged media falls through to sex-coloured initials

## v0.157.6 — Consistent face-tag styling

- refactor(media): face-tag boxes look identical in the viewer and in reports

## v0.157.5 — Panel close button alignment

- fix(panels): the × in PersonPanel and MediaPanel now lines up with the panel title

## v0.157.4 — Consistent panel close buttons

- fix(panels): every side panel shares one close-button style anchored top-right
- fix(persons): "🌳 Show in tree" moves to the dates row in PersonPanel
- fix(media): MediaPanel renames the open-viewer button to "View" and moves it to the format row

## v0.157.3 — Sidebar PersonPicker

- feat(nav): sidebar search replaced with a PersonPicker that opens a person's panel without re-rooting the tree
- fix(nav): remove the "Fokusperson" label above the sidebar

## v0.157.2 — Restore separate selected vs. focal person

- fix(persons): clicking in the tree opens the panel without re-rooting; only "🌳 Show in tree" refocuses the chart

## v0.157.1 — Sex-typed child placeholders

- fix(charts): "+ Barn" outline split into "+ Son" and "+ Dotter" in all three tree charts; clicking either pre-fills sex

## v0.157.0 — Modal context in headings

- feat(modals): entity-modal headings state who or what you're working on (e.g. "Birth of John Doe", "Marriage of John & Jane", "New place in Stockholm")

## v0.156.5 — Report panel slider caps

- fix(reports): Hourglass and Descendant generations sliders go up to 20, matching the tree view's `+` button

## v0.156.4 — Draw face tag opens viewer

- fix(media): clicking "Draw" on the Face Tags section opens the media viewer so the box can be drawn immediately
- fix(media): Face Tags section moves directly after Linked Persons

## v0.156.3 — Consolidated avatars

- refactor(avatars): every profile picture in the app uses the same face-cropped image source and updates automatically when face tags or media order change

## v0.156.2 — Drop the stored "living" flag

- fix(persons): living/deceased is now derived (no death event AND birth within last 120 years) — the Living/Deceased toggle is removed from PersonModal
- **breaking**: Genney persons marked deceased without a death event now appear as living after import — add a death event to mark them deceased

## v0.156.1 — Click-to-refocus tree

- fix(charts): clicking a person in the tree refocuses the chart, syncs the sidebar, and shows the panel — all in one click

## v0.156.0 — Drop chart hover tooltip

- fix(charts): remove the floating hover tooltip from Pedigree / Hourglass / Descendant — names are already legible inside boxes

## v0.155.4 — Marriage events: pick second person

- feat(events): marriage / wedding / engagement / divorce events from a person panel offer a partner picker (existing partners suggested, free PersonPicker for anyone else, "+ Add new person" inline)

## v0.155.3 — Birth events: optional baptism

- feat(events): birth events include optional Dopdatum + Faddrar fields — a separate baptism event is created when filled

## v0.155.2 — Add child: pick the other parent

- feat(persons): adding a child shows an "Other parent" picker; with one partner they're auto-selected, with multiple all are listed plus "None"

## v0.155.1 — Partner sex defaults to opposite

- feat(persons): when adding a partner from a tree view, sex defaults to the opposite of the focused person's sex (M→F, F→M, U→U)

## v0.155.0 — PersonModal no longer creates events

- feat(persons): "Create new person" is fully separated from event creation — events are added afterwards via EventModal

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

- feat(charts): father/mother outline placeholders hidden when the person already has a real parent of that sex

## v0.153.1 — Cancel actually closes Add Related modals

- fix(modals): the cancel button and click-outside on Add father / mother / spouse / child now close the modal

## v0.153.0 — Swedish couple-subtype rename

- fix(i18n): "Äktenskap" → "Gift" in Swedish

## v0.152.4 — Theme-aware quality chips

- fix(quality): entity-type chips use the same theme-aware colors as modal headers; new Media entity color (rose)

## v0.152.3 — Notes monospace toggle

- fix(panels): notes monospace toggle ("iWi") only swaps font-family — no more bulging above the heading

## v0.152.2 — Wider event/citation modals

- fix(modals): event and citation modals open at 480px and can be resized below the content height

## v0.152.1 — Two-phase citation modal

- feat(citations): CitationModal opens on "Choose a source" when no source is preset; once picked, the source renders as an entity-styled card

## v0.152.0 — Single-field date input

- feat(forms): DateInput renders YYYY-MM-DD in one monospace field with the calendar icon embedded on the right edge — partial dates (`1842`, `1842-03`) still work

## v0.151.3 — Accessible delete buttons

- fix(a11y): every row-level delete/unlink button now has an `aria-label` so screen readers announce what is about to be removed

## v0.151.2 — Unified input styling

- fix(forms): all inputs across modals and panels share one resting/focus look

## v0.151.1 — High-contrast count chips

- fix(a11y): sidebar count chips, soft-button variant, and citation reference links now meet AA in dark and high-contrast modes

## v0.151.0 — Cleaner empty states

- fix(panels): empty-state placeholders drop the duplicate "+ X" button — the section header is the single entry point

## v0.150.4 — Print-safe chart reports

- fix(reports): chart report previews hide zoom controls, drop the timeline-marker text halo, and stop picking up dark / high-contrast surface colors
- fix(reports): long person names in the timeline report no longer clip at the SVG's left edge

## v0.150.3 — Narration coverage

- feat(a11y): Source / Group / Media pickers, modal headers, and the MediaViewer narrate to screen readers
- feat(a11y): face tag regions are keyboard-focusable

## v0.150.2 — Theme-aware entity colors

- feat(theming): per-entity colors flip with appearance and theme automatically; entity color regressions fail CI

## v0.150.1 — Side-panel table polish

- fix(panels): hide column headers on side-panel tables (avatar + name link is self-evident)
- fix(panels): drop fixed table layout that was squashing identifier / relationship / media / task tables

## v0.150.0 — Unified panel shell

- refactor(panels): all 8 entity side panels share one shell with consistent header padding and full-height close buttons
- fix(panels): PersonPanel and MediaPanel gain a close button they were missing
- fix(panels): MediaPanel and ReportPanel persist section state across reloads

## v0.149.0 — Multi-entity tasks and groups

- feat(tasks/groups): research tasks and groups can now link to multiple persons, places, and media items (was: tasks → 1 person, groups → persons only)

## v0.148.0 — Nav rename

- feat(nav): "Research Tasks" → "Tasks" / "Uppgifter"
- feat(reports): "Framable prints" → "Charts" / "Diagram"

## v0.147.x — Static export polish

- feat(website-export): PersonPanel, PlacePanel, and MediaPanel are back in the static export, with add/edit/delete affordances gated on readonly
- fix(website-export): static site shows charts, maps, and media; CartoDB Voyager tiles work over `file://`
- fix(website-export): gazetteer-resolved coordinates baked into the snapshot so places appear on the map
- feat(website-export): privacy option to drop media that's only attached to events / places / sources / relationships
- fix(charts): zoom controls and click-to-select work in readonly mode (navigation, not editing)
- fix(map): backdrop uses the surface color, no surrounding border
- feat(media): viewer previews the report-style caption ("From left: …" + notes) under the picture

## v0.146.0 — App-look website export

- feat(website-export): export now produces a read-only Vue SPA that visually matches the application — same sidebar, design tokens, detail layouts, minus editing
- feat(website-export): focus-person + N ancestor / M descendant scope filter
- feat(website-export): living-person privacy controls (exclude or redact to decade)
- feat(website-export): pre-rendered keepsake reports and frameable chart prints in the bundle
- fix(website-export): no longer locks up on libraries with thousands of media files

## v0.145.0 — Universal side panels

- feat(panels): every entity-list view (persons, relationships, sources, places, groups, research tasks) hosts its own resizable side panel
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

- feat(modals): unified PersonModal / EventModal / CitationModal / SourceModal replace AddPersonModal / EventForm / CitationForm
- fix(panels): PlacePanel no longer reloads when switching list↔map
- fix(modals): standalone BaseSubPanel simplified; dropdowns capped at 5 results

## v0.141.x — Nav and focal defaults

- feat(nav): Sources and Relationships moved to Review, Reports moved to Present
- fix(persons): visualization focal person reads `default_person_id` setting before falling back to first person
- fix(modals): AddResearchTaskModal shows PersonPicker when opened without a pre-passed personId
- fix(charts): descendant and hourglass connectors share one horizontal segment height per generation
- fix(media): empty state gains an "Attach media" action button

## v0.141.0 — Independent fan chart settings

- feat(reports): Your Ancestors panel gets a dedicated "Fan Chart" section with independent arc span, color mode, and generation limit
- feat(reports): ancestor pages can go up to 10 generations independently of the embedded fan chart

## v0.140.0 — Empty states + chart outline fixes

- feat(ui): two-tier empty state system — `SectionEmpty` for in-section, `AppEmptyState` for full-view
- fix(charts): pedigree and descendant placeholder children no longer affect real-node placement
- fix(map): always renders the map; "no places" / "no matches" become floating pill overlays
- fix(modals): titles read "Add [Entity]"
- fix(i18n): standardised Swedish "plats", "Hänvisning" for citations, "Forskningsuppgift" for tasks
- fix(quality): checks defer 1500ms after navigation to avoid contention with main data load

## v0.139.0 — Multilingual historical gazetteer

- feat(gazetteers): "Sovjetunionen", "Sowjetunion", "União Soviética" etc. now resolve correctly via all-language Wikidata translations for ~1,391 historical entities

## v0.138.0 — Your Ancestors photos

- feat(reports): Photos checkbox in Your Ancestors actually renders per-ancestor photo pages (was silently ignored)
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

- feat(avatars): every avatar shows a person's starred face tag as a cropped square — no new media blobs, computed at render time and cached per person
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
- chore(reports): removed Individual Summary and Family Group Sheet (use A Life / A Marriage); tabular Ancestor Sheet replaced by Pedigree Print
- feat(reports): new `researcher_name` setting for "Compiled by …" attribution
- feat(privacy): identifiers always hidden for living persons; per-report "Redact living persons" toggle replaces birth year with decade
