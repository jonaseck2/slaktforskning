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

### v0.67.0 — B5: Face/Region Tagging — MCP for AI
Batch tagging tools: suggest_media_regions, get_persons_for_matching, get_media_tagging_status. 18 tests. **Track B complete. All four tracks from the competitor gap analysis are now done.**
Part of Track B: `docs/plans/archive/2026-04-11-track-b-media-experience.md`.

---

## Implementation History (v0.68+)

See [CHANGELOG.md](../../../CHANGELOG.md) for full narrative entries. Summary table:

| Version | Feature |
|---------|---------|
| v0.68.0 | PlacePanel: map pin side panel, 8 collapsible sections, drag-resize, EntityMediaSection |
| v0.69.0 | User feedback: hierarchy section, wedding/foster event types, couple subtypes, cause field |
| v0.70.0 | Pedigree + hourglass chart outline placeholders for selected person |
| v0.71.0 | Hourglass outline architecture: TreePerson data model, unconditional outline injection |
| v0.72.0 | Pedigree and descendant charts: TreePerson data model, N-parent support, outline injection |
| v0.73.0 | Tree subject (SUBM): import matching, SUBM export, DatabaseView picker |
| v0.74.x | Fix: descendant chart outline placement and space reservation |
| v0.75.0 | Boundary gazetteer overlay — click map pin to see parish polygon |
| v0.76.0 | Bundled Swedish boundary gazetteer (Lantmäteriet, CC0) |
| v0.77.0 | Place types (municipality/locality), map boundary overlay fixes |
| v0.77.1–v0.78.4 | Hourglass layout rewrite: computeFootprint, 4-pass placement, collision avoidance |
| v0.80.0 | QualityView: confirm/reject/view buttons for place match checks |
| v0.81.0–v0.82.1 | updateMedia API, media table view, inline editing, prod/dev server split |
| v0.83.0–v0.89.1 | MCP workflow tools: persons, events, sources, places, research, media, data mgmt; dev tools |
| v0.90.0 | MCP overhaul: prod/dev split, 34 workflow tools, 15 dev tools |
| v0.91.0–v0.93.1 | UX: multi-token search, SourcePicker, DateInput, CDP debugging, quality fix actions |
| v0.94.0 | Design System Overhaul: 3 color themes, 9 UI primitives, sidebar restructure |
| v0.95.0–v0.97.6 | Detail view UX: collapsible sections, three-sheet layout, unified views |
| v0.99.x | Inline media viewer with zoom/pan, face tag drawing, map performance |
| v0.100.0–v0.102.x | Face tag region move/resize, language gazetteers (GeoNames + Wikidata) |
| v0.103.0–v0.103.3 | Shared place coordinate resolution, Life Map in PersonPanel |
| v0.104.0–v0.105.0 | Gazetteer build extraction, cross-platform build scripts |
| v0.106.0–v0.107.0 | Open source publishing infra, link rules expansion (de/da/no), fan chart |
| v0.108.0–v0.110.0 | Per-theme dark mode, wall chart generation UI, timeline chart visual overhaul |
| v0.111.0–v0.112.0 | Chart visual overhaul (WCAG contrast, curved connectors, dynamic heights), unified fan chart |
| v0.114.0–v0.116.0 | Chart box polish, pedigree/hourglass/descendant generations stepper |
| v0.117.0–v0.119.6 | Wall chart as inline report, fan chart theme-aware palettes, media lightbox removed |
| v0.120.0–v0.121.0 | Set profile from face-tag star, UI polish (notes, textarea height, outline fixes) |
| v0.122.0–v0.123.0 | PersonPicker relation hint, monospaced notes toggle |
| v0.124.0–v0.126.0 | EventForm citation section, unified zoom controls, quality checks for places/media/sources |
| v0.127.0–v0.128.1 | Add person from place panel, wall chart rolled into live charts, MCP clean shutdown |
| v0.129.0–v0.129.2 | Quality checks expansion (18 new checks), performance (bulk queries) |
| v0.130.0–v0.130.3 | Chart export controls to ReportsView, sex/bw color modes, tiled PDF fix |
| v0.131.0–v0.131.1 | Keepsake reports redesign: 7 reports + 6 prints + 6 primitives + 2 composables |
| v0.132.0–v0.132.1 | Cropped face-tag profile pictures on all AppAvatars |
| v0.133.0–v0.134.0 | Reports route persistence, media captions, PersonLifeMap, timeline chart export |
| v0.135.0 | ReportPanel: all print config controls in right-side panel, useReportConfigStore |

---

## Completed Milestones

### Hourglass Outline Architecture
Refactor hourglass chart layout to support outline placeholders as first-class nodes.
- Plan: [2026-04-11-hourglass-outline-architecture.md](2026-04-11-hourglass-outline-architecture.md)

### Hourglass Layout Rework
Complete rewrite: clone → inject outlines → measure (computeFootprint) → 4-pass placement → line routing.
- Spec: [2026-04-15-hourglass-layout-rework-design.md](2026-04-15-hourglass-layout-rework-design.md)

### Gazetteer Quality Checks + Media Editor
Gazetteer match quality checks, confirm/reject in QualityView, MediaView table mode.
- Spec: [2026-04-15-gazetteer-quality-media-editor-design.md](2026-04-15-gazetteer-quality-media-editor-design.md)

### MCP Server Overhaul
Prod/dev server split. 34 workflow tools, 15 dev tools. Factory pattern.
- Spec: [2026-04-15-mcp-overhaul-design.md](2026-04-15-mcp-overhaul-design.md)
- Plan: [2026-04-15-mcp-overhaul.md](2026-04-15-mcp-overhaul.md)

### Gazetteer IPC Refactor
Split bundled gazetteers from renderer bundle to fix Vite OOM on CI. Renderer bundle: 40 MB → 1.3 MB.
- Spec: [2026-04-20-gazetteer-ipc-refactor-design.md](2026-04-20-gazetteer-ipc-refactor-design.md)
- Plan: [2026-04-20-gazetteer-ipc-refactor.md](2026-04-20-gazetteer-ipc-refactor.md)

### Place Gazetteers
Render-time place resolution using bundled hierarchical gazetteers. 25 gazetteers, ~40 MB.
- Spec: [2026-04-11-place-gazetteers-design.md](2026-04-11-place-gazetteers-design.md)
- Plan: [2026-04-11-place-gazetteers.md](2026-04-11-place-gazetteers.md)

### Gazetteer Import/Export
Per-database gazetteer storage. 7 MCP tools for import/export/manage.
- Spec: [2026-04-13-gazetteer-import-export-design.md](2026-04-13-gazetteer-import-export-design.md)
- Plan: [2026-04-13-gazetteer-import-export.md](2026-04-13-gazetteer-import-export.md)

### Boundary Gazetteer Overlay
New "boundary" gazetteer kind carrying polygon geometry. Click map pin to see parish extent.
- Spec: [2026-04-13-boundary-gazetteer-design.md](2026-04-13-boundary-gazetteer-design.md)
- Plan: [2026-04-13-boundary-gazetteer-overlay.md](2026-04-13-boundary-gazetteer-overlay.md)

### Keepsake Reports Redesign
7 keepsake reports + 6 framable prints, 6 primitives, 2 composables, privacy filter.
- Spec: [2026-04-19-keepsake-reports-redesign-design.md](2026-04-19-keepsake-reports-redesign-design.md)
- Plan: [2026-04-19-keepsake-reports-redesign.md](2026-04-19-keepsake-reports-redesign.md)

### Media Viewer & Face Tagging
Inline image viewer with zoom/pan, face tag drawing, lightbox removed.
- Spec: [2026-04-18-media-viewer-face-tagging-design.md](2026-04-18-media-viewer-face-tagging-design.md)
- Plan: [2026-04-18-media-viewer-face-tagging.md](2026-04-18-media-viewer-face-tagging.md)

### Cropped Face-Tag Profile Pictures
Starred face tag as cropped square profile picture on every AppAvatar. Pinia store + canvas crop.
- Plan: [2026-04-20-avatar-profile-pic-crop.md](2026-04-20-avatar-profile-pic-crop.md)

### ReportPanel
All print-configuration controls moved from tab headers into a right-side panel. useReportConfigStore.
- Spec: [2026-04-21-report-panel-design.md](2026-04-21-report-panel-design.md)
- Plan: [2026-04-21-report-panel.md](2026-04-21-report-panel.md)

### Open Source Publishing
CI/CD, automated releases, Claude-powered issue triage, governance files, README redesign.
- Spec: [2026-04-18-open-source-publishing-design.md](2026-04-18-open-source-publishing-design.md)
- Plan: [2026-04-18-open-source-publishing.md](2026-04-18-open-source-publishing.md)

### IPC Channel Registry
Replaced 3-layer string-keyed IPC boilerplate with a single typed registry in `src/shared/channels/` (~131 channels). Adding a channel is now one `defineChannel()` call. `window.api` is fully typed via `ApiSurface<typeof channelRegistry>`.
- Plan: [2026-04-28-ipc-channel-registry.md](2026-04-28-ipc-channel-registry.md)

### Panel Composables & EntityPanel
`useEntityData` / `useEditableFields` / `usePanelStorage` composables and a shared `<EntityPanel>` shell. Removed ~600 lines of repetition across entity panels, fixed the EventList stale-load race, centralized 56+ ad-hoc localStorage keys, and baked cross-view reactivity into the data composable.
- Plan: [2026-04-28-panel-composables.md](2026-04-28-panel-composables.md)

### Ben Feedback Batch (2026-04-29)
25 items from beta-tester Ben shipped across 8 releases (v0.162.6 → v0.169.0). Reactivity audit + fixes (panel section counts, tree refetch on data change), life-timeline expansion (parents' deaths, opt-in sibling/child events), and assorted UX polish. See CHANGELOG entries for the full list.
- Plans: `2026-04-29-ben-*.md` in this archive directory.

### Duplicate Persons View
`/duplicates` route + `DuplicatesView.vue` listing duplicate-person candidates with a side-by-side `MergePersonsModal`. API: `findDuplicates`, `findDuplicatesPage`, `mergePersons`, `ignoreDuplicatePair`. Nav badge with live count. (Places / sources / media coverage tracked separately as a backlog item.)

### Inline Media Picker across Entity Panels
Every right-side entity panel media section (Person, Place, Relationship, Source, Group, ResearchTask) hosts the same inline `[picker | Add | Cancel]` add-row. `+ Attach` no longer jumps straight to the OS file dialog — type to autocomplete against existing media (already-linked items filtered out), or click the in-field 📎 / dropdown footer "Attach file…" to upload a new file. Three section flavors (PersonMediaSection, EntityMediaSection, LinkedMediaSection) unified on a shared `MediaAddRow` component; new `media:createFromFile` IPC keeps the wrapper agnostic of which link table the section writes to.
- Spec: [2026-05-02-inline-media-picker-design.md](2026-05-02-inline-media-picker-design.md)
- Plan: [2026-05-02-inline-media-picker.md](2026-05-02-inline-media-picker.md)

### Panel CTA Cleanup
Closes seven UX inconsistencies in the right-side panels: dead Groups row in PersonPanel (now navigates to GroupsView), raw `&#10005;` glyphs replaced with `IconUnlink` (unlink) and `IconTrash` (delete) across MediaPanel + EntityMediaSection, GroupPanel + ResearchTaskPanel unlinks now confirm via the same `useDeleteConfirm` + `<ConfirmModal>` flow PersonPanel uses, the misleading "Add relationship" header button (silently picked spouse) is gone, PlacePersonsSection's redundant duplicate row click is gone, and face-tag rows in MediaPanel show an explicit `IconPencil` reassignment affordance. Drift prevented by a new source-level scan test in `tests/components/panel-cta-conventions.test.ts` and codified in the `ux-intent-mapping` skill.
- Plan: [2026-05-02-panel-cta-cleanup.md](2026-05-02-panel-cta-cleanup.md)
