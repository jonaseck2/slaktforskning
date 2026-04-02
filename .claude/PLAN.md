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
Schema migrated from family-centric to GEDCOM-X relationship model (`relationships`, `event_participants`, `assertions` tables). Citation affordances everywhere (badges, Cite buttons, inline source on EventForm). Add Parent/Spouse/Child from PersonDetailView. Component + E2E tests for all v0.3.0 features.

See `.claude/plans/archive/2026-04-02-v030-evidence-and-add-related.md` and `.claude/plans/archive/2026-04-02-component-and-e2e-tests.md` for implementation details.

### Done (v0.3.1 — GEDCOM-X Name Parts + Person Identifiers)
Extended `person_names` with prefix/suffix/patronymic/qualifier columns. New `person_identifiers` table with typed external IDs. Full API + IPC + MCP + Vue UI. Also implemented `deletePersonName`.

See `.claude/plans/archive/2026-04-02-gedcomx-name-parts-and-identifiers.md` for implementation details.

### Done (v0.3.2 — PersonDetailView UX Improvements)
Inline sex editing in header; name rows clickable (edit button removed); relationship rows get delete button; AddRelatedPersonModal New/Existing toggle with PersonPicker.

See `.claude/plans/archive/2026-04-02-person-detail-ux.md` for implementation details.

---

## Roadmap

### v0.4.0 — Places

See `.claude/plans/2026-04-02-places.md` for the full implementation plan.

**Prerequisite for v0.5.0 GEDCOM import** (PLAC tags need `findOrCreatePlace`).

- [ ] `src/api/places.ts` — createPlace, getPlace, listPlaces, searchPlaces, updatePlace, deletePlace, findOrCreatePlace
- [ ] IPC channels + preload for places
- [ ] MCP tools: add_place, get_place, list_places, search_places, update_place, delete_place
- [ ] `PlacePicker` component — typeahead search + inline create (like PersonPicker)
- [ ] Fix `EventForm` — `place_name` input currently does nothing; replace with PlacePicker, write `place_id` on save
- [ ] `PlacesView` — place list + add modal; add Places to sidebar
- [ ] `PlaceDetailView` — edit name/type/hierarchy/coordinates; child places list

### v0.4.1 — Visualization

- [ ] Family tree visualization (pedigree chart, descendant chart) — uses `relationships` table

### v0.5.0 — GEDCOM Import/Export

See `.claude/plans/2026-04-02-gedcom.md` for the full implementation plan. **Depends on v0.4.0 Places** (`findOrCreatePlace` used for PLAC tags on import).

- [ ] `src/gedcom/parser.ts` — line-by-line parser → `GedcomNode` tree; handles CONT/CONC
- [ ] `src/gedcom/date.ts` — GEDCOM date strings → `{ date_type, date_value, date_value_end, date_original }`
- [ ] `src/gedcom/importer.ts` — INDI/FAM/SOUR → api/ calls; places via `findOrCreatePlace`; drops REPO, SUBM, OBJE, LDS ordinances
- [ ] `src/gedcom/exporter.ts` — DB → `.ged` string; INDI/FAM/MARR/DIV/places/sources/citations
- [ ] IPC: `gedcom:import` (file dialog → parse → import) + `gedcom:export` (generate → save dialog)
- [ ] MCP tools: `import_gedcom(file_path)`, `export_gedcom(file_path?)`
- [ ] Import/Export buttons on PersonsView
- [ ] **What is dropped on import:** REPO as entity (text only), SUBM, OBJE/multimedia, ASSO, LDS ordinances, `_` custom tags

### v0.6.0 — Research Tools
- [ ] Assertions UI — the schema exists from v0.3; this milestone builds the UI: view/edit what each citation claims, mark assertions as accepted, see conflicts across citations
- [ ] Research audit view — all unsourced entities in one place, ranked by evidence gap
- [ ] Merge/deduplicate persons
- [ ] Media attachments (photos, documents)

### v0.7.0 — Polish
- [ ] Print/export reports (ancestor charts, family group sheets)
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode
