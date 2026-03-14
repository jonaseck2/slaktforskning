# CLAUDE.md

This file provides context for AI agents working on this codebase.

## Project Overview

Släktforskning is a cross-platform desktop genealogy application built with Electron, Vue 3, and TypeScript. It stores family tree data locally in SQLite and exposes an MCP server so agents can manipulate data without the UI.

## Tech Stack

- **Runtime:** Electron 41 (Chromium + Node.js)
- **Frontend:** Vue 3 + Vue Router + Pinia (state management)
- **Build:** Electron Forge + Vite
- **Database:** SQLite via better-sqlite3 (WAL mode, foreign keys enabled)
- **MCP Server:** @modelcontextprotocol/sdk (stdio transport)
- **Language:** TypeScript throughout

## Architecture

```
src/
├── api/           # Pure TypeScript business logic — NO Electron imports
│   ├── types.ts   # Domain types (Person, Family, Event, Source, Citation, Place)
│   ├── schema.ts  # SQLite DDL and migrations
│   ├── persons.ts # Person + PersonName CRUD
│   ├── families.ts# Family + PersonFamilyLink CRUD
│   ├── events.ts  # Life event CRUD
│   └── sources.ts # Source + Citation CRUD
├── main/          # Electron main process
│   ├── index.ts   # App lifecycle, window creation, menu
│   ├── database.ts# SQLite connection management
│   └── ipc.ts     # IPC handlers bridging renderer ↔ api/
├── preload/       # contextBridge — exposes window.api to renderer
│   └── index.ts
├── renderer/      # Vue 3 application
│   ├── App.vue    # Root layout with sidebar navigation
│   ├── router.ts  # Routes: /, /families, /sources
│   ├── main.ts    # Vue bootstrap
│   └── views/     # Page components (PersonsView, FamiliesView, SourcesView)
└── mcp/           # MCP server (runs standalone via tsx)
    └── server.ts  # Tool definitions wrapping api/ functions
```

### Key design principle

The `src/api/` layer is the single source of truth for all business logic. It has zero Electron dependencies. Both the Electron IPC handlers (`src/main/ipc.ts`) and the MCP server (`src/mcp/server.ts`) call into the same api/ functions. When adding new features, implement the logic in api/ first, then expose it via IPC and MCP.

All api/ functions take a `Database` instance as their first argument (dependency injection).

## Data Model

The database schema follows the Genealogical Proof Standard with these core entities:

- **persons** → **person_names** (1:many, supports birth/married/alias names)
- **families** (partner_a, partner_b) → **person_family_links** (children, with relationship_type)
- **events** (birth, death, marriage, etc.) linked to a person or family
- **places** (hierarchical, with optional lat/lng)
- **sources** → **citations** (with confidence 0-3, transcription text)

Schema is defined in `src/api/schema.ts`. The `initializeSchema()` function is idempotent (uses CREATE IF NOT EXISTS).

## Common Commands

```bash
npm start          # Launch the Electron app in dev mode
npm run package    # Package for current platform
npm run make       # Build distributable installers
npm run lint       # Run ESLint
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

## MCP Server

The MCP server at `src/mcp/server.ts` provides these tools:

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

The MCP server uses the same SQLite database as the Electron app. The DB path defaults to the platform's app data directory but can be overridden with `SLAKTFORSKNING_DB` env var.

## Adding New Features

1. Define types in `src/api/types.ts`
2. Add/update schema in `src/api/schema.ts`
3. Implement CRUD functions in the appropriate `src/api/*.ts` file
4. Register IPC handlers in `src/main/ipc.ts`
5. Expose via preload in `src/preload/index.ts`
6. Add MCP tools in `src/mcp/server.ts`
7. Build Vue UI in `src/renderer/`

## Multi-Window

Each `BrowserWindow` runs an independent Vue app instance. All windows share the same main process and SQLite database. New windows: `Cmd+N` / `Ctrl+N`.

## Skills

The `skills/` directory contains genealogy-specific Claude skills:

- **data-modeling** — Genealogy data schema design guidance
- **gedcom** — GEDCOM format parsing, validation, compliance
- **interview-synthesis** — Extract insights from user research
- **web-research** — Competitive analysis of genealogy platforms

## Conventions

- Use UUIDs (v4) for all primary keys
- Dates stored as ISO strings; genealogy dates use `date_type` + `date_original` to preserve uncertainty
- SQLite in WAL mode with foreign keys enforced
- No global database singletons in api/ — always pass `db` as parameter
