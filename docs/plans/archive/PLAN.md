# Archived Plan Context: Släktforskning

This file preserves the original vision, design goals, tech decisions, and full implementation history that was condensed out of `docs/PLAN.md` during the 2026-04-04 cleanup. Kept for reference; not a living document.

---

## Vision

A local-first, cross-platform desktop genealogy application that gives researchers full control of their data while being natively agent-friendly — allowing AI assistants to read, write, and reason about family tree data without a GUI.

## Design Goals

1. **Local-first** — All data stored on the user's machine in SQLite. No cloud accounts, no subscriptions, no data leaving the device unless the user exports it.
2. **Multi-window** — Desktop-class UX with multiple simultaneous windows into the same database (e.g., person detail + family view side-by-side).
3. **Cross-platform** — Runs on macOS, Windows, and Linux from a single codebase.
4. **Agent-friendly** — A built-in MCP server lets AI agents perform full CRUD operations on the database without the UI, enabling agentic workflows like automated data entry, research assistance, and GEDCOM import.
5. **Source-first** — Every claim in the database should be traceable to a source. The app warns on unsourced entities and provides citation affordances everywhere — but does not block entry when a source isn't yet at hand.
6. **Research-grade** — Data model follows the Genealogical Proof Standard: Source → Citation → Assertion. Preserves uncertainty, conflicting evidence, and original source text.

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Electron 41 | Rich ecosystem, agent-friendly (Playwright/DevTools), cross-platform, mature |
| Frontend | Vue 3 + Pinia | Lightweight, good TS support, less opinionated than React for a desktop app |
| Build system | Electron Forge + Vite | Official Electron tooling, fast HMR, good native module support |
| Database | SQLite via node-sqlite3-wasm | Zero-config, single-file, WASM-based — no native rebuild needed for Electron vs system Node |
| Agent interface | MCP (stdio transport) | Standard protocol for AI tool use; Claude, GPT, etc. can call it directly |
| Language | TypeScript throughout | Single language for main process, renderer, API layer, and MCP server |
| i18n | vue-i18n | Swedish default locale, English fallback, persisted to localStorage |

### Alternatives Considered

- **Tauri** — Smaller binary, Rust backend. Rejected: less mature agent tooling (no Playwright for WebView2), smaller ecosystem.
- **React** — More popular but heavier; Vue's Composition API fits the desktop UI better.
- **better-sqlite3** — Native C++ addon with excellent performance, but requires recompilation when switching between system Node and Electron's Node fork. Replaced with node-sqlite3-wasm to eliminate the constant rebuild problem.
- **Prisma / Drizzle ORM** — Rejected in favor of raw SQL for simplicity and full control over genealogy-specific queries.
- **PostgreSQL** — Rejected: local-first goal means no server process. SQLite is the right fit.
- **GEDCOM-X interchange** — GEDCOM-X is the conceptual inspiration for the relationship model, but it is not widely supported by any Swedish genealogy platform. GEDCOM 5.5.1 is the interchange standard; the internal model roundtrips to/from it.

## Architecture

```
src/api/     → Pure business logic (zero Electron deps)
src/main/    → Electron main process (windows, DB, IPC)
src/preload/ → Context bridge (renderer ↔ main)
src/renderer/→ Vue 3 UI (Swedish default locale)
src/mcp/     → MCP server (standalone, same API layer)
```

**Key principle:** `src/api/` is the single source of truth. Both the Electron IPC handlers and the MCP server call the same functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

---

## Full Implementation History

### Done (v0.1.0 — Foundation)
SQLite + API layer + Electron shell + MCP server (14 tools) + unit/E2E tests. Migrated from better-sqlite3 to node-sqlite3-wasm.

### Done (v0.2.0 — Genealogy Data Entry UI)
Full form-based data entry: PersonPicker, DateInput, EventForm, EventList, CitationForm components. Detail views for persons, families, sources. 22 GEDCOM event types, date types, confidence levels.

### Done (v0.2.1 — Global Search)
`/search` route with SearchView across Persons, Families, Sources. Sidebar search input.

### Done (v0.2.2 — MCP UI Tools)
HTTP bridge (port 19241) + `ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js` MCP tools.

### Done (v0.2.3 — Swedish i18n + MCP Parity)
vue-i18n with ~180 strings (SV default, EN fallback). Expanded MCP from 14 → 34 tools matching full IPC surface.

### Done (v0.3.0 — Relationships + Evidence + Add Related Person)
GEDCOM-X relationship model, citation affordances, Add Related Person modal. See `docs/plans/archive/2026-04-02-v030-evidence-and-add-related.md`.

### Done (v0.3.1 — GEDCOM-X Name Parts + Person Identifiers)
Name prefix/suffix/patronymic/qualifier columns; `person_identifiers` table with typed external IDs. See `docs/plans/archive/2026-04-02-gedcomx-name-parts-and-identifiers.md`.

### Done (v0.3.2 — PersonDetailView UX Improvements)
Inline sex editing; clickable name rows; relationship delete button; AddRelatedPersonModal New/Existing toggle. See `docs/plans/archive/2026-04-02-person-detail-ux.md`.

### Done (v0.4.0 — Places)
Full places layer: API, IPC, 6 MCP tools, PlacePicker, PlacesView + PlaceDetailView. See `docs/plans/archive/2026-04-02-places.md`.

### Done (v0.4.1 — Minor Fixes & UX Consistency)
Inline-edit polish across PersonDetailView, RelationshipDetailView, PlaceDetailView. See `docs/plans/archive/2026-04-03-detail-view-ux-consistency.md`.

### Done (v0.5.0 — Visualization)
Pedigree/Hourglass/Timeline SVG charts; click-to-navigate; `chartLayout.ts` + `chartData.ts` utilities. See `docs/plans/archive/2026-04-03-visualization-impl.md`.

### Done (v0.5.1 — UI Consistency Polish)
EventList rows clickable (no Edit button); PlacePicker + PersonPicker get `width: 100%`; PlaceDetailView parent place constrained to grid column. See `docs/plans/archive/2026-04-03-ui-consistency.md`.

### Done (v0.5.2 — Sourcing & Citation Consistency)
`CitationBadge` component; `getCitationsForPerson/Relationship/Place` API + IPC + MCP; Cite button + badge in detail view headers; badges in PersonsView list. See `docs/plans/archive/2026-04-03-sourcing-and-citations.md`.

### Done (v0.5.3 — Place Address Fields)
`street`, `postal_code`, `city`, `country` columns on `places`; MCP `add_place`/`update_place` updated; PlaceDetailView Address section; PlacePicker shows postal_code/city subtitle. See `docs/plans/archive/2026-04-03-place-address.md`.

### Done (v0.5.4 — Tilltalsnamn)
`preferred_name` on `person_names`; `getDisplayGivenName()` helper; underline rendering in PersonDetailView, PersonsView, PersonPicker. See `docs/plans/archive/2026-04-03-preferred-name.md`.

### Done (v0.5.5 — Search Across All Name Records)
`searchPersons` searches all `person_names` rows via EXISTS subquery. See `docs/plans/archive/2026-04-03-name-search.md`.

### Done (v0.5.6 — PersonName Component & Consistent Underline)
`PersonName.vue` + `nameUtils.ts` unify tilltalsnamn underline rendering across all views and SVG charts. See `docs/plans/archive/2026-04-03-person-name-component.md`.

### Done (v0.6.0 — GEDCOM Import/Export)
GEDCOM 5.5.1 parser, date parser, importer (INDI/FAM/SOUR), exporter, IPC, MCP tools. 31 unit tests. See `docs/plans/archive/2026-04-03-gedcom.md`.

### Done (v0.6.2 — Genney Import Profile)
`swedishPlace.ts`, `swedishNames.ts`; `profile: 'genney'` option in importer; patronymic detection, Swedish place hierarchy. 231 unit tests. See `docs/plans/archive/2026-04-03-genney-import.md`.

### Rejected (v0.6.5/v0.6.6 — Genney Export Roundtrip)
Investigated and rejected 2026-04-03. Genney 4.1's proprietary tags are stripped on re-export; true lossless roundtrip is impossible. See `docs/plans/archive/2026-04-03-genney-export-roundtrip.md`.

### Done (v0.6.3 — Database Switcher)
`settings.ts`; `switchDatabase()`; IPC `db:*`; `DatabaseView.vue`; `get_current_database`/`switch_database` MCP tools. See `docs/plans/archive/2026-04-03-database-switcher.md`.

### Done (v0.6.4 — Extended GEDCOM Roundtrip)
Lossless GEDCOM 5.5.1 cycle with extension tags. 29 new unit tests (262 total). See `docs/plans/archive/2026-04-03-gedcom-extended.md`.

### Done (v0.6.5 — Chart Enhancements)
Pedigree to 5 generations; hourglass to 4+3 levels; zoom/scroll with cursor anchor; spouses in hourglass. See `docs/plans/archive/2026-04-03-chart-enhancements.md`.

### Done (v0.6.6 — Collapsible Visualisation Nodes)
`CollapseButton` + pruning logic; collapse/expand ancestor subtrees, children, spouses; 14 new unit tests. See `docs/plans/archive/2026-04-03-collapsible-viz.md`.

### Done (v0.6.7 — Per-Node Descendant Collapse)
↓ button on every descendant node with children; collapse-aware `leafCount`. 4 new unit tests (288 total). See `docs/plans/archive/2026-04-03-descendant-collapse.md`.

### Done (v0.6.8 — Tilltalsnamn + Smeknamn separation)
`nickname` column; `fullNameParts` renders nickname in double quotes; GEDCOM import/export updated; 12 new unit tests (300 total). See `docs/plans/archive/2026-04-03-tilltalsnamn-and-smeknamn.md`.

### Done (v0.6.9 — Genney Derby Import)
`DerbyExtractor.java`; `transform.ts`; Docker orchestration; GEDCOM fallback; 38 new unit tests (335 total). See `docs/plans/archive/2026-04-04-genney-derby-import.md`.

### Fix — Stale IPC database reference after switchDatabase
See `docs/plans/archive/2026-04-03-ipc-stale-db.md`.

### Fix — GEDCOM import timeout + Genney preferred name asterisk
See `docs/plans/archive/2026-04-03-gedcom-import-performance.md`.

### Fix — GEDCOM import CPU saturation (statement cache)
See `docs/plans/archive/2026-04-03-gedcom-import-cpu.md`.

### Fix — GEDCOM import: couple subtype always 'unknown'
See `docs/plans/archive/2026-04-03-gedcom-couple-subtype.md`.

### Fix — Nickname insertion position + asterisk notation in UI
See `docs/plans/archive/2026-04-04-nickname-display-and-asterisk-ui.md`.

### Fix — Genney import CPU saturation (per-row db.prepare)
See `docs/plans/archive/2026-04-04-genney-cpu-saturation.md`.

### Fix — Genney .backup extraction: fflate instead of unzip subprocess
See `docs/plans/archive/2026-04-04-genney-windows-paths.md`.

### Fix — Genney EVENT_PLACE column names wrong; REMARK.TEXT→NOTE
See `docs/plans/archive/2026-04-04-genney-column-bugs.md`.

### Fix — import_gedcom silently swallowed .backup files; add import_genney MCP tool
See `docs/plans/archive/2026-04-04-import-genney-mcp-tool.md`.

### Fix — QualityView: auto-run checks on mount, removed manual run button

### Fix — Relationship EventList: wire CitationBadge on event rows

### Fix — Reactive quality badge: contextBridge onDataChanged pattern
See `docs/plans/archive/2026-04-05-fix-reactive-quality-badge.md`.

### Fix — ResearchTasksView: table styling, person column, reactive badge
See `docs/plans/archive/2026-04-05-research-tasks-view-fixes.md`.

### Fix — Consistent name rendering: nickname + preferred_name in all views
See `docs/plans/archive/2026-04-05-consistent-name-rendering.md`.

### Fix — Circle chart zoom: flex-shrink, center buttons, curved text
See `docs/plans/archive/2026-04-05-circle-chart-zoom-fixes.md`.

### Fix — v0.20.9: WASM OOM after large GEDCOM import
See `docs/plans/archive/2026-04-05-fix-wasm-oom-after-large-gedcom-import.md`.

### Fix — v0.20.10: Systematic WASM heap leak fix — queryOne/queryAll/runSql helpers

### Fix — v0.22.4: PersonsView UI lockup — correlated subqueries + indexes
See `docs/plans/archive/2026-04-05-fix-personsview-lockup.md`.

### Fix — v0.23.1: Remove 500-ancestor limit from Ancestor Book export

### Fix — v0.23.2: ReportsView full-width + auto-fit zoom controls

### Fix — v0.23.3: Circle chart gen 5-6 radial text visibility

### Fix — v0.23.4: Chart birth/death date formatting; BOX_H 44→54; circle fixes

### Fix — v0.23.5: Circle gen 6 colors; Reports auto-use focal person

### Fix — v0.23.7: AncestorBook gen 6 blank — fetchPedigreeTree generations fix

### Fix — v0.24.1: Quality checks CPU saturation on large trees
See `docs/plans/archive/2026-04-06-checks-performance.md`.

### Fix — v0.25.2: Genney SPLACE address fields stored in place columns
See `docs/plans/archive/2026-04-06-genney-address-fields.md`.

### Fix — v0.26.1: Pedigree/hourglass buttons clipped at SVG boundary
See `docs/plans/archive/2026-04-06-chart-button-clip-fix.md`.

### Fix — v0.26.2: E2E flaky tests — AbortError retry, mutating() wrappers
See `docs/plans/archive/2026-04-06-e2e-fix-flaky-tests.md`.

### Fix — v0.26.3: formatFullName() in nameUtils for all reports
See `docs/plans/archive/2026-04-06-full-name-rendering.md`.

### Fix — v0.37.7: PersonsView startup CPU — two-pass query optimization
See `docs/plans/archive/2026-04-07-personsview-startup-cpu.md`.

### Investigation — GEDCOM Citation Roundtrip: keep current behavior (no changes)
See `docs/plans/archive/2026-04-05-gedcom-citation-roundtrip.md`.

### Refactor — TypeScript window.api typing: api.d.ts, removed unsafe Record<>
See `docs/plans/archive/2026-04-07-typescript-api-types.md`.

### Refactor — User-facing error toasts: useToast + ToastNotification
See `docs/plans/archive/2026-04-07-error-notifications.md`.

### Refactor — i18n coverage: personPanel.*, nav.navigate, hardcoded strings
See `docs/plans/archive/2026-04-07-i18n-coverage.md`.

### Refactor — CSS color variables: 18 palette vars, replaced 70+ hex values
See `docs/plans/archive/2026-04-07-css-color-variables.md`.

### Refactor — BaseModal component: slot-based shell, migrated 15 modals
See `docs/plans/archive/2026-04-07-base-modal-refactor.md`.

---

## 2026-04-11: Competitor Gap Analysis → Track Implementation

### Research — Competitor Gap Analysis
See `docs/plans/2026-04-11-competitor-gap-analysis.md`.

### v0.52.0 — C2: Person Timeline View
Chronological event timeline with gap detection, date type handling, age calculation, edit-on-click.
Part of Track C: `docs/plans/2026-04-11-track-c-core-polish.md`.

### v0.53.0 — D1: MCP Report Generation Tools
6 higher-level MCP tools (get_person_summary, get_family_unit, get_ancestor_tree, get_place_history, get_research_gaps, get_timeline) + 17 unit tests.
Part of Track D: `docs/plans/2026-04-11-track-d-mcp-agent-story.md`.

### v0.54.0 — B1: Media Viewer Redesign
MediaView gallery with lightbox, entity linking, thumbnails, keyboard navigation.
Part of Track B: `docs/plans/2026-04-11-track-b-media-experience.md`.

### v0.55.0 — A2: Export Content Options
ExportOptions type, branch filtering (BFS + spouse inclusion), living exclusion, content toggles. ExportOptionsPanel.vue. GEDCOM exporter integration. 11 unit tests.
Part of Track A: `docs/plans/2026-04-11-track-a-presentation-sharing.md`.

### v0.56.0 — C3: Place Map Visualization
Leaflet/OpenStreetMap maps: global MapView, PersonMap life path, PlaceDetailView inline map.
Part of Track C: `docs/plans/2026-04-11-track-c-core-polish.md`.

### v0.57.0 — D2: MCP Media Tools for AI
3 MCP tools (get_media_file_base64, get_untagged_media, get_media_for_person_context) + 13 unit tests.
Part of Track D: `docs/plans/2026-04-11-track-d-mcp-agent-story.md`.

### v0.58.0 — B2: Media-Bundled Portable Archive
GEDCOM + media .zip export/import with path rewriting. Uses fflate. 6 unit tests.
Part of Track B: `docs/plans/2026-04-11-track-b-media-experience.md`.

### v0.59.0 — A1: Narrative Reports
Person biography, place history, and family narrative as prose-generating Vue components. Swedish + English locale support. Deep linking from detail views. getEventsForPlace() API + 2 tests.
Part of Track A: `docs/plans/2026-04-11-track-a-presentation-sharing.md`.

### v0.60.0 — A5: CSV Export
Persons, events, sources, places as CSV with delimiter (comma/semicolon/tab) and UTF-8 BOM options. 13 tests.
Part of Track A: `docs/plans/2026-04-11-track-a-presentation-sharing.md`.

### v0.61.0 — B3: Media Timeline
Horizontal scrollable timeline with thumbnails positioned by date. Deduplication, event-linked media discovery, approximate date styling. 9 tests.
Part of Track B: `docs/plans/2026-04-11-track-b-media-experience.md`.

### v0.62.0 — A3: Wall Charts
Large-format pedigree (horizontal) and descendant (vertical) SVG charts. A4-A0 paper sizes, tiled output with crop marks. 13 tests.
Part of Track A: `docs/plans/2026-04-11-track-a-presentation-sharing.md`.

### v0.63.0 — C1: Undo/Redo
Command-pattern undo/redo for person, name, event, participant, relationship, source, citation CRUD. Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z), grouped operations, toast notifications, max depth 100, clear on DB switch. 30 tests.
Part of Track C: `docs/plans/archive/2026-04-11-track-c-core-polish.md`.

### v0.64.0 — B4: Face/Region Tagging (Manual)
media_regions table with fractional coordinates, CRUD API, 5 MCP tools, lightbox drawing mode with PersonPicker. 14 tests.
Part of Track B: `docs/plans/2026-04-11-track-b-media-experience.md`.

### Docs — D3: Claude Desktop Integration
6 MCP workflow guides (research report, family history, source audit, data quality, photo tagging), README MCP setup section.
Part of Track D: `docs/plans/archive/2026-04-11-track-d-mcp-agent-story.md`.

### v0.65.0 — A4: Static HTML Site Export
Self-contained browsable family tree website: person/place/source pages, client-side search, responsive CSS, XSS-safe, living person exclusion. 12 tests. **Track A complete.**
Part of Track A: `docs/plans/archive/2026-04-11-track-a-presentation-sharing.md`.

### v0.66.0 — C4: GEDCOM Hardening
8 edge case fixtures (encoding, minimal, empty fields, deep nesting, large family, non-standard tags, malformed dates, duplicates). Hardened date parser (abt./ca/circa, ranges). Import preview dialog. 40 integration tests. **Track C complete.**
Part of Track C: `docs/plans/archive/2026-04-11-track-c-core-polish.md`.
