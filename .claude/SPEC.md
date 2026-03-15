# Product Spec: Släktforskning

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

## Data Model

The schema follows the Genealogical Proof Standard. Core entities:

```
persons ──── person_names (1:many — birth, married, alias, aka)
         ├── events (1:many — birth, death, baptism, etc.)
         └── person_family_links (many) ──► families
                                               ├── partner_a (person)
                                               ├── partner_b (person)
                                               └── events (marriage, divorce, etc.)

sources ──── citations (1:many)
                 └── linked to events or persons
                     with confidence (0-3) and verbatim transcription

places (hierarchical, with optional lat/lng)
```

### Key Design Decisions

- **Multiple names per person** — People change names (marriage, adoption, immigration). Each name has a type and optional date range.
- **Gender-neutral partnerships** — Families use `partner_a` / `partner_b`, not husband/wife.
- **Relationship types on child links** — biological, adopted, foster, step, unknown.
- **Flexible dates** — `date_type` (exact/about/before/after/between/calculated/unknown) + `date_original` preserves what the source actually says.
- **UUIDs for all IDs** — No auto-increment; safe for merge/sync scenarios.
- **Confidence on citations** — 0-3 scale matching GEDCOM's QUAY (quality assessment).

## Architecture

```
src/api/     → Pure business logic (zero Electron deps)
src/main/    → Electron main process (windows, DB, IPC)
src/preload/ → Context bridge (renderer ↔ main)
src/renderer/→ Vue 3 UI
src/mcp/     → MCP server (standalone, same API layer)
```

**Key principle:** `src/api/` is the single source of truth. Both the Electron IPC handlers and the MCP server call the same functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

## GEDCOM Compatibility

The data model is designed for GEDCOM roundtrip fidelity:

| App Entity | GEDCOM 5.5.1 | GEDCOM 7.0 |
|-----------|-------------|-----------|
| Person | INDI | INDIVIDUAL_RECORD |
| PersonName | INDI.NAME | INDIVIDUAL_RECORD.PERSONAL_NAME |
| Family | FAM | FAMILY_RECORD |
| PersonFamilyLink | FAM.CHIL + INDI.FAMC | FAMILY_RECORD.CHIL |
| Event | INDI.BIRT/DEAT/etc, FAM.MARR/etc | EVENT_DETAIL |
| Place | PLAC | PLACE |
| Source | SOUR (level 0) | SOURCE_RECORD |
| Citation | SOUR (inline) | SOURCE_CITATION |

See the `gedcom` skill in `.claude/skills/gedcom/` for full GEDCOM reference.

### GEDCOM Event Types

The app should support these standard GEDCOM individual events:
- **Vital:** birth, death, christening, burial, baptism
- **Legal/civic:** immigration, emigration, naturalization, census
- **Life milestones:** occupation, residence, education, military service, retirement, graduation
- **Religious:** confirmation, ordination
- **Estate:** will, probate
- **Other:** custom/other

Family events: marriage, divorce, census, other.

Date qualifiers: exact, about, before, after, between, calculated, unknown — plus `date_original` to preserve source text verbatim (e.g., "abt. 1845", "before Christmas 1900").

## MCP Server Tools

The MCP server runs standalone (`npx tsx src/mcp/server.ts`) and provides:

### Data tools

| Tool | Description |
|------|-------------|
| create_person | Create person with name and sex |
| get_person | Get person by ID |
| list_persons | List all persons |
| search_persons | Search by name |
| update_person | Update sex, living, notes |
| delete_person | Delete a person |
| create_family | Create family unit with partners |
| add_child_to_family | Link a child to a family |
| list_families | List all families |
| add_event | Add life event (birth, death, etc.) |
| get_events_for_person | Get events for a person |
| add_source | Create a source record |
| add_citation | Link source to event/person |
| list_sources | List all sources |

The server shares the same SQLite database as the Electron app. Override the DB path with `SLAKTFORSKNING_DB` env var.

### UI tools (requires Electron app to be running)

When the Electron app is running, it starts a local HTTP server on port 19241 (override with `SLAKTFORSKNING_UI_PORT`). The MCP server's UI tools call this HTTP bridge to observe and control the live app window.

| Tool | Description |
|------|-------------|
| ui_screenshot | Capture the current window as a PNG image |
| ui_navigate | Navigate to a route path (e.g. `/search?q=Erik`) |
| ui_get_dom | Get the full rendered HTML of the current view |
| ui_click | Click an element by CSS selector |
| ui_execute_js | Run arbitrary JavaScript in the renderer and return the result |

**Design:** The Electron main process starts an HTTP server (`src/main/ui-server.ts`) that wraps `webContents` APIs. The standalone MCP server calls `http://127.0.0.1:19241` for UI operations. If the app is not running, UI tools return a descriptive error. The renderer exposes `window.__vue_router` so `ui_navigate` can push Vue Router routes cleanly.

This enables agentic GUI testing workflows: seed data with data tools → navigate to the relevant view → assert the rendered DOM or screenshot matches expectations.

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

---

## Future Roadmap

### v0.3.0 — Visualization & Navigation
- [ ] Family tree visualization (pedigree chart, descendant chart)
- [ ] Search across all entities (persons, families, sources, events)
- [ ] Place management UI and place autocomplete

### v0.4.0 — GEDCOM Import/Export
- [ ] GEDCOM 5.5.1 import
- [ ] GEDCOM 5.5.1 export
- [ ] GEDCOM 7.0 support

### v0.5.0 — Research Tools
- [ ] Assertion layer (Source → Citation → Assertion, per Genealogical Proof Standard)
- [ ] Merge/deduplicate persons
- [ ] Media attachments (photos, documents)

### v0.6.0 — Polish
- [ ] Print/export reports (ancestor charts, family group sheets)
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode
