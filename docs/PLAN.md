# Plan: Släktforskning

Local-first desktop genealogy app (Electron + Vue 3 + SQLite) with a built-in MCP server for AI agent access. Full architecture reference: `CLAUDE.md`. Historical context: `docs/plans/archive/PLAN.md`.

---

## Active Design Decisions

| Decision | Choice |
|----------|--------|
| Desktop framework | Electron 41 |
| Frontend | Vue 3 + Pinia |
| Database | SQLite via node-sqlite3-wasm (WAL, foreign keys on) |
| Agent interface | MCP stdio transport |
| i18n | vue-i18n — Swedish default, English fallback |

---

## Implementation Status

| Version | Feature | Archive |
|---------|---------|---------|
| v0.1.0 | Foundation: SQLite + API + Electron + MCP (14 tools) + tests | — |
| v0.2.x | Data entry UI, global search, MCP UI tools, Swedish i18n | — |
| v0.3.x | Relationships, GEDCOM-X names, person identifiers, detail UX | — |
| v0.4.x | Places: API/IPC/MCP/UI, inline-edit polish | — |
| v0.5.x | Visualization, citation badges, place addresses, tilltalsnamn | — |
| v0.6.0 | GEDCOM 5.5.1 import/export | [archive](plans/archive/2026-04-03-gedcom.md) |
| v0.6.2 | Genney import profile (Swedish places + patronymics) | [archive](plans/archive/2026-04-03-genney-import.md) |
| v0.6.3 | Database switcher | [archive](plans/archive/2026-04-03-database-switcher.md) |
| v0.6.4 | Extended GEDCOM roundtrip (lossless extension tags) | [archive](plans/archive/2026-04-03-gedcom-extended.md) |
| v0.6.5 | Chart enhancements: depth, zoom/scroll, spouses | [archive](plans/archive/2026-04-03-chart-enhancements.md) |
| v0.6.6 | Collapsible visualisation nodes | [archive](plans/archive/2026-04-03-collapsible-viz.md) |
| v0.6.7 | Per-node descendant collapse | [archive](plans/archive/2026-04-03-descendant-collapse.md) |
| v0.6.8 | Tilltalsnamn + smeknamn separation | [archive](plans/archive/2026-04-03-tilltalsnamn-and-smeknamn.md) |
| v0.6.9 | Genney Derby import (Docker + DerbyExtractor.java) | [archive](plans/archive/2026-04-04-genney-derby-import.md) |
| v0.7.0 | Genney full-fidelity: groups, repos, tasks, media, cause | — |
| v0.7.1 | Docs/tests/skills sync, coverage to 88% | — |
| v0.8.0 | MCP tools: groups, repos, tasks, media (30 tools) | [archive](plans/archive/2026-04-04-mcp-agent-workflow.md) |
| v0.9.3 | Genney import crash fix: TODO.STATUS TypeError | [archive](plans/archive/2026-04-04-fix-genney-todo-status.md) |
| v0.9.4 | Hourglass descendant overlap + auto-center focal | [archive](plans/archive/2026-04-04-hourglass-layout-overlap-fix.md) |
| v0.10.0 | Viz as primary view: person panel, drag resize, icon sidebar | [archive](plans/archive/2026-04-04-viz-primary-view.md) |
| v0.10.1 | Genney SEX/LIVING encoding fix | [archive](plans/archive/2026-04-04-genney-sex-living-mapping.md) |
| v0.10.2 | Hourglass spouse side + pedigree compact vertical layout | [archive-1](plans/archive/2026-04-04-hourglass-female-focal-spouse-side.md) [archive-2](plans/archive/2026-04-04-pedigree-compact-vertical-layout.md) |
| v0.11.0 | EVENT.cause UI + GEDCOM CAUS export | [archive](plans/archive/2026-04-04-event-cause.md) |
| v0.12.0 | Tree Sanity Checks: 26 checks, QualityView, MCP tools | [archive](plans/archive/2026-04-04-sanity-checks.md) |
| v0.13.0 | Printable Output: Ancestor Chart, Family Group Sheet, Summary | [archive](plans/archive/2026-04-04-printable-output.md) |
| v0.14.0 | Polish: Escape closes modals + data backup/restore | [archive](plans/archive/2026-04-04-polish.md) |
| v0.15.0 | Evidence Model: mention event, citation editing, Genney MENTION | [archive](plans/archive/2026-04-05-evidence-model-simplification.md) |
| v0.16.0 | Research Tasks UI: list view, person section, sidebar badge | [archive](plans/archive/2026-04-04-research-tasks.md) |
| v0.17.0 | Groups UI: list/detail views, GroupPicker, person section | [archive](plans/archive/2026-04-05-groups-ui-plan.md) |
| v0.18.0 | Navigation focus persistence: Pinia store, sidebar indicator | [archive](plans/archive/2026-04-05-nav-focus-persistence.md) |
| v0.19.0 | Circle chart: 360° ancestor view, 6 gens, branch colors | [archive](plans/archive/2026-04-05-circle-chart.md) |
| v0.20.0 | Ancestor Book: SVG circle, ahnentafel list, person summaries | [archive](plans/archive/2026-04-05-ancestor-book.md) |
| v0.20.7 | GEDCOM import: engagement/adoption types, CAUS, TITL, NOTE | [archive](plans/archive/2026-04-05-gedcom-import-completeness.md) |
| v0.21.0 | Persons list: JOIN query, load-more pagination (100/page) | [archive](plans/archive/2026-04-05-persons-list-pagination.md) |
| v0.22.0 | View caching: keep-alive + dataVersion reload guard | [archive](plans/archive/2026-04-05-view-caching.md) |
| v0.22.3 | PersonsView infinite scroll + RelationshipsView N+1 fix | — |
| v0.23.0 | QualityView: table layout, caching, ignore/unignore, names | — |
| v0.24.0 | Media Attachments: schema, file copy, IPC, MediaView, i18n | [archive](plans/archive/2026-04-04-media.md) |
| v0.24.2 | UX design system: all list views match QualityView pattern | [archive](plans/archive/2026-04-05-ux-design-system.md) |
| v0.25.0 | GEDCOM media import/export: OBJE on INDI/FAM/events | [archive](plans/archive/2026-04-05-gedcom-media-import.md) |
| v0.26.0 | Infinite chart expansion: lazy load-more per branch | [archive](plans/archive/2026-04-06-infinite-chart-expansion.md) |
| v0.26.4–v0.30.1 | Tree-first editing: PersonPanel redesign + ⊕ hover buttons | [archive](plans/archive/2026-04-06-tree-first-editing.md) |
| v0.32.0–v0.35.2 | GEDCOM full standard: 7.0 normalization, ValidationReport | [archive](plans/archive/2026-04-06-gedcom-full-support.md) |
| v0.35.0 | Holger ElevateDB direct import (Python + Docker pipeline) | [archive](plans/archive/2026-04-06-holger-dbisam-import.md) |
| v0.37.3 | Import/export data integrity: ExportReport, warnings | [archive](plans/archive/2026-04-07-import-export-data-integrity.md) |
| v0.37.6 | Component extraction: 6 new components, ImportExportView slim | [archive](plans/archive/2026-04-07-component-extraction.md) |
| v0.37.8 | Shared CircleChartSvg component | [archive](plans/archive/2026-04-05-circle-chart-svg-shared.md) |
| v0.38.0 | GEDCOM 7.0 export: EXID, DATE PHRASE, format selector UI | [archive](plans/archive/2026-04-06-gedcom-70-export.md) |
| v0.38.1 | Holger import: REMA/MISC→notes, defaultPersonId nav | [archive](plans/archive/2026-04-06-holger-import.md) |
| v0.38.2 | GEDCOM gap closure: REPO, _GRP, _TODO, SUBM, db_settings | [archive](plans/archive/2026-04-07-gedcom-import-gap-closure.md) |
| v0.38.3 | Import/export test coverage (Genney/Holger/GEDCOM) | [archive](plans/archive/2026-04-07-import-export-test-coverage.md) |
| v0.38.4 | Genney media folder support + three-box import UI | [archive](plans/archive/2026-04-08-genney-media-folder.md) |
| v0.39.0 | Evidence Analysis phases 1+2: assertions, conflicts, UI | [archive](plans/archive/2026-04-08-evidence-analysis.md) |
| v0.39.1 | Evidence Analysis phase 3: unsourced filter, proof summaries | [archive](plans/archive/2026-04-08-evidence-analysis.md) |
| v0.39.2 | Evidence Analysis phase 4: duplicate detection, merge persons | [archive](plans/archive/2026-04-08-evidence-analysis.md) |
| v0.40.0 | Remove GPS/assertions — pivot to source-citation model | [archive](plans/archive/2026-04-08-remove-gps-assertions.md) |
| v0.40.1 | Media ordering, profile picture, export aspect fix — sort_order on media_links, reorder UI, profile thumbnail in PersonDetailView, aspect-ratio fix in ancestor book report | [archive](plans/archive/2026-04-08-media-ordering-profile-picture.md) |
| v0.44.0 | WCAG 2.1 AA accessibility + TTS: keyboard nav, ARIA roles, focus trapping, skip link, pedigree list view, read-aloud feature (2026-04-08) | [archive](plans/archive/2026-04-08-accessibility-tts.md) |
| Fix | Windows: happy-dom localStorage broken in component tests | [archive](plans/archive/2026-04-08-windows-localstorage-fix.md) |
| v0.41.3 | Windows E2E fixes: removed citations badges, search self-contained, correct i18n text, router history, localStorage cleanup, Docker path | [archive](plans/archive/2026-04-08-e2e-windows-fixes.md) |
| v0.48.0 | Screen Reader Mode (WCAG 2.1 AAA + TTS) | [archive](plans/archive/2026-04-09-screen-reader-mode.md) |
| Fix | macOS 26 Tahoe crash: Electron 41.2.0 + --no-incremental-marking | [archive](plans/archive/2026-04-08-macos26-electron-crash.md) |
| v0.49.0 | Usability Optimization Suite: quick-add relatives with birth, inline birth, quick cite, source memory, tree ghost boxes, batch events — ~50% data entry reduction | [archive](plans/archive/2026-04-10-usability-optimizations.md) |
| v0.51.0 | Source Linker: configurable auto-linking for genealogy references | [archive](plans/archive/2026-04-10-source-linker-implementation.md) |
| v0.52.0 | C2: Person Timeline View — chronological events with gap detection | [archive](plans/archive/2026-04-11-track-c-core-polish.md) |
| v0.53.0 | D1: MCP Report Generation Tools — 6 higher-level tools for AI narratives | [archive](plans/archive/2026-04-11-track-d-mcp-agent-story.md) |
| v0.54.0 | B1: Media Viewer Redesign — gallery, lightbox, entity linking | [archive](plans/archive/2026-04-11-track-b-media-experience.md) |
| v0.55.0 | A2: Export Content Options — branch filtering, living exclusion, content toggles | [archive](plans/archive/2026-04-11-track-a-presentation-sharing.md) |
| v0.56.0 | C3: Place Map Visualization — Leaflet/OpenStreetMap, life path, place maps | [archive](plans/archive/2026-04-11-track-c-core-polish.md) |
| v0.57.0 | D2: MCP Media Tools for AI — base64, untagged discovery, person context | [archive](plans/archive/2026-04-11-track-d-mcp-agent-story.md) |
| v0.58.0 | B2: Media-Bundled Portable Archive — GEDCOM + media .zip export/import | [archive](plans/archive/2026-04-11-track-b-media-experience.md) |
| v0.59.0 | A1: Narrative Reports — person biography, place history, family narrative | [archive](plans/archive/2026-04-11-track-a-presentation-sharing.md) |
| v0.60.0 | A5: CSV Export — persons, events, sources, places with delimiter/BOM options | [archive](plans/archive/2026-04-11-track-a-presentation-sharing.md) |
| v0.61.0 | B3: Media Timeline — chronological media per person/place with lightbox | [archive](plans/archive/2026-04-11-track-b-media-experience.md) |
| v0.62.0 | A3: Wall Charts — large-format pedigree/descendant SVG with tiled PDF | [archive](plans/archive/2026-04-11-track-a-presentation-sharing.md) |
| v0.63.0 | C1: Undo/Redo — command pattern, Cmd+Z/Shift+Z, grouped operations, 30 tests | [archive](plans/archive/2026-04-11-track-c-core-polish.md) |
| v0.64.0 | B4: Face/Region Tagging — manual crop, link to person, MCP tools, 14 tests | [archive](plans/archive/2026-04-11-track-b-media-experience.md) |
| Docs | D3: Claude Desktop Integration — 6 workflow guides, README MCP setup section | [archive](plans/archive/2026-04-11-track-d-mcp-agent-story.md) |
| v0.65.0 | A4: Static HTML Site Export — browsable website, search, XSS-safe, 12 tests | [archive](plans/archive/2026-04-11-track-a-presentation-sharing.md) |
| v0.66.0 | C4: GEDCOM Hardening — 8 edge case fixtures, date parser, import preview, 40 tests | [archive](plans/archive/2026-04-11-track-c-core-polish.md) |
| v0.67.0 | B5: Face/Region Tagging MCP — batch suggest, person matching, tagging status | [archive](plans/archive/2026-04-11-track-b-media-experience.md) |
| v0.68.0 | PlacePanel: map pin side panel with 8 collapsible sections, drag-resize, EntityMediaSection, getPersonsForPlace API | [archive](plans/archive/2026-04-11-place-panel.md) |
| v0.69.0 | User feedback: hierarchy section, event types (wedding, foster placement), couple subtypes (särbo, relation), cause field restricted to death, media folder namespacing, media path resolution fix, EventList persons column | — |
| v0.70.0 | Pedigree + hourglass chart: add-person outline placeholders for selected person, SVG click fix for MCP ui_click, viewBox clipping fix | — |
| v0.71.0 | Hourglass outline architecture: TreePerson data model, buildHourglassTree() converter, unconditional outline injection, spouse placeholder support | [plan](plans/2026-04-11-hourglass-outline-architecture.md) |
| v0.71.1 | Remove kyrkoarkiv/domstolsarkiv/generalmönsterrullor link rules, show citation notes in source detail, i18n additions | — |
| v0.71.2 | Fix: hourglass outlines for all person types — spouse/child outlines for ancestors and descendants via post-layout pass | — |
| v0.72.0 | Pedigree and descendant charts: TreePerson data model, N-parent support, outline injection for all 4 roles | — |
| v0.72.1 | Fix: pedigree outline overlap — spouse/child outlines placed below existing boxes in same column | — |
| v0.72.2 | Fix: pedigree outlines skip over occupied positions using findClearY; add sv-gardar/sv-kyrkor gazetteers | — |
| v0.72.3 | Fix: findClearY uses full rectangle intersection to avoid cross-column overlap | — |
| v0.72.4 | Fix: pedigree spouse outline placed directly below person, line from box edge not center | — |
| v0.72.5 | Fix: pedigree spouse outline shifted right to avoid connector corridor overlap | — |
| v0.72.6 | Fix: pedigree spouse outline uses leaf slot reservation for proper separation, tight V_GAP spacing | [archive](plans/archive/2026-04-12-pedigree-descendant-outlines.md) |
| v0.73.0 | Tree subject (SUBM): import matching across all GEDCOM variants, SUBM export, DatabaseView picker, import report prompt for unmatched submitters | — |
| v0.73.1 | Fix: ancestor book circle chart clips edges at reduced generations — use width="100%" and remove hardcoded max-width to match CircleChartReport scaling | — |
| v0.73.2 | Place UX: gazetteer search in PlacePicker, BaseMap shared component, place_name JOIN in event queries, EventList place column | — |
| v0.73.3 | Fix: PersonDetailView timeline/map reactivity on data version change | — |
| v0.73.4 | Fix: descendant chart outline clipping — relocate parent/spouse outlines into tree for layout-driven spacing | — |
| v0.74.1 | Fix: descendant chart outline placement — revert relocation, use post-layout gap-finding to keep outlines adjacent to selected person | — |
| v0.74.2 | Fix: descendant chart outline space reservation — subtree extent widening pushes siblings apart for spouse/parent outlines, sex-aware left/right side | — |
| v0.75.0 | Boundary gazetteer overlay — click map pin to see parish outline polygon | [archive](plans/archive/2026-04-13-boundary-gazetteer-overlay.md) |
| v0.76.0 | Bundled Swedish boundary gazetteer (Lantmäteriet Socken och stad, CC0) with hint-based disambiguation | — |
| v0.76.1 | Fix: place resolver now handles Swedish genitive and historical län names for correct hierarchy matching | — |
| v0.77.0 | Place types (municipality, locality), map boundary overlay fixes, i18n corrections | — |
| v0.77.1 | Refactor: add `computeFootprint` for hourglass layout measurement (Task 1 of layout rewrite) | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.77.2 | Refactor: hourglass spacing functions use `computeFootprint` — ancestorWidth, ancestorRelCX, descExtents, focal row extent (Task 2 of layout rewrite) | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.78.0 | Feat: hourglass placement passes 1-3 (ancestors, descendants, focal row) + Pass 4 outline placement with collision avoidance (Tasks 3 & 4 of layout rewrite) | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.78.1 | Fix: outline connectors rendered dashed, fork pattern matches normal connectors, spouse outline on correct side | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.78.3 | Fix: sibling/spouse real nodes always visible, outline spouse spacing between focal and sibling sections | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.78.4 | Fix: grandparent selection no longer clips ancestor tree — placeholders excluded from depth/spacing/placement recursion, outline spouse room reserved via computeFootprint | [plan](.claude/plans/2026-04-15-hourglass-layout-rework.md) |
| v0.80.0 | QualityView: confirm/reject/view buttons for place match checks (PLACE_MATCH_AMBIGUOUS/PARTIAL/NONE/WRONG_LEVEL) | — |
| v0.81.0 | Add updateMedia to API, IPC, preload, and MCP with 6 unit tests | — |
| v0.82.0 | Media table view with inline title/notes editing, gallery/table toggle persisted to localStorage | — |
| v0.82.1 | Refactor: prod server factory (`createProdServer`), shared prod types, UI tools removed from prod entry point | — |
| v0.83.0 | feat(mcp): person workflow tools — `create_person` (with birth event + citation in one call), `search_persons`, `get_person_summary`, `update_person`, `delete_person`, `add_person_name`, `merge_persons`, `find_duplicates`; `findOrCreateSource` shared helper | — |
| v0.84.0 | feat(mcp): event workflow tools — `record_event` (multi-participant, place findOrCreate, citation in one call), `get_timeline`, `update_event` (place string resolves to place_id) | — |
| v0.85.0 | feat(mcp): source, place, research, media, and data-management workflow tools — `add_source`, `search_sources`, `cite`, `get_citations_for_person`, `add_place`, `search_places`, `get_place_history`, `resolve_place`, `get_research_gaps`, `add_research_task`, `update_research_task`, `run_checks`, `attach_media`, `tag_person_in_media`, `get_media_for_person_context`, `import_file`, `export_gedcom`, `get_current_database`, `switch_database` | — |
| v0.86.0 | feat(mcp-dev): UI automation tools — `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`; `/fill` endpoint in ui-server | — |
| v0.87.0 | feat(mcp-dev): chart inspection HTTP bridge — `/chart/persons`, `/chart/select`, `/chart/focus`, `/chart/layout` endpoints + `useChartBridge` composable wired into VisualizationView | — |
| v0.88.0 | feat(mcp-dev): chart MCP tools — `chart_list_persons`, `chart_select_person`, `chart_focus_person`, `chart_get_layout`, `chart_screenshot_person` wrapping chart HTTP bridge endpoints | — |
| v0.89.0 | feat(mcp-dev): seed and inspect MCP tools — `seed_person`, `seed_family`, `clear_test_data`, `db_stats`, `app_status`; `/status` endpoint in ui-server; 10 unit tests for seed workflow | — |
| v0.89.1 | test: E2E test for dev MCP server initialize handshake | — |
| v0.90.0 | feat: MCP overhaul — prod/dev split, 34 workflow tools, 15 dev tools, chart inspection | [spec](docs/superpowers/specs/archive/2026-04-15-mcp-overhaul-design.md) |
| v0.90.1 | Fix: startup and quality check CPU contention on large databases | [archive](plans/archive/2026-04-16-startup-perf-fix.md) |
| v0.90.2 | QualityView infinite scroll pagination (100 results at a time) | — |
| v0.91.0 | UX improvements: multi-token search, SourcePicker autocomplete, DateInput YYYY-MM-DD fields with auto-advance, modal redesign (no click-outside close, action verb buttons), EventForm source always visible with Save & Next keeping place/source, gazetteer auto-init, scroll zoom disabled on maps, name surname pre-fill, GEDCOM UTF-8 auto-detection, stable file dialog paths | — |
| v0.91.1 | Fix: Add Person modal aligned with AddRelatedPersonModal pattern (select for sex, living checkbox, birth details), person changes (sex/living) propagate to visualization chart | — |
| v0.91.2 | Fix: chart reloads on name changes, "Link" button for existing person mode, focus in tree updates sidebar, PlacePicker only creates leaf place | — |
| v0.92.0 | Quality check fix actions: Fix button opens correct modal per check type, QualityView navigates with action param, PlacePicker sorts gazetteer results by specificity | — |
| v0.92.1 | Fix: quality check rows clickable to trigger fix action | — |
| v0.92.2 | Fix: QualityView → PersonDetailView action routing uses watch on person ref for reliable modal opening | — |
| v0.93.0 | CDP debugging support (`SLAKTFORSKNING_CDP_PORT` env var, `scripts/dev-debug.sh`), archive 5 implemented design specs + media editor plan, add spec archiving convention | — |
| v0.93.1 | Fix: quality fix actions work end-to-end — modal stays open (no router.replace remount), event type pre-filled (birth/death), electron-dev skill updated with CDP verification workflow | — |
| v0.94.0 | Design System Overhaul: 3 color themes (Forest/Nordic/Twilight), 9 UI primitives, MediaPanel, SettingsView, sidebar restructured (Research/Organize/Review), all views/panels/modals use design tokens | [spec](docs/superpowers/specs/2026-04-17-design-system-spec.md) [plan](plans/archive/2026-04-17-design-system-overhaul.md) |
| v0.94.8 | Fix: map initial zoom race condition, loading/empty states, cached places across navigation; panel close button and quality dismiss button refinements | — |
| v0.95.0 | Detail view UX: relationships above events, collapsible sections (panels only), back button in sidebar, section counts, living status checkbox, remove per-view back buttons | — |
---

## Research

| Date | Topic | Location |
|------|-------|----------|
| 2026-04-17 | Competitor gap analysis v2 | [plans/2026-04-17-competitor-gap-analysis-v2.md](plans/2026-04-17-competitor-gap-analysis-v2.md) |
| 2026-04-11 | Competitor gap analysis v1 | [plans/archive/2026-04-11-competitor-gap-analysis.md](plans/archive/2026-04-11-competitor-gap-analysis.md) |

---

## Roadmap

Version numbers are not pre-assigned. When a milestone is committed, the version is bumped automatically: **new feature → minor bump**, **fix on existing feature → patch bump**.

Fixes, investigations, and refactors archived in [plans/archive/PLAN.md](plans/archive/PLAN.md).

#### Hourglass Outline Architecture [done]
Refactor hourglass chart layout to support outline placeholders as first-class nodes. Replace ahnentafel-based layout with a general graph model where each person has N parents, M children, K spouses. Outline injection is unconditional for the selected person; layout treats outlines identically to real nodes; focal person never filters outlines.
- Plan: [plans/archive/2026-04-11-hourglass-outline-architecture.md](plans/archive/2026-04-11-hourglass-outline-architecture.md)

#### Hourglass Layout Rework [done]
Complete rewrite of hourglass layout: clone → inject outlines → measure (computeFootprint) → 4-pass placement (ancestors, descendants, focal, outlines) → line routing → finalize. Collision avoidance for outline placeholders.
- Spec: `docs/superpowers/specs/archive/2026-04-15-hourglass-layout-rework-design.md`
- Plan: `.claude/plans/2026-04-15-hourglass-layout-rework.md`

#### Gazetteer Quality Checks + Media Editor [done]
Gazetteer match quality checks (PLACE_MATCH_AMBIGUOUS/PARTIAL/NONE/WRONG_LEVEL), confirm/reject match in QualityView, and MediaView table mode with inline editing.
- Spec: `docs/superpowers/specs/archive/2026-04-15-gazetteer-quality-media-editor-design.md`

#### MCP Server Overhaul [done]
Prod/dev server split. 34 workflow tools in prod (persons, families, events, sources, places, research, media, data). 15 dev tools (UI automation, chart inspection, seed, inspect). Factory pattern via createProdServer/createDevServer.
- Spec: `docs/superpowers/specs/archive/2026-04-15-mcp-overhaul-design.md`

#### Chart Layout Shared Utilities Refactor [planned]
Extract duplicated logic from pedigree, descendant, and hourglass layouts into `chart-layout/shared.ts`: `findPersonInTree`, `findParentOf`, placeholder extraction, line-to-dashed conversion. Precondition: hourglass outline bugs fixed first.
- Plan: [plans/2026-04-13-chart-layout-shared-refactor.md](plans/2026-04-13-chart-layout-shared-refactor.md)

#### Workflow Analysis [research]
*High user-focus task — do this in a dedicated session with real usage data.*

Define primary user objectives, map to current click counts, identify highest-friction paths, produce prioritized improvement backlog. Use `interview-synthesis` skill if user research data is available.

---

#### Place Gazetteers [done]
Render-time place resolution using bundled hierarchical gazetteers. Swedish parishes as first dataset. Resolver in `src/api/place-gazetteers/`, composable `usePlaceResolver`, integrated into MapView, PersonMap, PlaceDetailView. GazetteersView settings page. Auto-enabled on Genney import.
- Spec: `docs/superpowers/specs/archive/2026-04-11-place-gazetteers-design.md`
- Plan: `.claude/plans/2026-04-11-place-gazetteers.md`

#### Gazetteer Import/Export [done]
Per-database gazetteer storage with import/export for humans (UI) and agents (MCP). `gazetteers` table stores JSON blobs. GazetteersView gains Import (.json/.json.gz), Export, Delete buttons. 7 MCP tools: `get_gazetteer_schema`, `list_gazetteers`, `import_gazetteer`, `export_gazetteer`, `delete_gazetteer`, `resolve_place`, `search_gazetteer`.
- Spec: `docs/superpowers/specs/archive/2026-04-13-gazetteer-import-export-design.md`
- Plan: [plans/archive/2026-04-13-gazetteer-import-export.md](plans/archive/2026-04-13-gazetteer-import-export.md)

#### Boundary Gazetteer Overlay [done]
New "boundary" gazetteer kind carrying polygon geometry. Click a map pin to see the place's geographic extent as an outline overlay. Extends Gazetteer type with `kind` and GazetteerNode with `geometry`. Lazy-loaded via `resolveBoundary()` in composable.
- Spec: `docs/superpowers/specs/archive/2026-04-13-boundary-gazetteer-design.md`
- Plan: [plans/archive/2026-04-13-boundary-gazetteer-overlay.md](plans/archive/2026-04-13-boundary-gazetteer-overlay.md)

#### Chart Layout Alignment — Universal Spouse Rendering [branch: chart-layout-alignment]
Shared utilities, spouse data in all tree types, spouse boxes in all layouts. Crashes on selection — needs debugging before merge.
- Spec: `docs/superpowers/specs/2026-04-13-chart-layout-alignment-design.md`
- Plan: `docs/plans/2026-04-13-chart-layout-alignment.md` (on branch)

#### Place Gazetteers — Future Extensions [backlog]
- Additional country gazetteers (Norway, Denmark, Finland, US, etc.)
- Historical place name support (parishes that changed names/boundaries over time with date ranges)
- Batch match quality report (how many places resolved, at what quality)

---

#### User Feedback Batch (2026-04-15) — Quick Wins [in-progress]
- `name_change` name type added (schema, i18n, MCP)
- Event type dropdowns sorted alphabetically by translation
- Close confirmation dialog on last window (production only)
- Media copy-on-attach verified working (imported media paths may show as missing — expected)

#### Media Detail/Editor Rework [done]
Table-based MediaView with gallery/table toggle, inline editing for title and notes, format badges. Persisted view mode to localStorage.
- Plan: [plans/archive/2026-04-15-media-editor-rework.md](plans/archive/2026-04-15-media-editor-rework.md)
- Spec: [docs/superpowers/specs/archive/2026-04-15-gazetteer-quality-media-editor-design.md](docs/superpowers/specs/archive/2026-04-15-gazetteer-quality-media-editor-design.md)

#### Name Display Strategy for Charts [planned]
How to display names in space-constrained contexts (charts, circle chart). Tilltalsnamn as primary display, abbreviated chart names, birth vs current name selection. Needs design discussion.
- Plan: [plans/2026-04-15-name-display-strategy.md](plans/2026-04-15-name-display-strategy.md)

#### App Naming [backlog]
Decide on a product name. Candidates: OurHumanLegacy, OurLegacy, MyLegacy, Släktforskning.

#### Link Rules for Genealogy Platforms [backlog]
Add link rules for MyHeritage, Geni, and other genealogy platforms. These are better modeled as source link rules than external identifiers, since they represent source references rather than person IDs for GEDCOM roundtrip.

---

#### Onboarding & Welcome Screen [backlog]
First-run experience: welcome screen, getting started guidance, empty tree with "+" outline placeholder. Depends on design system being in place first.

#### Face/Region Tagging UI [backlog]
Drawing canvas in MediaLightbox or MediaPanel for creating face/region rectangles on images. Displaying existing regions as overlays. Person assignment popup. All API, IPC, MCP tools, i18n strings, and tests already exist (v0.64.0, v0.67.0) — only the Vue UI is missing.

#### Wall Chart Generation UI [backlog]
UI button/dialog to trigger wall chart generation from the app. Paper size selection, font customization, tiled PDF output. SVG generation API already exists (v0.62.0).

#### Dark Mode Theme Refinement [backlog]
Refine dark mode colors to work with the new theme system. Each theme (Forest/Nordic/Twilight) gets a proper dark variant with appropriate contrast and accent colors.

#### Duplicate Merge Side-by-Side UI [backlog]
Side-by-side person comparison view for duplicate detection. Show conflicting data with merge controls. API has `findDuplicates` and `mergePersons` — needs a visual comparison UI.

---

*All four tracks from the 2026-04-11 competitor gap analysis are complete (A1-A5, B1-B5, C1-C4, D1-D3). Next focus: design system overhaul for polish and consistency.*

