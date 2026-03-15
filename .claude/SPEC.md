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
| Database | SQLite via better-sqlite3 | Zero-config, single-file, embeddable, synchronous API for simplicity |
| Agent interface | MCP (stdio transport) | Standard protocol for AI tool use; Claude, GPT, etc. can call it directly |
| Language | TypeScript throughout | Single language for main process, renderer, API layer, and MCP server |

### Alternatives Considered

- **Tauri** — Smaller binary, Rust backend. Rejected: less mature agent tooling (no Playwright for WebView2), smaller ecosystem.
- **React** — More popular but heavier; Vue's Composition API fits the desktop UI better.
- **Prisma / Drizzle ORM** — Rejected in favor of raw better-sqlite3 for simplicity and full control over genealogy-specific queries.
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

## Current State (v0.1.0)

### Implemented

- [x] SQLite database with full schema (persons, names, families, links, events, places, sources, citations)
- [x] API layer with CRUD for all entities
- [x] Electron app with multi-window support (Cmd/Ctrl+N)
- [x] Vue 3 renderer with sidebar navigation
- [x] Views for Persons, Families, Sources (basic list + create forms)
- [x] IPC bridge connecting renderer to API layer
- [x] MCP server with 14 tools covering all CRUD operations
- [x] Unit tests (30 tests, Vitest) covering the full API layer
- [x] E2E tests (Playwright) for app launch and MCP server connectivity
- [x] Project documentation (CLAUDE.md for agents, README.md for humans)

### Not Yet Implemented

- [ ] Person detail view (timeline of events, family connections)
- [ ] Family tree visualization (pedigree chart, descendant chart)
- [ ] Place management UI and place autocomplete
- [ ] GEDCOM 5.5.1 import/export
- [ ] GEDCOM 7.0 support
- [ ] Media attachments (photos, documents)
- [ ] Assertion layer (Source → Citation → Assertion, per Genealogical Proof Standard)
- [ ] Search across all entities
- [ ] Merge/deduplicate persons
- [ ] Print/export reports
- [ ] Keyboard navigation and accessibility
- [ ] Data backup and restore
- [ ] Undo/redo
- [ ] Dark mode

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

## MCP Server Tools

The MCP server runs standalone (`npx tsx src/mcp/server.ts`) and provides:

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
