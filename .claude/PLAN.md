# Plan: Släktforskning

## Vision

A local-first, cross-platform desktop genealogy application that gives researchers full control of their data while being natively agent-friendly — allowing AI assistants to read, write, and reason about family tree data without a GUI.

## Design Goals

1. **Local-first** — All data stored on the user's machine in SQLite. No cloud accounts, no subscriptions, no data leaving the device unless the user exports it.
2. **Multi-window** — Desktop-class UX with multiple simultaneous windows into the same database (e.g., person detail + family view side-by-side).
3. **Cross-platform** — Runs on macOS, Windows, and Linux from a single codebase.
4. **Agent-friendly** — A built-in MCP server lets AI agents perform full CRUD operations on the database without the UI, enabling agentic workflows like automated data entry, research assistance, and GEDCOM import.
5. **Research-grade** — Data model follows the Genealogical Proof Standard: Source → Citation → Assertion. Preserves uncertainty, conflicting evidence, and original source text.

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Electron 41 | Rich ecosystem, agent-friendly (Playwright/DevTools), cross-platform, mature |
| Frontend | Vue 3 + Pinia | Lightweight, good TS support, less opinionated than React for a desktop app |
| Build system | Electron Forge + Vite | Official Electron tooling, fast HMR, good native module support |
| Database | SQLite via node-sqlite3-wasm | Zero-config, single-file, WASM-based — no native rebuild needed for Electron vs system Node |
| Agent interface | MCP (stdio transport) | Standard protocol for AI tool use; Claude, GPT, etc. can call it directly |
| Language | TypeScript throughout | Single language for main process, renderer, API layer, and MCP server |

### Alternatives Considered

- **Tauri** — Smaller binary, Rust backend. Rejected: less mature agent tooling (no Playwright for WebView2), smaller ecosystem.
- **React** — More popular but heavier; Vue's Composition API fits the desktop UI better.
- **better-sqlite3** — Native C++ addon with excellent performance, but requires recompilation when switching between system Node and Electron's Node fork. Replaced with node-sqlite3-wasm to eliminate the constant rebuild problem.
- **Prisma / Drizzle ORM** — Rejected in favor of raw SQL for simplicity and full control over genealogy-specific queries.
- **PostgreSQL** — Rejected: local-first goal means no server process. SQLite is the right fit.

## Architecture

```
src/api/     → Pure business logic (zero Electron deps)
src/main/    → Electron main process (windows, DB, IPC)
src/preload/ → Context bridge (renderer ↔ main)
src/renderer/→ Vue 3 UI
src/mcp/     → MCP server (standalone, same API layer)
```

**Key principle:** `src/api/` is the single source of truth. Both the Electron IPC handlers and the MCP server call the same functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

---

## Implementation Status

### Done (v0.1.0)

- [x] SQLite database with full schema (persons, names, families, links, events, places, sources, citations)
- [x] API layer with CRUD for all entities (persons, families, events, sources, citations, places)
- [x] Electron app with multi-window support (Cmd/Ctrl+N)
- [x] Vue 3 renderer with sidebar navigation (Persons, Families, Sources)
- [x] IPC bridge connecting renderer to API layer (all channels wired)
- [x] MCP server with 14 tools covering all CRUD operations
- [x] Unit tests (30 tests, Vitest) covering the full API layer
- [x] E2E tests (Playwright) for app launch and MCP server connectivity
- [x] Project documentation (CLAUDE.md for agents, README.md for humans)
- [x] Migrated from better-sqlite3 to node-sqlite3-wasm (no more native rebuild issues)
- [x] WASM loading works in both dev and packaged builds
- [x] Stale Emscripten lock file cleanup on database open
- [x] Preload script filename collision fixed (preload.js vs index.js)
- [x] Renderer build output included in packaged app (asar)
- [x] Debug logging in IPC handlers

### Done (v0.2.0 — Genealogy Data Entry UI)

Replaced `prompt()` dialogs with proper form-based data entry exposing the full GEDCOM-aligned data model.

- [x] **Shared components**: PersonPicker (typeahead search), DateInput (compound date with type/value/end/original), EventForm (modal create/edit), EventList (table with CRUD), CitationForm (modal with confidence levels)
- [x] **Constants**: GEDCOM event types (22 types, person vs family split), date types, confidence levels, source types, union types, relationship types, name types
- [x] **PersonDetailView** (`/persons/:id`): Header with sex badge + deceased indicator, names list (add/edit with name_type), EventList, families section (with partner name enrichment), notes (auto-save)
- [x] **FamilyDetailView** (`/families/:id`): Partners with PersonPicker (auto-save), union type/notes, children list (PersonPicker + relationship_type), family EventList
- [x] **SourceDetailView** (`/sources/:id`): Editable field grid (auto-save), citations table with confidence badges, CitationForm
- [x] **PersonsView updated**: Modal form (given_name, surname, sex, living, notes), clickable rows → detail, sex + living columns
- [x] **FamiliesView updated**: Modal with PersonPicker for partners + union_type, clickable rows → detail, partner names in table
- [x] **SourcesView updated**: Full form modal (title, author, source_type, publication_info, repository, url), clickable rows → detail
- [x] **Router**: Added `/persons/:id`, `/families/:id`, `/sources/:id` detail routes
- [x] All 30 unit tests passing, app launches correctly

### Done (v0.2.1 — Global Search)

- [x] `searchFamilies` and `searchSources` API functions
- [x] `families:search` and `sources:search` IPC channels + preload
- [x] `/search` route with `SearchView.vue` — results in three sections (Persons, Families, Sources)
- [x] Sidebar search input in `App.vue` navigates to `/search?q=...` on Enter

### Done (v0.2.2 — MCP UI Tools)

- [x] `src/main/ui-server.ts` — HTTP server (port 19241) wrapping `webContents` APIs
- [x] UI tools in MCP server: `ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js`
- [x] `window.__vue_router` exposed in renderer for clean route pushes
- [x] Graceful error when app is not running

---

## Roadmap

### v0.3.0 — Research-Focused Data Entry

Two features that make the app research-grade: adding related persons in context, and making evidence visible everywhere.

#### Add Related Person from Detail View

The primary workflow in genealogy research is: you're looking at a person and you discover a related person (parent, spouse, child) in a source. You want to add that person *and* the relationship in one action, not create the person separately and then wire up the family.

**Feature: "Add Related Person" from PersonDetailView**

From the person detail view, the user can:
- **Add Parent** — Creates a new person + creates/finds a family where the current person is a child. If one parent already exists in a family, the new person is added as the other partner.
- **Add Spouse/Partner** — Creates a new person + creates a new family with both as partners. Prompts for union type.
- **Add Child** — Creates a new person + adds them as a child to an existing family (if the current person is a partner in one), or creates a new family first.

Each action opens a modal with:
1. New person fields (given name, surname, sex)
2. Relationship context (automatically set: e.g. "Child of [current person]", "Spouse of [current person]")
3. Optional: select existing family (if the current person has multiple families) or create new

On save, both the person and the family link are created in a single transaction, and the detail view refreshes.

This replaces the current workflow of: navigate to Persons list → Add Person → navigate back → navigate to Families → create/find family → add the person as partner/child.

#### Evidence Visibility & Citation Affordances

The data model already supports Source → Citation → Event/Person linking, but the GUI hides this and citations can't link to families. Every claim in the database should visibly trace back to a source, and it should be easy to add citations from where you're working — not just from the source detail view.

**Schema: add `family_id` to citations**

Currently `citations` has `event_id` and `person_id` but no `family_id`. Add `family_id TEXT REFERENCES families(id) ON DELETE SET NULL` so sources can be linked directly to families (e.g. a marriage certificate cites the family, not just the marriage event). Update the Citation type, API functions (`getCitationsForFamily`), IPC channel, preload, and MCP tools accordingly.

**Unsourced indicators**

- Events in `EventList` show a citation count badge (e.g. "2 sources") or an "unsourced" warning indicator when no citations exist for that event.
- `PersonDetailView` shows an overall evidence summary: how many events are sourced vs. unsourced.
- `FamilyDetailView` shows the same for family events.

**"Cite" action on events, persons, and families**

- Each event row in `EventList` gets a "Cite" button that opens `CitationForm` pre-linked to that event's `event_id`.
- `PersonDetailView` gets a "Cite Person" button (for general identity citations not tied to a specific event). Opens `CitationForm` with `person_id` pre-filled.
- `FamilyDetailView` gets a "Cite Family" button. Opens `CitationForm` with `family_id` pre-filled.
- After saving, citation count badges update immediately.

**Citation list on detail views**

- `PersonDetailView` shows a "Citations" section listing all citations linked to the person (both directly via `person_id` and indirectly via their events).
- `FamilyDetailView` shows a "Citations" section listing all citations linked to the family (via `family_id` and family events).
- Clicking a citation navigates to the source detail view.

**Optional source prompt on event creation**

- `EventForm` includes an optional "Source" section at the bottom: source picker + page/transcription fields.
- When filled, creating the event also creates a citation in one step.
- When left empty, the event is created without a citation (but shows the "unsourced" indicator).

This ensures the GUI encourages evidence-based research without blocking data entry when a source isn't immediately at hand.

### v0.4.0 — Visualization & Navigation
- [ ] Family tree visualization (pedigree chart, descendant chart)
- [ ] Place management UI and place autocomplete

### v0.5.0 — GEDCOM Import/Export
- [ ] GEDCOM 5.5.1 import
- [ ] GEDCOM 5.5.1 export
- [ ] GEDCOM 7.0 support

### v0.6.0 — Research Tools
- [ ] Assertion layer (Source → Citation → Assertion, per Genealogical Proof Standard)
- [ ] Merge/deduplicate persons
- [ ] Media attachments (photos, documents)

### v0.7.0 — Polish
- [ ] Print/export reports (ancestor charts, family group sheets)
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode
