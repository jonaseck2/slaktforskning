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

### API Polymorphic Link Helpers
Collapsed ~11 near-identical `getXFor<EntityType>` queries (citations, groups, tasks, media) into `getLinkedEntities` + `getCitationsByOwner` in `src/api/links.ts`. Per-entity functions stay as 1-line wrappers so MCP/IPC callers see no diff. Shipped in v0.162.4.
- Plan: [2026-04-28-api-link-helpers.md](2026-04-28-api-link-helpers.md)

### Events Fact-Value GEDCOM Round-Trip
Separates GEDCOM-X `Fact.value` from free-form notes in the events table. New `events.value` column holds the line value of fact-shaped GEDCOM tags (`OCCU "Carpenter"`, `RELI "Lutheran"`, `EDUC "Bachelor of Arts"`, etc.); legacy `description` column renamed to `notes`. Importer now reads the line value into `value` (previously dropped silently); exporter emits it as the line value. Round-trip golden test as merge gate. EventModal shows a type-aware Value field (Yrke / Examen / Trossamfund …) + always-visible Notes textarea, with a Prime Directive guard that preserves authored data across event_type toggles. New event_types `title`/`religion`/`description`/`fact` route TITL/RELI/DSCR/FACT tags cleanly. MCP tools accept `value` + `notes`, with deprecated `description` alias for backwards compat.
- Spec: [2026-05-02-events-fact-value-design.md](2026-05-02-events-fact-value-design.md)
- Plan: [2026-05-02-events-fact-value.md](2026-05-02-events-fact-value.md)

### GEDCOM Round-Trip Fidelity Audit & Guard
Codified GEDCOM round-trip fidelity as a Prime Directive (cont.) co-equal with authored-data preservation in `CLAUDE.md`. Built `src/api/gedcom_fidelity_registry.ts` declaring round-trip status for every schema column under both 5.5.1 and 7.0 (`lossless` | `lossless-via:<mech>` | `lossy:<reason>` | `excluded:<reason>`). Three new tests enforce the contract: schema-coverage guard (adding a column without a registry entry fails CI with the column name), per-(table, column, version) round-trip (187 cases + 100 documented exclusions), and golden multi-table-seed round-trip (catches multi-field interaction regressions). Two real round-trip bugs surfaced by the per-field test were fixed inline: `formatGedcomDate` was emitting raw ISO for `BET..AND` end dates, and the repository address exporter was creating orphan `2 CITY/POST/STAE/CTRY` sub-tags when address itself was empty. The user's choice to use this app remains reversible: data they hand us comes back out, with documented `lossy` / `excluded` exceptions instead of silent loss.
- Spec: [2026-05-02-gedcom-roundtrip-fidelity-design.md](2026-05-02-gedcom-roundtrip-fidelity-design.md)
- Plan: [2026-05-02-gedcom-roundtrip-fidelity.md](2026-05-02-gedcom-roundtrip-fidelity.md)

### Place Input is a Leaf, Never a Path (MCP boundary)
RCA-driven contract tightening on the three MCP tools that write to `places.name` directly or implicitly. `add_place` and `update_place` now reject any `name` containing a comma; `record_event` does the same for `place` and additionally rejects when both `place` and the new `place_chain` are passed. Hierarchy is now expressed as an explicit array — `parent_chain` on `add_place` (root → leaf, excluding the leaf) and `place_chain` on `record_event` (root → leaf, including the leaf) — both routed through the existing `findOrCreatePlaceWithChain` so missing rows are created and existing ones reused (idempotent). Tool descriptions and `docs/MCP.md` rewritten to teach the convention. Closes the "Chennai, India, World, India, World" bug where an agent's path-shaped string had been persisted verbatim. Importers and the renderer's `PlacePanel.onNamePlaceSelected` smell are explicit scope deviations (importers preserve the source file; the renderer follow-up has its own stub plan).
- Plan: [2026-05-03-place-leaf-only-mcp.md](2026-05-03-place-leaf-only-mcp.md)

### Place Name PlacePicker Leaf-Only (renderer) — obsoleted before written
Stub follow-up to the MCP-side leaf-only fix, written as a placeholder for closing the renderer's `PlacePanel.onNamePlaceSelected` smell that wrote a comma-string path into `places.name`. Obsoleted before being expanded into a real plan: commit `7b040b17` ("fix: unify place modal/panel form + drop silent picker-merge overwrite") removed the entire handler — the Place panel's name field is now a plain text input with no PlacePicker-merge affordance, so there is no surface left to fix. The "merge-from vs pivot-to" decision was answered by deletion. Filed for the historical record so the next person grepping for `onNamePlaceSelected` finds the trail.
- Plan: [2026-05-03-place-name-picker-leaf-only.md](2026-05-03-place-name-picker-leaf-only.md)

### Hourglass Chart Polish (2026-05-04)
Six fixes from Bengt's R45–R50 / R54.1 batch shipped in v0.212.0. Siblings and shared children now render oldest-leftmost; partner edges per-pair so multi-partner relationships don't cross intermediate spouse boxes; shared children hang from the couple connector midpoint instead of one parent; foster parent–child edges render dashed (`8 4` stroke pattern) with an SVG `<title>` hover tooltip; clicking a relative pans the chart to keep them on screen with a 100 px inset short-circuit. R50 dual-focus regression-tested but no active bug found in current code (`chartNavFocusedPerson` is wired only to PedigreeChart).
- Spec: [2026-05-04-hourglass-chart-polish-design.md](2026-05-04-hourglass-chart-polish-design.md)
- Plan: [2026-05-04-hourglass-chart-polish.md](2026-05-04-hourglass-chart-polish.md)

### Global Gazetteer Hierarchy
Migrated the entire gazetteer system from a forest of 30 self-rooted trees (`Sverige × 6`, `Danmark × 3`, `World (Historical)`, etc.) into one canonical hierarchy rooted at `World` with `World (Historical)` as a sibling super-root. Every per-country and per-source gazetteer (29 of 30 — `lang-sv-wikidata` keeps its existing translation data; the other two language gazetteers re-keyed to canonical paths) emits a self-rooted tree typed by the closed admin vocabulary `world | continent | country | admin{N}`. The structural-merge engine (`src/api/place-gazetteers/merge.ts`) collapses same-`(name, type, parent_path)` nodes across sources by aliases-union + first-wins coords; `__contributors: string[]` tracks per-node provenance. End-to-end resolver verified across SE/FI/NO/DK/IS/US/CA/DE plus historical empires. Imported user gazetteers must root at `World` or `World (Historical)`. `GazetteerNode.type` tightened to the closed vocab; closed-vocab integrity test enforced. Multiple design iterations during execution (contract over fixture; no leaf-type vocabulary; no cross-source merging on leaves but structural agreement permitted at admin levels; clean source → clean script → clean gazetteer → mechanical join). All 30 build scripts re-run with fresh source data fetched 2026-05-03.
- Spec: [2026-05-03-global-gazetteer-hierarchy-design.md](2026-05-03-global-gazetteer-hierarchy-design.md)
- Plan: [2026-05-03-global-gazetteer-hierarchy.md](2026-05-03-global-gazetteer-hierarchy.md)

### NewPersonModal Hardening
Save in "Lägg till ny person" is now disabled until the user has typed at least one name field — replacing a post-save toast warning that fired only after the malformed row had already been written. The change cascades through every server-side person-creation path: a new throw in `createPerson` (with an opt-in `{ allowNameless: true }` for importers preserving source-file reference graphs), MCP-handler-level guards in `create_person` and `add_child`, and explicit warning entries in import reports for GEDCOM/Holger/Genney/archive paths when an INDI/PERSON record carries no NAME tag. Existing nameless rows in user databases are surfaced via a new `PERSON_NO_NAME` quality check that detects both zero-`person_names`-rows and all-blank-fields cases (replacing the narrower `NO_NAME` zero-rows-only check). Audit covered 17 person-write paths; 8 risk paths closed via two root-cause fixes (api guard + Genney inline guard). 228 test fixtures bulk-migrated to the explicit `allowNameless: true` opt-in.
- Spec: [2026-05-04-new-person-dialog-hardening-design.md](2026-05-04-new-person-dialog-hardening-design.md)
- Plan: [2026-05-04-new-person-dialog-hardening.md](2026-05-04-new-person-dialog-hardening.md)

### Panel Table Column Overflow — Clip + Ellipsis (2026-05-04)
Long text in any `.panel-section .data-table` cell (events, names, citations, group memberships, research tasks, quality issues) was breaking character-by-character into a vertical strip when the column was narrower than the string. Cause: shared rule `.panel-section .data-table td { word-break: break-word; overflow-wrap: anywhere }` outweighed every per-cell `white-space: nowrap` override on specificity. Replaced the wrap rule with a clip pattern (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0`); small fixed-content cells (badges, dates, sex symbol, ✕ trash button) opt back in with `width: 1px; max-width: none; white-space: nowrap`. Long-text cells gained `:title="<full value>"` for hover-reveal of clipped text. Touched 12 panel-table components (EventList, LinkedPersonsSection, LinkedPlacesSection, LinkedMediaSection, PlacePersonsSection, PersonMediaSection, EntityMediaSection, RelationshipsList, GroupsTable, ResearchTasksTable, QualityIssuesTable, SourcePanel inline citations). Component test asserts computed style matches the user-observable contract. R43 (inline add-new from picker) dropped per user direction.
- Spec: [2026-05-04-person-picker-ux-design.md](2026-05-04-person-picker-ux-design.md)
- Plan: [2026-05-04-person-picker-ux.md](2026-05-04-person-picker-ux.md)

### Event Participants Parity + Marriage-Flow Prompts
Closed the asymmetry where editing a wedding/marriage/engagement/divorce hid the "Other person" picker that's visible at create time — the affordance is now symmetric across both states (Part A.1, `EventModal-edit-second-person.test.ts`). Added a `<EventParticipantsSection>` component that's rendered unconditionally for every entry in `EVENT_TYPE_VALUES`, so witnesses on a wedding, godparents on a baptism, and mourners on a funeral can be added through a single Deltagare / Participants section using the existing `eventParticipants.add/getForEvent/remove` IPC surface — no new channels (Part A.2, deferred Roles UI per Part B). On RelationshipModal save success, a `couple+marriage` relationship with no linked wedding event surfaces a non-blocking `ConfirmModal` offering to record the wedding inline; Yes opens EventModal as a `mode="subpanel"` flow pre-filled with `default-event-type='marriage'` and `relationship_id`; No writes nothing (Part C, Prime Directive guard with explicit test). On RelationshipModal save *before* persisting a new couple, a read-only `findUnresolvedPartnership(person1Id)` walks existing couple relationships, filters out those with a linked divorce event or a deceased other partner, and surfaces a non-blocking warning when an overlap is detected; the user can proceed or cancel (Part D). Divorce-mirror offer deferred — `CoupleSubtype` has no `divorced` value, divorces are tracked as separate event rows linked via `relationship_id` with no relationship-modal trigger; documented in code comment for the future when the data model gains the concept.
- Spec: [2026-05-04-event-participants-and-marriage-flow-design.md](2026-05-04-event-participants-and-marriage-flow-design.md)
- Plan: [2026-05-04-event-participants-and-marriage-flow.md](2026-05-04-event-participants-and-marriage-flow.md)

### PersonPanel Relations Ordering (2026-05-04)
Open the same person twice and see the same Relationer list in the same order, every time. Replaced the panel's insertion-order render path with a pure sort function (`src/api/sortPersonRelations.ts`) shared between `PersonRelationshipsSection.vue`, `ALifeReport.vue`, and `LifeOnOnePageReport.vue`. Order: parents (bio → adopted → foster → step → unknown, M → F within each, sex-typed headings for bio/unknown, foster-terminology's sex-neutral role tokens for adopted/foster/step) → partners chronological by `start_date` (null sinks last by id) → children inlined under producing partner (oldest-first by birth_date) → orphan-children bucket → other relations (godparent + sibling first, then social, both `Intl.Collator(locale)`-sorted for å/ä/ö correctness in Swedish). Renderer collapsed to a single `reports.personSummary` IPC per panel open (down from 1 + 5×N). Rebased onto foster-terminology when it landed mid-execution; non-bio parent headings now route through `relationshipLabels.ts`. Component test "produces identical DOM order when remounted" mechanically asserts the user goal.
- Spec: [2026-05-04-person-relations-ordering-design.md](2026-05-04-person-relations-ordering-design.md)
- Plan: [2026-05-04-person-relations-ordering.md](2026-05-04-person-relations-ordering.md)

### Beta Tester UX Batch (2026-05-05) — Reports 56–68
Seven UX fixes from beta tester reports against v0.215.2: per-row partner heading is singular ("Partner" not "Partners"); date_original field gains a label + helper text and a quality check flagging digit-free rows so existing misuse can be cleaned up without auto-clearing authored data; Förnamn sort uses preferred name (tilltalsnamn) when marked so sort matches displayed name; list table headers are sticky across every list view via a single `shared.css` rule (per-view duplications removed); side-panel section headers gain a subtle background band on `var(--surface-hover)` for low-vision scannability; chart controls (zoom, generation count, fan arc, color mode) carry hover tooltips on every icon-only / number-only button; new persons created from any "+ Ny person" entry point can capture birth date + place inline in the same modal step via the existing `persons.createWithEvent` workflow. Each plan is self-contained per `.claude/rules/plans.md`.
- Plans: [2026-05-05-partner-singular-heading.md](2026-05-05-partner-singular-heading.md), [2026-05-05-date-original-field-clarity.md](2026-05-05-date-original-field-clarity.md), [2026-05-05-given-name-sort-uses-preferred.md](2026-05-05-given-name-sort-uses-preferred.md), [2026-05-05-list-sticky-headers.md](2026-05-05-list-sticky-headers.md), [2026-05-05-personpanel-section-header-color.md](2026-05-05-personpanel-section-header-color.md), [2026-05-05-chart-controls-tooltips.md](2026-05-05-chart-controls-tooltips.md), [2026-05-05-add-parent-with-birth-event.md](2026-05-05-add-parent-with-birth-event.md)

### Beta Tester UX Batch (2026-05-06) — Reports 69–80 (partial)
Six fixes/features from beta tester reports against v0.215.2: place picker preserves typed text after a pick so Backspace at the trailing edge edits one character at a time instead of clearing the whole field (root cause: `modelValue` watcher's null branch wiped `query` unconditionally — predicate guard now compares against `lastResolvedPath`); tall modal forms scroll inside the modal so Save stays reachable on small windows (root cause: `.entity-panel`'s `min-height: min-content` silently outweighed its `max-height: calc(100vh - 64px)` cap per CSS spec — single-line fix to `min-height: 0` plus 6-case CSS-contract test); place-tree picker icon and tooltip explain what the panel shows (hierarchy-glyph SVG, Swedish/English tooltip "Browse places already in this database", info-pill panel header distinguishing DB rows from gazetteer suggestions); relation row uses clearer role labels (full word "Förälder" instead of truncated "Fö" — root cause: `.panel-section .data-table td { max-width: 0 }` truncation, lifted via scoped `td.type-cell` override) plus hover tooltips on every affordance and a trash icon for remove; research tasks can be linked to persons via a new `PersonResearchTasksSection` self-loading component on PersonPanel and a `+ Task` CTA that auto-links the host person (Surface contract Check #1, mechanically asserted by `ResearchTaskModal-host-link.test.ts`); source types curated for Swedish genealogy with five new entries (passenger list, probate inventory, peerage register, encyclopedia, genealogist's work) plus relabels for newspaper/online_database, dropdown sorted alphabetically in the user's locale via `Intl.Collator(locale)` over rendered i18n labels (round-trip via existing `_STYPE` GEDCOM custom tag, no schema change). Plus two unrelated fixes on main: `display_id` index moved out of inline CREATE TABLE block so pre-v0.218 databases no longer crash on app launch; dev MCP tools (`db_stats`, `seed_*`, `clear_test_data`) now follow `switch_database` swaps instead of staying pinned to the closed initial connection.
- Plans: [2026-05-06-place-picker-edit-after-pick.md](2026-05-06-place-picker-edit-after-pick.md), [2026-05-06-modal-scrollable-content.md](2026-05-06-modal-scrollable-content.md), [2026-05-06-place-tree-picker-discoverability.md](2026-05-06-place-tree-picker-discoverability.md), [2026-05-06-relations-row-affordances.md](2026-05-06-relations-row-affordances.md), [2026-05-06-research-tasks-link-persons.md](2026-05-06-research-tasks-link-persons.md), [2026-05-06-source-types-curation.md](2026-05-06-source-types-curation.md). Held for follow-up: relationship-modal-broken (R78 — REPRO confirmed: Save click silently fails with generic toast "Could not save. Please try again."; modal stays open; Save button stays active-looking; root cause not yet identified — needs renderer-side devtools console inspection); hourglass-foster-vs-adoptive-distinct (R79 — REPRO confirmed: foster and adopted edges currently render with identical `stroke-dasharray="8 4"`, indistinguishable to user); name-citation-and-validity (R75 — WIP on plan/name-citation-and-validity branch); sex-change-guard (R80).

### Hourglass Foster Edge + Couple Edge (2026-05-06) — superseded
Authored 2026-05-06 to address two reported hourglass-chart symptoms (R66/67/77): foster edge flips to solid when a second foster parent is added; couple connector between focal and partner disappears when partner becomes a co-parent. Live MCP-driven reproduction in bengt.db on v0.221.1 confirmed **neither symptom reproduces**: foster edge stays dashed (the chart correctly merges both parents' edges into a single curved path from couple-midpoint to child); couple edge Z↔P remains solid and visible. Per the plan's own self-supersession clause ("If either symptom doesn't reproduce on current main, it may have been fixed incidentally by Fix 1"), the plan is archived without code changes. The 2026-05-05 dedup change (Fix 1) appears to have closed both edge-rendering symptoms incidentally.
- Plan: [2026-05-06-hourglass-foster-edge-and-couple-edge.md](2026-05-06-hourglass-foster-edge-and-couple-edge.md)

### Beta Tester UX Batch (2026-05-06) — Reports 69–80 (final wave)
Four follow-up plans completing the 2026-05-06 beta-tester batch on top of the partial wave already archived above. **Relationship-modal-broken** (R78): live repro confirmed Save was failing silently with a generic toast; fix bound `:save-disabled` to a `canSave` computed (person1+person2+type+distinct-ids) so the button is visibly dimmed when fields are missing AND the catch-block toast now appends the rejected promise's message ("`Could not save. Please try again. — FOREIGN KEY constraint failed`") so the user sees WHY save failed. The "red row" was identified as the entity-coloured Events section header, not an error state — UX label question stays open as a separate decision. **Hourglass-foster-vs-adoptive-distinct** (R79): live repro confirmed foster + adopted edges rendered identically (both `stroke-dasharray="8 4"`); fix introduces `dashForSubtype` (foster `8 4`, adopted `2 3`, biological none, step deferred to foster) PLUS a mixed-subtype split — when coupled parents have different subtypes the chart now splits the merged curved-path into two per-parent edges so each subtype's dash is visible. Same-subtype merge preserved. Adoptive-relationship legend entry wired alongside the previously-orphaned foster entry. **Name-citation-and-validity** (R75): completed from a stalled WIP commit. Schema migration adds `citations.person_name_id` (nullable FK with CASCADE on name delete; FK_VIA_XREF round-trip, GEDCOM 7 emits SOUR under NAME, v5.5.1 falls back). PersonNameModal grows a Hänvisning section that buffers pending citations on the create path and flushes after `persons.addName`; `date_to` ('Giltigt till') is hidden for `name_change` and `birth`, relabelled per name type ('Used until' for `alias`/`aka`); save handler emits `date_to` unconditionally so legacy values aren't nulled out (Prime Directive guard). **Sex-change-guard Phase 1** (R80): the original cross-stack plan stalled at the 10-min watchdog when dispatched as one piece; split into three sub-plans, with Phase 1 shipping the data layer — new `gender_transition` event type, an `updatePerson` guard that throws `SexChangeRequiresConfirmationError` (carrying `personId` + `activeRelationshipIds`) when sex changes on a person with active relationships and neither `confirmCorrection` nor `confirmGenderTransition` is set, an atomic `updatePersonWithGenderTransitionWorkflow` (BEGIN IMMEDIATE), and a pure render-time `resolveParentSexAt` resolver that walks `gender_transition` events to compute sex-as-of-date. Phase 2 (modals) and Phase 3 (MCP + GEDCOM) drafted after Phase 1 lands. Plus three smaller fixes on main during the batch: `display_id` index moved out of inline CREATE TABLE block (pre-v0.218 DB crash); dev-MCP tools follow `switch_database` swaps (was pinned to closed initial connection); `db_stats` switched off the sql.js `getAsObject` API to node-sqlite3-wasm's `queryOne`, and `app_status` reports the live DB path instead of the launch-time env var.
- Plans: [2026-05-06-relationship-modal-broken.md](2026-05-06-relationship-modal-broken.md), [2026-05-06-hourglass-foster-vs-adoptive-distinct.md](2026-05-06-hourglass-foster-vs-adoptive-distinct.md), [2026-05-06-name-citation-and-validity.md](2026-05-06-name-citation-and-validity.md), [2026-05-06-sex-change-guard-phase1-data-layer.md](2026-05-06-sex-change-guard-phase1-data-layer.md). Held for follow-up: sex-change-guard Phase 2 (UI modals) + Phase 3 (MCP + GEDCOM round-trip) — to be drafted on top of Phase 1's API surface.

### Long-running IPC off the main thread (2026-05-06)
A user-reported 25-second freeze during a 22 k-person Holger import traced to `phaseIndividuals` running synchronously on the Electron main thread. Audit found 11 importer/exporter `wrapHandler` blocks all using the same shape: dialog → `getDb()` → heavy DB walk → result. Migrated each one to the DB worker thread per the channel-registry pattern in `src/shared/channels/`. Six channels with no inline dialog (`import:holgerRun`, `gedcom:import`, `gedcom:preview`, `import:genneyRun`, `import:genneyDiscover`, `website:previewSnapshot`) moved directly to `defineChannel({ thread: 'worker' })`. Four channels with inline dialogs (`archive:import`, `archive:export`, `gedcom:export`, `csv:export`) keep their public name on main as a thin shim that opens the dialog then calls a `:_`-prefixed internal worker channel for the heavy work — the `:_` prefix is exempted from preload/static-api coverage so internal channels are never exposed to the renderer. Two website channels (`buildPreviewHtml`, `export`) stay on main with documented scope deviation: they need Electron's `nativeImage` + `dialog`, and their heavy DB walks already delegate to existing worker channels via `callWorker('website:buildSnapshot', …)`. New `withImportLifecycle('<name>', fn)` helper consolidates the `setWorkerImportInProgress(true/false)` flag flip and timing logs across all four importers; introduced ahead of Tasks 4/5 to prevent copy-paste drift. Worker→main→all-windows `broadcast(topic, payload)` primitive added so importer `onProgress` callbacks can reach the renderer from the worker thread (replaces the old main-side `webContents.send`). Renderer adapted in three places to consume the new `{ success, report, error }` envelope shape (`ArchiveSection.vue`, `GedcomImportSection.vue`, `GenneyImportSection.vue`). Architectural invariant pinned by `tests/unit/main-thread-responsive-during-import.test.ts` — moving any of the 10 listed heavy channels back to `thread: 'main'` fails CI.
- Spec: [2026-05-06-long-running-ipc-off-main-design.md](2026-05-06-long-running-ipc-off-main-design.md)
- Plan: [2026-05-06-long-running-ipc-off-main.md](2026-05-06-long-running-ipc-off-main.md)

### Compress shipped JSON assets (2026-05-08)
Two independent tracks under one version bump (0.226.0). Track A (gazetteers): the 29 bundled gazetteer JSONs in `src/api/place-gazetteers/data/` ship as `.json.gz` sidecars at `<bundle-dir>/gazetteers/<id>.json.gz` instead of raw JSON. The Vite `compress-bundled-gazetteers` plugin gzips each file (level 9) in `closeBundle`; `bundled.ts` loads them at module init via `gunzipSync(readFileSync(...))`, resolving the path against `import.meta.url` and falling back to source `data/<id>.json` for tests/dev. The packaged asar drops from ~62 MB of JSON to 9.7 MB total — installer ships ~46 MB smaller. Worker config no longer needs its own gazetteer plugin (no static `.json` imports remain in source). Track B (website export): `website:export` IPC handler gains a `mode: 'split' | 'portable'` parameter. Split (default) writes `index.html` + sibling `data.json.gz`, fetched + decompressed by the static SPA bootstrap via `DecompressionStream` — minimal hosted-deployment shape. Portable writes a single self-contained `index.html` with the snapshot embedded as base64-gzip in an inline `<script>window.__SNAPSHOT_GZ__='...'</script>`, decompressed in-page so the file works from `file://` (email/USB/double-click). Static SPA `installStaticApi` extends to a 4-path bootstrap (legacy `__SNAPSHOT__`, embedded gz+base64, fetched gz, dev raw `data.json`). `WebsitePanel.vue` adds a Format section with two radios; choice persists to localStorage. E2E covers both modes' file shape + snapshot round-trip.
- Plan: [2026-05-08-compress-shipped-json-assets.md](2026-05-08-compress-shipped-json-assets.md)

### Third-Party Licenses + SBOM (2026-05-09)
Bundle a generated `THIRD_PARTY_LICENSES.txt` into the packaged app and surface it from Settings → About → "View open source notices" (`LicensesViewerModal.vue`, new `app:readThirdPartyLicenses` IPC). The script (`scripts/build-third-party-licenses.mjs`) walks `npm ls --omit=dev --all` plus `npm ls electron`, sorts deterministically, and throws on any package without a recognizable LICENSE file (no silent skip, per `feedback_no_silent_string_replace.md`). Forge `generateAssets` hook regenerates the file on every package run; `extraResource` lands it at `<resourcesPath>/THIRD_PARTY_LICENSES.txt`. The same file plus a CycloneDX `sbom.cdx.json` (full dep tree — Electron is a devDependency that physically ships, so `--omit=dev` would mislead) attach to every GitHub Release as standalone supply-chain artifacts. Tightens `window.api.app` typing in `src/renderer/api.d.ts` from `LooseFallback`'s `Promise<unknown>` to explicit signatures.
- Plan: [2026-05-09-third-party-licenses-and-sbom.md](2026-05-09-third-party-licenses-and-sbom.md)

### Bundle Size + Memory Reduction (2026-05-09)
Three independent workstreams under one version bump (0.235.0) targeting the question "does the user download a smaller installer and see the same app?". Track A (asar): `forge.config.ts` `packagerConfig.ignore` switched from a regex denylist to a function-based allowlist that keeps only `/.vite/**` and `/package.json` inside the asar. The Vite plugin already bundles every non-`external` JS dep, so anything else (src/, node_modules/, docs, dev configs) was dead weight; macOS app.asar drops from 128 MB to 10 MB. Track B (gazetteers): the 36 bundled gazetteer JSONs are encoded to a packed binary format (`.glb.gz`) at build time via a new `src/gazetteer-build/binary-codec.ts` (deduplicated string table, int32 lat/lon, delta-encoded geometry). The Vite `emit-bundled-gazetteers-binary` plugin replaces the `compress-bundled-gazetteers` gzip-of-JSON plugin; `bundled.ts` decodes via `decodeGazetteer(gunzipSync(readFileSync(...)))` with `.json.gz` (transitional) and `data/*.json` (dev/test) as fallbacks. Contributors still author JSON in `data/` per `feedback_gazetteers_are_build_outputs.md`. Bundled gazetteer payload drops from 7.30 MB to 5.64 MB. Track C (statement cache): a 5-file audit found and finalized 20 leaked SQLite prepared statements (3 in `media_consolidate.ts` BEGIN/COMMIT/ROLLBACK calls; 17 in `genney/transform.ts` per-import — every Genney import previously leaked all 17 to the WASM heap). Also added `rollup-plugin-visualizer` (gated on `VISUALIZE=1`) for future renderer-bundle audits. Lazy + LRU + pre-warm gazetteer loading deferred to a follow-up plan if the 5.64 MB payload still warrants it. WASM heap smoke test (live packaged-binary GEDCOM import) deferred to user verification.
- Plan: [bundle-and-memory-reduction.md](bundle-and-memory-reduction.md)

### First-Time Onboarding (2026-05-09)
Bengt's beta-tester corpus exposed five distinct first-time confusion patterns: chart focus-switch undiscoverable (#25), media-storage convention invisible (#13b), face-tag UI unintelligible, media reorder hidden, panel sections that show a blank rectangle instead of explaining what they're for. The plan ships two mechanisms under one user goal ("the genealogist understands every panel section without asking"): (1) Empty-state coaching across every panel section in PersonPanel, PlacePanel, SourcePanel, GroupPanel, ResearchTaskPanel, MediaPanel — `SectionEmpty` grew a `purposeKey` mode that pulls Purpose copy from `docs/UX_INVENTORY.md` (one i18n key per surface, sv + en in lockstep). EventParticipantsSection migrated alongside; ReportPanel and WebsitePanel are configuration forms and are explicitly N/A-marked. Coverage is mechanically guarded by `panel-empty-state-coverage.test.ts` so any future panel section without coaching breaks CI. (2) Four enumerated `Coachmark` instances anchored to real DOM elements: Hourglass focus (auto-dismiss on first dblclick), Media reorder (gated on ≥2 rows), Face-tag drawing (only while drawMode active), and a one-shot toast on first media attach explaining the `<dbname>-media/` copy. State persists per-installation in `settings.json.onboarding.seen` (NOT per-DB — Bengt's "tested in tiny DB then opened real DB" pattern would re-fire every coachmark otherwise); reachable from Settings → Defaults → "Reset onboarding". Architecture: `useFirstEncounter(key)` composable + 3 IPC channels (getSeen / markSeen / reset) registered via `wrapHandler` (main-thread-only because `settings.ts` imports electron) with manual `window.api.onboarding` typing in `api.d.ts`; static SPA gets a no-op stub so read-only website exports never trigger coaching.
- Spec: [2026-05-09-onboarding-design.md](2026-05-09-onboarding-design.md)
- Plan: [2026-05-09-onboarding.md](2026-05-09-onboarding.md)

### European Gazetteer Roadmap — Tier 1 + Tier 2 (2026-05-09)
End-to-end European place-resolution coverage from a 14-plan roadmap. Bundled gazetteer count 29 → 71 across versions 0.229.0 → 0.239.0. **Tier 1 (10/10):** DE upgrade brought Germany to parity with the Nordics — added BKG vg250 boundaries (16 Bundesländer + 400 Kreise polygons, 5.4 MB raw / 0.34 MB gzip) and Wikidata Kirchengemeinden + Pfarreien (Q20820021 + Q17143723 + Q102496 — 61 parishes with admin1 chain across 8 of 16 Bundesländer; sparse first cut). GB shipped admin1+admin2+boundaries from ONS Open Geography Portal (4 home nations + 361 LADs); IE/NL/BE/FR/EE/LV/LT/PL each shipped admin1+admin2+populated-places from GeoNames country dumps (CC BY 4.0). **Tier 2 (3 batched plans / 31 countries):** Western (AT/CH/IT/ES/PT/MT/SM/LI/AD/MC), Central (CZ/SK/HU/SI/HR/BA/RS/ME/MK/AL/XK/LU), Eastern (BG/RO/MD/GR/CY/BY/UA/FO/GL). FO and GL ship as standalone gazetteers (not folded into dk-*). Critical lesson surfaced mid-DE: the originally-drafted Wikidata QIDs were unvalidated and several were grossly wrong (Q1620908 = "historical region" not Kirchengemeinde; Q73501 = "Bredevoort" the Dutch town; Q1860233 = "Pentland Firth" a Scottish sound; Q3308141 = "Michael Delisle" a Canadian writer; Q23498 = "archaeology"). Mandatory `wbgetentities` validation gate (design § 3.2) added to every Wikidata-sourced plan in Task 0; corrections propagated across IE/NL/BE/EE/LV/LT/PL/europe-historical plans. Closed-vocab discovery: parish leaves use `admin3` per `GAZETTEER_NODE_TYPES` in code, not `parish` as the skill doc claimed (sv-socknar / dk-sogne precedent). Per-gazetteer `stripSuffixes` / `stripPrefixes` rules ship per country (kraj/okres, megye/járás, voivodeship/powiat, opština + Cyrillic forms, …). The registry-driven `tests/unit/european-coverage.test.ts` carries country-specific resolution probes with sequence-order assertion that prevents wrong-reason passes (DE plan caught this when the boundary gazetteer changed admin2 names from `Kreisfreie Stadt Lübeck` to bare `Lübeck`). **1 plan remaining**: `europe-historical` (Wikidata SPARQL extension to `world-historical` covering Habsburg crown lands, Russian gubernii, German Bund states, Polish partitions, Soviet republics — paused mid-session due to Wikidata socket-drop reliability + 4 TBD QIDs needing `wbsearchentities` discovery). **Per-country follow-ups deferred:** parishes for the 9 non-DE Tier 1 countries, ru-eu / tr-eu (longitude-filtered admin1+2), boundaries for IE/NL/BE/FR/EE/LV/LT/PL.
- Design: [2026-05-09-european-gazetteers-design.md](2026-05-09-european-gazetteers-design.md)
- Plans: [2026-05-09-de-gazetteer-upgrade.md](2026-05-09-de-gazetteer-upgrade.md), [2026-05-09-gb-gazetteer.md](2026-05-09-gb-gazetteer.md), [2026-05-09-ie-gazetteer.md](2026-05-09-ie-gazetteer.md), [2026-05-09-nl-gazetteer.md](2026-05-09-nl-gazetteer.md), [2026-05-09-be-gazetteer.md](2026-05-09-be-gazetteer.md), [2026-05-09-fr-gazetteer.md](2026-05-09-fr-gazetteer.md), [2026-05-09-ee-gazetteer.md](2026-05-09-ee-gazetteer.md), [2026-05-09-lv-gazetteer.md](2026-05-09-lv-gazetteer.md), [2026-05-09-lt-gazetteer.md](2026-05-09-lt-gazetteer.md), [2026-05-09-pl-gazetteer.md](2026-05-09-pl-gazetteer.md), [2026-05-09-tier2-western-gazetteers.md](2026-05-09-tier2-western-gazetteers.md), [2026-05-09-tier2-central-gazetteers.md](2026-05-09-tier2-central-gazetteers.md), [2026-05-09-tier2-eastern-gazetteers.md](2026-05-09-tier2-eastern-gazetteers.md)

### Bernadotte MCP Test Session (2026-05-09)
End-to-end agent-driven test: build the full Swedish royal Bernadotte line (Karl XIV Johan → Carl XVI Gustaf → Estelle/Oscar) plus the Norwegian royal house with a cross-family link via Crown Princess Märtha and an explicit adoption (Marius Borg Høiby → Haakon Magnus, `subtype: 'adopted'`) — 60 persons, 101 relationships, 131 events, 62 places, 90 media with 50+ face tags, 6 research tasks. The session was structured as a discovery test for the agent-facing MCP surface; the resulting docs catalogue 19 distinct gaps that the test surfaced. **Eighteen fixes + one verified-clean** landed in the same session: data:changed broadcast wiring (worker → preload, regression-tested in `tests/unit/data-changed-broadcast.test.ts`); tolerant date parser that kills 232 of 359 false positives in `run_checks` (`parseLooseDate` / `extractYear` / `dateDefinitelyAfter` rewritten on top of robust ISO + free-text + Swedish/English month-name parsing); `add_place` leafProps drop on the parent_chain branch; `createSource` INSERT silently dropping `abstract` + `call_number`; `merge_persons` post-merge dedupe (single-cardinality events with citation transfer + `name_type='birth'` → `aka` demotion); empty `default_person_id` → first-person-by-surname render-time fallback in PersonsView; place_type vocabulary expansion (palace / castle / church) + MCP enum sync with renderer constant; i18n `eventTypes.accession` + `coronation` (and the EVENT_TYPE_VALUES entries that were missing alongside); `v-show` instead of `v-if` for sections that derive their count via `defineExpose({count})` (Forskning + Kvalitet on PersonPanel + PlacePanel + MediaPanel); resizable columns with localStorage persistence (`useResizableColumns` composable + `.table-resizable` CSS variant + `.col-resize-handle` drag affordance, applied first to `QualityIssuesTable.vue`); the table-layout-fixed-vs-width-100% gotcha that made Issue column resize silently squashed; new `PersonIdentifiersSection.vue` (FamilySearch / Ancestry / Riksarkivet / personnummer / GEDCOM REFN/RIN / other) wired into PersonPanel between Namn and Händelser; `ui_reload` dev-MCP tool (Cmd+R via the bridge); `ui_get_dom` extended with `mode` (outerHTML / innerHTML / textContent / attributes), `all`, `limit` for targeted DOM extraction; renamed `mcp-dev` skill → `slaktforskning-mcp-dev` for namespace consistency with the new sibling `slaktforskning-mcp` skill (agent USING the MCP for genealogy research); 14-row reload matrix in `slaktforskning-mcp-dev` mapping file path to reload strategy; new "Verifying interactive UI fixes via MCP" subsection acknowledging the bridge can't synthesize drag interactions; three new pitfall sections (pass-through-in-branches, `mutating: true` matters, v-show vs v-if for `defineExpose({count})`); two napkin entries (parallel-merge `git mv + edit = D + A` shape, MCP-can't-drag); two project-wide UI rules in `renderer.md` (resizable-columns adoption pattern, never combine `table-layout: fixed` with `width: 100%`). One open finding remains (#9 — `living: true` heuristic for >130-yr-old persons without death event; by-design, low priority).
- Findings: [2026-05-09-bernadotte-test-findings.md](2026-05-09-bernadotte-test-findings.md)
- Followups: [2026-05-09-bernadotte-followups.md](2026-05-09-bernadotte-followups.md)

### Beta-tester May 7 reports (86–93) batch (2026-05-09)
Five plans answering reports 86–93 from the beta-tester corpus, shipped together. **Timeline kin-event labelling** turned the person timeline into a relationship-aware narrative — every kin event now reads as a relationship ("Sons födelse", "Förälders död", "Vigsel — partner"); foster children's biological birth events no longer appear on a foster parent's timeline (the foster placement event surfaces instead when dated); every dated row, including kin rows, gets the focal person's age in a dedicated visual column to the right of the spine. Render-time only — no schema change. The composer (`composeTimelineLabel` in `src/renderer/utils/timelineLabel.ts`) is the single source of labelling truth and also drives `ALifeReport`. **Persons list aggregate columns** turned the list into a sparseness scanner: opt-in columns for sex + 7 count columns (names, events, relationships, media, groups, tasks, quality issues), persisted via a `⋮ Kolumner` picker; secondary sort lifted into `usePagedList` (shift-click any header) with a status pill; default tiebreaker is name ASC. Aggregates ship as a single SQL query per page with new FK indexes. **Phase 4 (cross-view secondary sort on the other 5 list views) was dropped from scope** mid-execution as a misapplied all-or-nothing rule — no driving user feedback existed, and shipping shift-click without underlying API support would have been the exact "silent degradation" failure mode the renderer rules forbid. **Event outside-lifespan check** is a new informational quality check covering both before-birth and after-death; save-time non-blocking warning toast in `EventModal` plus a row in the Quality view (chronology category). Covers all participant roles, not just primary. Never modifies the saved event. **PersonNameModal hardening** ports the new-person-dialog hardening pattern to the name-event modal: prefill given_name (previously only surname was prefilled), red asterisks + "Obligatoriskt" helper lines on conditionally-required fields, Save button greyed and `aria-disabled` while invalid, Enter through invalid form flashes the offending field instead of silently doing nothing. Mononyms still allowed. **Notes monospace toggle label** added a visible `Fast teckenbredd` / `Monospace` text label alongside the `iWi` mnemonic (now `aria-hidden`) on all three Notes-hosting surfaces — addresses a low-vision beta-tester confusion. Rich-text formatting on Notes was deferred to a future brainstorm (storage format, GEDCOM round-trip implications, editor library, sanitisation, search are all open questions). All five plans verified by diff inspection + unit/component tests; live smoke walkthrough remains user-deferred.
- Plans: [2026-05-09-timeline-kin-event-labelling.md](2026-05-09-timeline-kin-event-labelling.md), [2026-05-09-persons-list-aggregate-columns.md](2026-05-09-persons-list-aggregate-columns.md), [2026-05-09-date-before-birth-quality-check.md](2026-05-09-date-before-birth-quality-check.md), [2026-05-09-person-name-modal-hardening.md](2026-05-09-person-name-modal-hardening.md), [2026-05-09-notes-monospace-toggle-label.md](2026-05-09-notes-monospace-toggle-label.md)

### GEDCOM lossless: events.place_address via _PLAC_ADDR (2026-05-09)
Promoted `events.place_address` from `lossy` to `lossless-via:_PLAC_ADDR` for both GEDCOM 5.5.1 and 7.0. Exporter emits the custom sub-tag at level 3 under PLAC, or at level 2 directly under the event when no PLAC line is emitted (so authored addresses survive even on event records without a place). Importer reads it from either position. Distinct from the standard ADDR/CITY/POST handling which targets the Place's mailing-address columns. Per-field fidelity harness now exercises the round-trip mechanically. — [plan](2026-05-09-gedcom-event-place-address.md)

### GEDCOM lossless: sources.abstract + sources.call_number via _ABSTRACT / _CALL (2026-05-09)
Promoted `sources.abstract` and `sources.call_number` from `lossy` to `lossless-via:_ABSTRACT` / `lossless-via:_CALL` for both GEDCOM 5.5.1 and 7.0. Exporter emits each as a custom level-1 sub-tag under SOUR; multi-line abstracts are split across CONT continuation lines on export and rejoined by the parser on import, so embedded newlines round-trip byte-identical. Distinct from `REPO.CALN` which carries the repository's own call-number on a different table. The matching `repositories.call_number` column is a related but separate follow-up (different exporter phase, different carrier under REPO). — [plan](2026-05-09-gedcom-source-abstract-call-number.md)

### GEDCOM lossless: relationships.notes via _RELA_NOTE on ASSO for non-couple types (2026-05-09)
Closed the non-couple branch of `relationships.notes` so notes on sibling, godparent, and "other" relationships round-trip end-to-end. Couple notes already rode `_RELNOTES` on FAM (a custom level-1 sub-tag under FAM); ASSO had no standard NOTE child the importer reads back, so non-couple notes were silently dropped on export. Exporter now emits `2 _RELA_NOTE <notes>` (with `3 CONT <line>` continuation for multi-line notes) under each ASSO block; importer reads it back when creating the deduplicated relationship row. Both endpoints' ASSO blocks carry the note (the exporter writes the relationship under each person); the importer's existing dedup ensures only one DB row results. Registry: kept the entry as `lossy` (per the precedent set by `relationships.subtype`) but updated `expectedAfterRoundTrip` so couple/sibling/godparent/other return the seeded value; only `parent_child` still returns `''` — `parent_child` rides FAMC/FAMS in the GEDCOM model with no current NOTE carrier on those structures, tracked as a follow-up. — [plan](2026-05-09-gedcom-relationship-notes.md)

### GEDCOM lossless (v7.0 only): citations.transcription via _TRANS on SOUR for person/family/place hosts (2026-05-09)
Promoted `citations.transcription` to `lossless-via:_TRANS` under GEDCOM 7.0 — the user goal is that a parish-record transcription pasted on any citation (event, name, person, relationship, place) survives export and re-import. Event/name already rode standard DATA/TEXT under SOUR (lossless on both versions); the missing branches were person-level (SOUR on INDI), family-level (SOUR on FAM, mapped to relationship_id) and place-level (SOUR on the custom `_PLAC` top-level record). Exporter emits `2 _TRANS <transcription>` under SOUR for those three host kinds with `3 CONT` continuation for multi-line transcriptions so embedded newlines round-trip byte-identical. Importer reads `_TRANS` from each non-event/name citation phase. **Option A on the double-emit question:** `_TRANS` is emitted ONLY for person/relationship/place hosts under v7.0 — never alongside DATA/TEXT for event/name hosts and never under v5.5.1 — keeping the file minimal and removing any "which one wins on import" ambiguity. **Registry split by version:** this is the first plan in the batch where the entry is split — v7.0 is `lossless-via:_TRANS`, v5.5.1 stays `lossy` because 5.5.1 is historically stricter about unknown sub-tags inside SOUR cites; promoting v5.5.1 would be a separate plan focused on consumer-tolerance testing against a panel of 5.5.1-consuming apps. — [plan](2026-05-09-gedcom-citation-transcription-v70.md)

### GEDCOM lossless: groups + group_links via custom _GROUP / _GROUP_LINK records (2026-05-10)
Promoted every non-audit `groups.*` and `group_links.*` column from `lossy → null` to `lossless-via:_GROUP` (or `_GROUP_LINK`) for both GEDCOM 5.5.1 and 7.0. Each `groups` row exports as a level-0 `_GROUP` top-level record carrying NAME and NOTE (multi-line via CONT continuation); each `group_links` row exports as a `1 _GROUP_LINK` sub-record with `2 TYPE person|place|media` and `2 REF @xref@` resolving back to the host. Polymorphic xref resolution: persons → existing INDI map; places → the existing top-level `_PLAC` phase, extended to emit records for places that are group-linked (in addition to places with citations) so the xref dereferences; media → a new top-level OBJE phase that emits records for media linked to a group (inline OBJE blocks under INDI/FAM/event carry no xref so they can't be referenced from a level-1 sub-record). New importer phase `phaseGroupRecords` runs after persons/places/media phases (so all xref maps are populated), creates the `groups` row, and walks each `_GROUP_LINK` resolving REF against the right map; refs that don't dereference (dangling xref) get an explicit `ImportReport.warnings` entry rather than being silently dropped — closes the disclosure loop on offboarding round-trips. `group_links.sort_order` stays `lossy → 0` matching `person_names.sort_order` (visible membership order is preserved by emit position; the column itself rebases per-(group, entity_type) on import). The previously-emitted "Groups and group membership" entry in `ExportReport.excluded` is removed — the data is no longer dropped. Per-field fidelity harness now exercises the round-trip for every promoted column; golden seed extended with two groups carrying mixed-type members (3 persons + 1 place + 2 media in g1; 1 person + 1 place in g2) to catch multi-field interaction regressions. — [plan](2026-05-09-gedcom-groups-custom-tag.md)

### Duplicates Panel — Places, Sources, Media (2026-05-10)
Extended the persons-only `/duplicates` view to cover places, sources, and media in a four-tab shell. Each tab uses an entity-specific find-duplicates heuristic (Levenshtein ≤ 2 within an author/parent_place_id grouping for places/sources; same `file_ref` or near-equal title for media) and an entity-specific merge function that snapshots every touched row pre-merge for undo. `mergeMedia` additionally takes `keepFile: 'target' | 'source'` so the function never silently deletes a file the user wanted to keep. New MCP tools `merge_places`, `merge_sources`, `merge_media`; the existing `find_duplicates` MCP tool gains an optional `entity` argument (default `'person'`). `DUPLICATE_*` quality-check rows now deep-link via `?tab=<entity>&pair=<id1>:<id2>` into the right tab with the pair pre-opened. Polymorphic `ignored_duplicates` table generalized via a v0.220.0 migration that drops the FK to `persons` and adds `entity_type DEFAULT 'person'` (preserving every existing person-typed ignore row). Three new merge modals copy the persons-modal compare layout rather than factoring a shared shell — three near-duplicates is the cleaner choice given the divergent field shapes.
- Design: [2026-05-09-duplicates-panel-design.md](2026-05-09-duplicates-panel-design.md)
- Plan: [2026-05-09-duplicates-panel.md](2026-05-09-duplicates-panel.md)

### Tauri Port — full migration from Electron 41 (2026-05-11)
Replaced Electron 41 with Tauri 2.x. The Vue 3 renderer is unchanged from the user's perspective; what flipped is the runtime + IPC + SQLite backing. SQLite is rusqlite via Tauri commands; the db-worker thread is retired (rusqlite is itself off-thread via `spawn_blocking`). `window.api` is auto-wired at boot in `src/renderer/tauri-window-api.ts` by walking the channel registry, with explicit polyfills for ~30 main-only channels (dialogs, file IO, native shell). MCP runs as a Tauri sidecar process — no `npx tsx` on PATH required. Auto-update is the Tauri 2.x updater plugin; binaries are signed (notarized on macOS, Authenticode on Windows, GPG'd AppImage on Linux). Plan-shape: a spike (evaluation) → "go" verdict → full-port plan → completion-audit (the gap-list) → completion-plan (cluster dispatches) → test-migration plan. Goal-anchor verification: the Holger reference user round-tripped a real OurKind GEDCOM through the Tauri UI, and Windows was smoked end-to-end. Auto-updater hop test (0.252.0 → 0.252.1) is deferred to a follow-up release. The Electron entry points (`src/main/**`, `src/preload/**`, db-worker, electron-forge config) are retained in source for the duration of the cross-over window — they ship to neither Tauri nor Electron after this release.
- Spike: [tauri-port-evaluation.md](tauri-port-evaluation.md) — produced the "go" recommendation in `tauri-port-evaluation-recommendation.md` (in the evaluation worktree)
- Plan: [2026-05-10-tauri-full-port.md](2026-05-10-tauri-full-port.md) + execution notes [2026-05-10-tauri-full-port-notes.md](2026-05-10-tauri-full-port-notes.md)
- Gap audit: [2026-05-10-tauri-port-completion-audit.md](2026-05-10-tauri-port-completion-audit.md)
- Gap-closing plan: [2026-05-10-tauri-port-completion-plan.md](2026-05-10-tauri-port-completion-plan.md)
- Test migration: [2026-05-10-tauri-test-migration.md](2026-05-10-tauri-test-migration.md)
