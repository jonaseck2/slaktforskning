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

### Done (v0.1.0)

- [x] SQLite database with full schema (persons, names, families, links, events, places, sources, citations)
- [x] API layer with CRUD for all entities (persons, families, events, sources, citations, places)
- [x] Electron app with multi-window support (Cmd/Ctrl+N)
- [x] Vue 3 renderer with sidebar navigation (Persons, Families, Sources)
- [x] IPC bridge connecting renderer to API layer (all channels wired)
- [x] MCP server with 14 tools covering all CRUD operations
- [x] Unit tests (Vitest) covering the full API layer
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
- [x] All unit tests passing, app launches correctly

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

### Done (v0.2.3 — Swedish i18n + MCP Parity)

- [x] **vue-i18n**: Swedish (sv) default locale, English (en) fallback, persisted to localStorage
- [x] **~180 translation strings** covering all UI text: event types, date types, confidence levels, source types, union types, relationship types, name types, all labels/placeholders/titles
- [x] **Swedish terminology**: Förnamn/Efternamn, Vigsel, Kyrkobok, Husförhörslängd, härad, ca/före/efter date prefixes
- [x] **Language switcher** in sidebar (SV / EN)
- [x] All 6 views + 4 components updated to use `$t()` / `useI18n()`
- [x] **MCP parity**: Expanded MCP server from 14 to 34 tools, matching full IPC surface:
  - Person: `add_person_name`, `get_person_names`
  - Family: `get_family`, `update_family`, `delete_family`, `get_children_of_family`, `get_families_of_person`, `search_families`
  - Events: `get_event`, `get_events_for_family`, `update_event`, `delete_event`
  - Sources: `get_source`, `update_source`, `delete_source`, `search_sources`
  - Citations: `get_citation`, `get_citations_for_source`, `get_citations_for_event`, `delete_citation`
- [x] `.claude/MCP.md` updated to document all 34 data + 5 UI tools

---

## Roadmap

### v0.3.0 — Data Model Migration (Relationships + Evidence)

This version migrates the core schema from a family-centric model to a source-first, relationship-centric model. It is the highest-risk change because it touches all layers (DB, API, IPC, MCP, Vue) and is a breaking schema change. Do it early, before the data model is locked in by more UI.

#### Schema Migration: Relationships + Event Participants

The `families` and `person_family_links` tables are replaced by a `relationships` table (GEDCOM-X model). Events lose their `person_id`/`family_id` columns and gain an `event_participants` junction table. Assertions are added to the schema now, with UI deferred.

See `.claude/DATA_MODEL.md` for the full schema specification.

**New tables:**

```sql
-- Replaces families + person_family_links
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,         -- 'couple' | 'parent_child' | 'sibling' | 'godparent' | 'other'
  person1_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  person2_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  subtype TEXT,               -- couple: 'marriage'|... parent_child: 'biological'|...
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Replaces event.person_id / event.family_id
CREATE TABLE event_participants (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  role TEXT,                  -- 'primary' | 'spouse' | 'parent' | 'child' | 'witness' | ...
  UNIQUE(event_id, person_id)
);

-- Assertions: schema now, UI deferred
CREATE TABLE assertions (
  id TEXT PRIMARY KEY,
  citation_id TEXT REFERENCES citations(id) ON DELETE CASCADE,
  subject_type TEXT,          -- 'person' | 'relationship' | 'event' | 'place'
  subject_id TEXT,
  attribute TEXT,
  value TEXT,
  value_original TEXT,
  confidence INTEGER,
  is_accepted INTEGER,
  notes TEXT,
  created_at TEXT
);
```

**Modified tables:**

- `events`: Remove `person_id`, `family_id`; add `relationship_id` FK (optional)
- `citations`: Add `relationship_id` FK, `place_id` FK (in addition to existing `event_id`, `person_id`)
- `places`: Add `place_type` ('farm' | 'parish' | 'härad' | 'county' | 'province' | 'country' | 'city' | 'village' | 'other'), `date_from`, `date_to`

**Implementation checklist:**

- [x] Update `src/api/schema.ts` with new DDL (idempotent, use `IF NOT EXISTS`)
- [ ] Write migration script for existing databases (families → relationships, events.person_id → event_participants) — deferred, no production data yet
- [x] Add `src/api/relationships.ts` (CRUD for relationships and event_participants)
- [x] Update `src/api/events.ts` to use event_participants instead of person_id/family_id
- [x] Update `src/api/sources.ts` (citations now accept relationship_id, place_id)
- [x] Update `src/api/types.ts` with new domain types
- [x] Write unit tests for new API functions (37 tests passing)
- [x] Update IPC handlers in `src/main/ipc.ts`
- [x] Update preload in `src/preload/index.ts`
- [x] Update MCP server with relationship tools
- [x] Update Vue views/components to use new model
- [x] Run `npm test` — 37 tests passing
- [x] Update CLAUDE.md to reflect new schema

#### Evidence Visibility & Citation Affordances

Every claim in the database should visibly trace back to a source, and it should be easy to add citations from where you're working — not just from the source detail view.

**Unsourced indicators:**
- [x] Events in `EventList` show a citation count badge (e.g. "2 sources") or an "unsourced" warning indicator
- [x] `PersonDetailView` shows an evidence summary: how many events are sourced vs. unsourced
- [ ] A "research audit" view aggregates all unsourced entities across the tree — deferred to v0.6.0

**"Cite" action on events, persons, and relationships:**
- [x] Each event row in `EventList` gets a "Cite" button → opens `CitationForm` pre-linked to that event's `event_id`
- [x] `PersonDetailView` gets a "Cite Person" button → opens `CitationForm` with `person_id` pre-filled
- [x] Relationship views get a "Cite Relationship" button → opens `CitationForm` with `relationship_id` pre-filled

**Optional source prompt on event creation:**
- [x] `EventForm` includes an optional "Source" section at the bottom (source picker + page)
- [x] When filled, creating the event also creates a citation in one step
- [x] When empty, event is created without a citation (shows "unsourced" indicator)

#### Add Related Person from Detail View

From the person detail view, the user can:
- [x] **Add Parent** — Creates a new person + creates a `parent_child` relationship
- [x] **Add Spouse/Partner** — Creates a new person + creates a `couple` relationship. Prompts for subtype (marriage, civil_union, etc.)
- [x] **Add Child** — Creates a new person + creates a `parent_child` relationship

Each action opens a modal with new person fields + relationship context pre-filled. Both person and relationship are created in a single transaction.

### v0.3.1 — GEDCOM-X Name Parts + Person Identifiers

See `.claude/plans/2026-04-02-gedcomx-name-parts-and-identifiers.md` for the full implementation plan.

- [ ] Extend `person_names` with `name_prefix`, `name_suffix`, `patronymic_base`, `name_qualifier` — enables Swedish patronymics (Eriksson/Eriksdotter) and noble particles (von Linné)
- [ ] New `person_identifiers` table — typed external IDs (FamilySearch, Ancestry, Riksarkivet, personnummer, REFN, RIN)
- [ ] API + IPC + MCP tools for person identifiers (`add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`)
- [ ] PersonDetailView: prefix/suffix/qualifier displayed in names table; fields added to add/edit name modals
- [ ] PersonDetailView: external identifiers section (add/delete)

### v0.3.2 — PersonDetailView UX Improvements

See `.claude/plans/2026-04-02-person-detail-ux.md` for the full implementation plan.

- [ ] PersonDetailView: inline sex editing — select in header replaces static badge
- [ ] PersonDetailView: name rows clickable (row click = edit modal); edit button removed; delete button kept with `@click.stop`
- [ ] PersonDetailView: relationship rows gain a delete button with `@click.stop`; row click still navigates to detail
- [ ] AddRelatedPersonModal: "New / Existing" toggle — PersonPicker for existing persons; skip person creation when "Existing" is chosen

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
