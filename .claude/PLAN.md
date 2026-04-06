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

| Version | Feature / Fix | Archive |
|---------|---------------|---------|
| v0.1.0 | Foundation: SQLite + API layer + Electron shell + MCP (14 tools) + tests | — |
| v0.2.x | Data entry UI, global search, MCP UI tools, Swedish i18n | — |
| v0.3.x | Relationships + evidence, GEDCOM-X name parts, person identifiers, PersonDetailView UX | — |
| v0.4.x | Places layer: API/IPC/MCP/UI; inline-edit polish | — |
| v0.5.x | Visualization (pedigree/hourglass/timeline), citation badges, place addresses, preferred name (tilltalsnamn), search across all name records, PersonName component | — |
| v0.6.0 | GEDCOM 5.5.1 import/export | [archive](plans/archive/2026-04-03-gedcom.md) |
| v0.6.2 | Genney import profile (Swedish places + patronymics) | [archive](plans/archive/2026-04-03-genney-import.md) |
| v0.6.3 | Database switcher | [archive](plans/archive/2026-04-03-database-switcher.md) |
| v0.6.4 | Extended GEDCOM roundtrip (lossless extension tags) | [archive](plans/archive/2026-04-03-gedcom-extended.md) |
| v0.6.5 | Chart enhancements: depth, zoom/scroll, spouses | [archive](plans/archive/2026-04-03-chart-enhancements.md) |
| v0.6.6 | Collapsible visualisation nodes | [archive](plans/archive/2026-04-03-collapsible-viz.md) |
| v0.6.7 | Per-node descendant collapse | [archive](plans/archive/2026-04-03-descendant-collapse.md) |
| v0.6.8 | Tilltalsnamn + smeknamn separation | [archive](plans/archive/2026-04-03-tilltalsnamn-and-smeknamn.md) |
| v0.6.9 | Genney Derby import (Docker + DerbyExtractor.java) | [archive](plans/archive/2026-04-04-genney-derby-import.md) |
| v0.7.0 | Genney full-fidelity import: groups, repos, tasks, media, places fix, OWNER_EVENT, cause, source abstract | — |
| Fix | Stale IPC DB ref after switchDatabase | [archive](plans/archive/2026-04-03-ipc-stale-db.md) |
| Fix | GEDCOM import timeout + asterisk preferred name | [archive](plans/archive/2026-04-03-gedcom-import-performance.md) |
| Fix | GEDCOM import CPU saturation (statement cache) | [archive](plans/archive/2026-04-03-gedcom-import-cpu.md) |
| Fix | GEDCOM couple subtype always 'unknown' | [archive](plans/archive/2026-04-03-gedcom-couple-subtype.md) |
| Fix | Nickname position + asterisk notation in UI | [archive](plans/archive/2026-04-04-nickname-display-and-asterisk-ui.md) |
| Fix | Genney import CPU saturation (per-row db.prepare) | [archive](plans/archive/2026-04-04-genney-cpu-saturation.md) |
| Fix | Genney .backup extraction: use fflate (pure JS) instead of unzip subprocess | [archive](plans/archive/2026-04-04-genney-windows-paths.md) |
| Fix | Genney EVENT_PLACE column names wrong (RID/SPLACEID→EVENT/PLACE); REMARK.TEXT→NOTE | [archive](plans/archive/2026-04-04-genney-column-bugs.md) |
| v0.7.1 | Docs/tests/skills sync: 4 test files for v0.7.0 entities, skill updates, coverage to 88% | — |
| v0.8.0 | MCP tools for groups, repositories, research tasks, media (30 tools); MCP verification loop in skills | [archive](plans/archive/2026-04-04-mcp-agent-workflow.md) |
| Fix | import_gedcom silently swallowed .backup files; add import_genney MCP tool | [archive](plans/archive/2026-04-04-import-genney-mcp-tool.md) |
| v0.9.3 | Fix Genney import crash: TODO.STATUS integer TypeError | [archive](plans/archive/2026-04-04-fix-genney-todo-status.md) |
| v0.9.4 | Fix hourglass chart descendant overlap + auto-center focal | [archive](plans/archive/2026-04-04-hourglass-layout-overlap-fix.md) |
| v0.10.0 | Visualisation as primary view: person panel, drag resize, icon sidebar | [archive](plans/archive/2026-04-04-viz-primary-view.md) |
| v0.10.1 | Fix Genney SEX encoding (0=M, 1=F) and LIVING flag (1=deceased) | [archive](plans/archive/2026-04-04-genney-sex-living-mapping.md) |
| v0.10.2 | Fix hourglass female-focal spouse side + pedigree compact vertical layout | [archive-1](plans/archive/2026-04-04-hourglass-female-focal-spouse-side.md) [archive-2](plans/archive/2026-04-04-pedigree-compact-vertical-layout.md) |
| v0.11.0 | EVENT.cause UI: Orsak field in EventForm/EventList + GEDCOM 2 CAUS export | [archive](plans/archive/2026-04-04-event-cause.md) |
| v0.12.0 | Tree Sanity Checks: 26 checks, QualityView, PersonDetailView banner, MCP tools | [archive](plans/archive/2026-04-04-sanity-checks.md) |
| v0.13.0 | Printable Output: Ancestor Chart, Family Group Sheet, Individual Summary reports | [archive](plans/archive/2026-04-04-printable-output.md) |
| v0.14.0 | Polish: Escape key closes all modals + data backup/restore | [archive](plans/archive/2026-04-04-polish.md) |
| Investigation | GEDCOM Citation Roundtrip: keep current INDI.SOUR/FAM.SOUR behavior (no code changes) | [archive](plans/archive/2026-04-05-gedcom-citation-roundtrip.md) |
| v0.15.0 | Evidence Model Simplification: mention event, citation editing, removed entity-level cite buttons, Genney MENTION import | [archive](plans/archive/2026-04-05-evidence-model-simplification.md) |
| Fix | QualityView: auto-run checks on mount, removed manual run button | — |
| Fix | Relationship EventList: wire CitationBadge on event rows | — |
| v0.16.0 | Research Tasks UI: ResearchTasksView, PersonDetailView section, sidebar badge | [archive](plans/archive/2026-04-04-research-tasks.md) |
| Fix | Reactive quality badge: use contextBridge onDataChanged pattern (postMessage doesn't cross contextIsolation) | [archive](plans/archive/2026-04-05-fix-reactive-quality-badge.md) |
| Fix | ResearchTasksView: table styling, empty person column (persons.get has no names), person editing in expanded row, reactive badge | [archive](plans/archive/2026-04-05-research-tasks-view-fixes.md) |
| Fix | Consistent name rendering: nickname + preferred_name propagated to all views, charts, reports | [archive](plans/archive/2026-04-05-consistent-name-rendering.md) |
| v0.17.0 | Groups UI: GroupsView, GroupDetailView, GroupPicker, PersonDetailView section, sidebar nav icons | [archive](plans/archive/2026-04-05-groups-ui-plan.md) |
| v0.18.0 | Navigation focus persistence: Pinia store, sidebar indicator, cross-view selected person, viz single-click | [archive](plans/archive/2026-04-05-nav-focus-persistence.md) |
| v0.19.0 | Circle chart: full-circle 360° ancestor view, 6 generations, branch-based colors | [archive](plans/archive/2026-04-05-circle-chart.md) |
| v0.20.0 | Ancestor Book Export: static SVG circle chart, ahnentafel list, person summaries, internal PDF links | [archive](plans/archive/2026-04-05-ancestor-book.md) |
| Fix | Circle chart zoom: flex-shrink bug, center-anchored +/- buttons, curved text line spacing | [archive](plans/archive/2026-04-05-circle-chart-zoom-fixes.md) |
| v0.20.7 | GEDCOM import completeness: engagement/adoption types, CAUS, TITL, NOTE xrefs, ImportReport UI | [archive](plans/archive/2026-04-05-gedcom-import-completeness.md) |
| Fix | v0.20.9: WASM OOM after large GEDCOM import — finalize statements, PRAGMA shrink_memory | [archive](plans/archive/2026-04-05-fix-wasm-oom-after-large-gedcom-import.md) |
| Fix | v0.20.10: Systematic WASM heap leak fix — queryOne/queryAll/runSql helpers, all api/ refactored | — |
| v0.21.0 | Persons list: single JOIN query (birth/death date/place), load-more pagination (100/page), remove Living column | [archive](plans/archive/2026-04-05-persons-list-pagination.md) |
| v0.22.0 | View caching: keep-alive + dataVersion store, onActivated reload guard in 5 list views | [archive](plans/archive/2026-04-05-view-caching.md) |
| v0.22.3 | PersonsView infinite scroll + RelationshipsView N+1 IPC fix (paginated JOIN query) | — |
| Fix | v0.22.4: PersonsView UI lockup — correlated subqueries + idx_events_event_type + idx_person_names_person_sort | [archive](plans/archive/2026-04-05-fix-personsview-lockup.md) |
| v0.23.0 | QualityView: standard table layout, caching (Pinia store), background refresh, ignore/unignore per check, person names column | — |
| Fix | v0.23.1: Remove 500-ancestor limit from Ancestor Book export | — |
| Fix | v0.23.2: ReportsView full-width + auto-fit zoom with +/−/Fit controls | — |
| Fix | v0.23.3: Circle chart gen 5-6 radial text — deeper rings, full name+dates visible | — |
| Fix | v0.23.4: All charts: `* ISO` birth + `† ISO` death on separate lines; BOX_H 44→54; fix circle curved-mode gen 5-6 gone; fix circle scroll overflow | — |
| Fix | v0.23.5: Circle gen 6 color lightening reduction; Reports auto-use focal person (remove PersonPicker) | — |
| Fix | v0.23.7: AncestorBook export circle: gen 6 blank — fetchPedigreeTree needs generations=7 not 6 | — |
| v0.24.0 | Media Attachments Phase 1–3: is_missing schema, file copy strategy, media:attach/openFile/getFilePath IPC, MediaView, PersonDetailView media section, i18n, unit tests | [archive](plans/archive/2026-04-04-media.md) |
| v0.24.2 | UX design system — all list views match QualityView (GroupsView + PersonsView/RelationshipsView/PlacesView/SourcesView/ResearchTasksView/ReportsView) | [archive](plans/archive/2026-04-05-ux-design-system.md) |
| Fix | v0.24.1: Quality checks CPU saturation on large trees — 4-way event_participants self-join → 2-query+JS; V8 CPU profiling infrastructure; performance-profiling skill | [archive](plans/archive/2026-04-06-checks-performance.md) |
| v0.25.0 | GEDCOM media import/export: inline+top-level OBJE on INDI/FAM/events, export OBJE blocks; media section typo fix | [archive](plans/archive/2026-04-05-gedcom-media-import.md) |
| Fix | v0.25.2: Genney import — SPLACE address fields (STREET, POSTALCODE, CITY, COUNTRY) now stored in place address columns | [archive](plans/archive/2026-04-06-genney-address-fields.md) |
| v0.26.0 | Infinite chart expansion: lazy load-more per branch, pedigree arrow ▶ fix | [plan](plans/archive/2026-04-06-infinite-chart-expansion.md) |

---

## Roadmap

Version numbers are not pre-assigned. When a milestone is committed, the version is bumped automatically: **new feature → minor bump**, **fix on existing feature → patch bump**.

### Shared CircleChartSvg component [refactor]
See `.claude/plans/2026-04-05-circle-chart-svg-shared.md` for the full plan.
- [ ] Extract shared `CircleChartSvg.vue` from `CircleChart.vue`
- [ ] Use in `CircleChart.vue` (interactive)
- [ ] Use in `AncestorBookReport.vue` (print/export)

### Workflow Analysis [research]
*High user-focus task — do this in a dedicated session with real usage data.*

Define primary user objectives (add person, record event with source, link family, etc.), map each to current click counts and navigation steps, identify highest-friction paths, and produce a prioritized improvement backlog.

Inputs needed before starting:
- [ ] User session recording or observation (which tasks are done most often?)
- [ ] Heuristic walkthrough of the 5 most common workflows against the current UI
- [ ] Comparison: click count before vs. proposed UI changes

Output: a ranked list of UX improvements with before/after click counts, ready to be planned as individual features.

Use the `interview-synthesis` skill if user research data is available.

### Research Tools [feature]
- [ ] Assertions UI — view/edit what each citation claims, mark accepted, see conflicts
- [ ] Research audit view — all unsourced entities ranked by evidence gap
- [ ] Merge/deduplicate persons

### Evidence Model & Source UX [feature]
See `.claude/plans/2026-04-04-evidence-model.md` for the full plan.
- [ ] CitationBadge on every event row in EventList
- [ ] "Unsourced" filter on PersonsView
- [ ] Quick-cite from EventList row
- [ ] Conflict detection for same event type + different date values

### Assertion GEDCOM Export [feature]
*Depends on: Research Tools + Extended GEDCOM Roundtrip (v0.6.4)*

Custom `0 @Ax@ _ASSN` top-level records for lossless assertion roundtrip.
- [ ] `_ASSN` record format: `_SUBJECT_TYPE`, `_SUBJECT_ID`, `_ATTRIBUTE`, `_VALUE`, `_CONFIDENCE`, `_ACCEPTED`, `SOUR`, `NOTE`
- [ ] Exporter: emit one `_ASSN` record per `assertions` row
- [ ] Importer: read `_ASSN` records in a post-pass, recreate assertions
- [ ] Unit tests: assertion roundtrip for person/event/relationship/place subjects

### Polish [feature]
- [x] Keyboard navigation — Escape key closes all modals
- [x] Data backup and restore
- [ ] Add-person icon refinement — replace the current "Add" button in list views with a dashed-circle "+" icon (consistent with the chart expand style)
- [x] Dark mode — global html.dark CSS overrides, toggle button in sidebar, localStorage persistence
- [x] Cmd/Ctrl+F — focus sidebar search input
- [ ] Undo/redo

