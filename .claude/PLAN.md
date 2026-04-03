# Plan: Släktforskning

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

## Implementation Status

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
GEDCOM-X relationship model, citation affordances, Add Related Person modal. See `.claude/plans/archive/2026-04-02-v030-evidence-and-add-related.md`.

### Done (v0.3.1 — GEDCOM-X Name Parts + Person Identifiers)
Name prefix/suffix/patronymic/qualifier columns; `person_identifiers` table with typed external IDs. See `.claude/plans/archive/2026-04-02-gedcomx-name-parts-and-identifiers.md`.

### Done (v0.3.2 — PersonDetailView UX Improvements)
Inline sex editing; clickable name rows; relationship delete button; AddRelatedPersonModal New/Existing toggle. See `.claude/plans/archive/2026-04-02-person-detail-ux.md`.

### Done (v0.4.0 — Places)
Full places layer: API, IPC, 6 MCP tools, PlacePicker, PlacesView + PlaceDetailView. See `.claude/plans/archive/2026-04-02-places.md`.

### Done (v0.4.1 — Minor Fixes & UX Consistency)
Inline-edit polish across PersonDetailView, RelationshipDetailView, PlaceDetailView. See `.claude/plans/archive/2026-04-03-detail-view-ux-consistency.md`.

### Done (v0.5.0 — Visualization)
Pedigree/Hourglass/Timeline SVG charts; click-to-navigate; `chartLayout.ts` + `chartData.ts` utilities. See `.claude/plans/archive/2026-04-03-visualization-impl.md`.

### Done (v0.5.1 — UI Consistency Polish)
EventList rows clickable (no Edit button); PlacePicker + PersonPicker get `width: 100%` for consistent sizing everywhere; PlaceDetailView parent place constrained to grid column. See `.claude/plans/archive/2026-04-03-ui-consistency.md`.

### Done (v0.5.2 — Sourcing & Citation Consistency)
`CitationBadge` component; `getCitationsForPerson/Relationship/Place` API + IPC + MCP; Cite button + badge in PersonDetailView, RelationshipDetailView, PlaceDetailView headers; badges in PersonsView list. See `.claude/plans/archive/2026-04-03-sourcing-and-citations.md`.

### Done (v0.5.3 — Place Address Fields)
`street`, `postal_code`, `city`, `country` columns on `places`; `createPlace`/`updatePlace` accept new fields; MCP `add_place`/`update_place` schemas updated; PlaceDetailView Address section; PlacePicker shows postal_code/city subtitle. See `.claude/plans/archive/2026-04-03-place-address.md`.

### Done (v0.5.4 — Tilltalsnamn)
`preferred_name` on `person_names`; `getDisplayGivenName()` helper; `listPersons`/`searchPersons` return and search by preferred_name; MCP `add_person_name`/`update_person_name` accept preferred_name; PersonDetailView underlines tilltalsnamn token in name rows and shows input field for birth names; PersonsView + PersonPicker display call name. See `.claude/plans/archive/2026-04-03-preferred-name.md`.

### Done (v0.5.5 — Search Across All Name Records)
`searchPersons` searches all `person_names` rows via EXISTS subquery — finds by married surname or preferred_name on any name record, not just the primary. See `.claude/plans/archive/2026-04-03-name-search.md`.

### Done (v0.6.0 — GEDCOM Import/Export)
GEDCOM 5.5.1 parser (`parseGedcom`), date parser (`parseGedcomDate`/`formatGedcomDate`), importer (INDI/FAM/SOUR → api/ calls, places via `findOrCreatePlace`), exporter (INDI/FAM/HUSB/WIFE/CHIL/events/sources/citations), IPC (`gedcom:import`/`gedcom:export` with Electron file dialogs), MCP tools (`import_gedcom`, `export_gedcom`), Import/Export buttons on PersonsView. 31 unit tests. See `.claude/plans/archive/2026-04-03-gedcom.md`.

### Done (v0.6.2 — Genney Import Profile)
`swedishPlace.ts` (hierarchical Swedish place parser), `swedishNames.ts` (patronymic detector), `importer.ts` extended with `profile: 'genney'` option: `_UID`/`_YHAPLOGROUP`/`_MHAPLOGROUP` tags, patronymic detection, Swedish place hierarchy. `gedcom:import` IPC + `import_gedcom` MCP gain optional `profile` param. "Importera från Genney" button + modal in PersonsView. 231 unit tests. See `.claude/plans/archive/2026-04-03-genney-import.md`.

### Done (v0.5.6 — PersonName Component & Consistent Underline)
`PersonName.vue` shared component + `nameUtils.ts` utility extract the tilltalsnamn underline into one place. All name-rendering sites updated: RelationshipsView, SearchView, VisualizationView header, PersonPicker dropdown, and all three SVG charts (PedigreeChart, HourglassChart, TimelineChart via `<tspan text-decoration>`). Duplicate `givenNameParts()` functions and CSS removed from PersonsView and PersonDetailView. See `.claude/plans/archive/2026-04-03-person-name-component.md`.

---

## Roadmap

### v0.7.0 — Research Tools
- [ ] Assertions UI — the schema exists from v0.3; this milestone builds the UI: view/edit what each citation claims, mark assertions as accepted, see conflicts across citations
- [ ] Research audit view — all unsourced entities in one place, ranked by evidence gap
- [ ] Merge/deduplicate persons
- [ ] Media attachments (photos, documents)

### v0.7.1 — Tree Sanity Checks (Data Quality)

See `.claude/plans/2026-04-03-sanity-checks.md` for the full plan.

- [ ] `src/api/checks.ts` — CheckResult type + ~25 checks across 6 categories (chronological, parenthood age, family structure, relationship integrity, geographic, completeness)
- [ ] IPC + preload: `checks:runAll`, `checks:forPerson`
- [ ] MCP: `run_checks`, `run_checks_for_person`
- [ ] `QualityView` at `/quality` — grouped by severity, filter chips, re-run button
- [ ] PersonDetailView inline banner for errors/warnings
- [ ] Sidebar "Datakvalitet" entry with error count badge
- [ ] Unit tests: `checks.test.ts` with known-bad and clean DB seeds; MCP tests

### v0.8.0 — Polish
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode

### v0.9.0 — Printable Output

See `.claude/plans/2026-04-03-printable-output.md` for the full plan.

- [ ] IPC: `print:print` (OS print dialog) + `print:exportPdf` (save PDF via `printToPDF`)
- [ ] `ReportsView` at `/reports` — three tabs: Ancestor Chart, Family Group Sheet, Individual Summary
- [ ] `AncestorChartReport.vue` — pedigree SVG reusing `chartData.ts`, configurable generations
- [ ] `FamilyGroupSheet.vue` — couple + events + children, structured A4 layout
- [ ] `IndividualSummary.vue` — full person record: names, events, relationships, citations
- [ ] Print CSS (`@media print`) per report component; preview area in ReportsView
- [ ] Sidebar entry "Rapporter"; i18n sv/en
- [ ] Component tests for report components
