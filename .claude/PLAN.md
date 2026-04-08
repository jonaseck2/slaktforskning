# Plan: Släktforskning

Local-first desktop genealogy app (Electron + Vue 3 + SQLite) with a built-in MCP server for AI agent access. Full architecture reference: `CLAUDE.md`. Historical context: `.claude/plans/archive/PLAN.md`.

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
---

## Roadmap

Version numbers are not pre-assigned. When a milestone is committed, the version is bumped automatically: **new feature → minor bump**, **fix on existing feature → patch bump**.

Fixes, investigations, and refactors archived in [plans/archive/PLAN.md](plans/archive/PLAN.md).

#### macOS 26 Tahoe: packaged app crash (EXC_BREAKPOINT) [investigation]
See [plan](plans/2026-04-08-macos26-electron-crash.md). `npm start` works; only packaged app affected.

#### Workflow Analysis [research]
*High user-focus task — do this in a dedicated session with real usage data.*

Define primary user objectives, map to current click counts, identify highest-friction paths, produce prioritized improvement backlog. Use `interview-synthesis` skill if user research data is available.

#### Polish [feature]
- [ ] Undo/redo

