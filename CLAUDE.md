# CLAUDE.md

This file provides context for AI agents working on this codebase.

## Project Overview

Släktforskning is a cross-platform desktop genealogy application built with Electron, Vue 3, and TypeScript. It stores family tree data locally in SQLite and exposes an MCP server so agents can manipulate data without the UI.

## Tech Stack

- **Runtime:** Electron 41 (Chromium + Node.js)
- **Frontend:** Vue 3 + Vue Router + Pinia (state management)
- **Build:** Electron Forge + Vite
- **Database:** SQLite via node-sqlite3-wasm (WAL mode, foreign keys enabled)
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
│   ├── router.ts  # Routes: /, /families, /sources, /persons/:id, /families/:id, /sources/:id
│   ├── main.ts    # Vue bootstrap
│   ├── views/     # List views (Persons, Families, Sources) + detail views (*DetailView)
│   ├── components/# Shared: PersonPicker, DateInput, EventForm, EventList, CitationForm
│   └── constants/ # GEDCOM event types, date types, confidence levels, source types
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
npm test           # Run unit tests (Vitest, 30 tests)
npx playwright test  # Run E2E tests (app launch + MCP server)
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

## Testing

### Unit Tests (Vitest)

Unit tests live in `tests/unit/` and cover the api/ layer with an in-memory SQLite database. Config: `vitest.config.mts`.

```
tests/unit/
├── helpers.ts         # createTestDb() — in-memory SQLite with schema
├── persons.test.ts    # Person + PersonName CRUD
├── families.test.ts   # Family + child linking
├── events.test.ts     # Life events
└── sources.test.ts    # Sources + citations
```

Run with `npm test`.

### E2E Tests (Playwright)

E2E tests live in `tests/e2e/` and verify the app launches and the MCP server responds. Config: `playwright.config.ts`.

- **App smoke test:** Spawns `electron-forge start`, verifies it outputs "Launched Electron"
- **MCP server test:** Spawns the MCP server, sends an `initialize` JSON-RPC message, verifies a `serverInfo` response

Run with `npx playwright test`.

### SQLite Note

The project uses `node-sqlite3-wasm` (pure WebAssembly) instead of `better-sqlite3` (native C++ addon). This eliminates the need to rebuild native modules when switching between system Node and Electron — the same WASM binary works in both environments. Key API difference: parameter binding uses arrays (`stmt.run([a, b])`) instead of spread args (`stmt.run(a, b)`).

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
8. **Update documentation** — After completing a feature, update all relevant docs:
   - `README.md` — User-facing overview, features, quick start, project structure
   - `CLAUDE.md` — Agent-facing architecture, commands, conventions
   - `.claude/SPEC.md` — Mark items as done, update implementation status

## Multi-Window

Each `BrowserWindow` runs an independent Vue app instance. All windows share the same main process and SQLite database. New windows: `Cmd+N` / `Ctrl+N`.

## Related Docs

- **`.claude/SPEC.md`** — Product spec: vision, design decisions, data model rationale, roadmap
- **`README.md`** — Human-facing quick start and overview

## Skills

### Project Skills (`.claude/skills/` — checked into repo)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/commit` | When committing | Always `git add -A`, compose message, never skip files |
| `/test` | When running/writing tests | Unit test patterns (Vitest), E2E patterns (Playwright) |
| `/electron-dev` | When launching/debugging the app | Dev mode, IPC debugging, common issues, architecture |
| `/mcp-dev` | When adding/testing MCP tools | Tool patterns, server testing, end-to-end checklist |
| `/data-modeling` | Schema design questions | Genealogy data model guidance |
| `/gedcom` | GEDCOM import/export work | GEDCOM 5.5.1/7.0 parsing, validation, compliance |
| `/interview-synthesis` | Processing user research | Extract insights from interviews/surveys |
| `/web-research` | Competitive analysis | Research genealogy platforms and features |

### Required Global Skills (`~/.claude/skills/` — install on each machine)

These skills are assumed to be available but are NOT in the repo (they're personal/global). Install them on a new machine with:

```bash
# Anthropic official — UI design system
npx skills add anthropics/skills --skill frontend-design -y -g

# Browserbase — browser automation (browser, fetch, functions)
npx skills add browserbase/skills -y -g
```

After running these commands, `~/.claude/skills/` should contain:

| Skill | Source | Purpose |
|-------|--------|---------|
| `frontend-design` | `anthropics/skills` | Design system & aesthetic philosophy for UI generation |
| `browser` | `browserbase/skills` | Automate web browser interactions |
| `fetch` | `browserbase/skills` | Fetch and process web content |
| `functions` | `browserbase/skills` | Serverless browser automation |

The `napkin` and `simplify` skills are also recommended but come built-in with Claude Code.

### Built-in Skills (always available, no install needed)

- `anthropic-skills:skill-creator` — Create and optimize skills
- `anthropic-skills:pdf`, `anthropic-skills:docx`, `anthropic-skills:xlsx`, `anthropic-skills:pptx` — Document formats
- `napkin` — Per-repo runbook (auto-curated every session)
- `simplify` — Code review for reuse, quality, efficiency

## Conventions

- Use UUIDs (v4) for all primary keys
- Dates stored as ISO strings; genealogy dates use `date_type` + `date_original` to preserve uncertainty
- SQLite in WAL mode with foreign keys enforced
- No global database singletons in api/ — always pass `db` as parameter
- **Always keep documentation up to date** — After finishing a feature, update `README.md`, `CLAUDE.md`, and `.claude/SPEC.md` to reflect the new state. Documentation for both agents and humans must stay in sync with the codebase.
- **Always commit ALL files** — Use `git add -A` when committing. Never selectively skip files.
