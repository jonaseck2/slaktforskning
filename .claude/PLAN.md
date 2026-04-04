# Plan: Släktforskning

Local-first desktop genealogy app (Electron + Vue 3 + SQLite) with a built-in MCP server for AI agent access. Full architecture reference: `CLAUDE.md`. Historical context: `.claude/plans/archive/plan.md`.

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
| v1.0.0 | Visualisation as primary view: person panel, drag resize, icon sidebar | [archive](plans/archive/2026-04-04-viz-primary-view.md) |
| v1.0.1 | Fix Genney SEX encoding (0=M, 1=F) and LIVING flag (1=deceased) | [archive](plans/archive/2026-04-04-genney-sex-living-mapping.md) |
| v1.0.2 | Fix hourglass female-focal spouse side + pedigree compact vertical layout | [archive-1](plans/archive/2026-04-04-hourglass-female-focal-spouse-side.md) [archive-2](plans/archive/2026-04-04-pedigree-compact-vertical-layout.md) |
| v1.1.0 | EVENT.cause UI: Orsak field in EventForm/EventList + GEDCOM 2 CAUS export | [archive](plans/archive/2026-04-04-event-cause.md) |
| v1.2.0 | Tree Sanity Checks: 26 checks, QualityView, PersonDetailView banner, MCP tools | [archive](plans/archive/2026-04-04-sanity-checks.md) |

---

## Roadmap

Version numbers are not pre-assigned. When a milestone is committed, the version is bumped automatically: **new feature → minor bump**, **fix on existing feature → patch bump**.

### Research Tools [feature]
- [ ] Assertions UI — view/edit what each citation claims, mark accepted, see conflicts
- [ ] Research audit view — all unsourced entities ranked by evidence gap
- [ ] Merge/deduplicate persons

### Research Tasks UI [feature]
See `.claude/plans/2026-04-04-research-tasks.md` for the full plan.
- [ ] ResearchTasksView at `/research-tasks` — list, filter, status chips
- [ ] PersonDetailView "Forskningstips" section
- [ ] Sidebar badge for open tasks
- [ ] MCP tools

### Media Attachments [feature]
See `.claude/plans/2026-04-04-media.md` for the full plan.
- [ ] Decide file storage strategy (copy vs reference)
- [ ] File handling + Genney archive extraction
- [ ] MediaView at `/media`
- [ ] Inline sections in PersonDetailView, SourceDetailView, EventList

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

### Printable Output [feature]
See `.claude/plans/2026-04-03-printable-output.md` for the full plan.
- [ ] IPC: `print:print` + `print:exportPdf`
- [ ] `ReportsView` at `/reports` — Ancestor Chart, Family Group Sheet, Individual Summary tabs
- [ ] Print CSS + preview area

### Polish [feature]
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode
