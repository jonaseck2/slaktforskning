# Släktforskning

A cross-platform desktop genealogy application. Store, organize, and research your family tree locally with full data ownership.

## Features

- **Local-first** — All data stays on your machine in a SQLite database
- **Multi-window** — Open multiple windows to work on different parts of your tree simultaneously
- **Cross-platform** — Runs on macOS, Windows, and Linux
- **Agent-friendly** — Built-in MCP server lets AI agents read and write genealogy data
- **Research-grade data model** — Supports the Genealogical Proof Standard with proper source → citation → assertion separation
- **GEDCOM-aligned events** — Birth, death, marriage, divorce, christening, burial, census, immigration, emigration, naturalization, occupation, residence, education, military, and more
- **Flexible dates** — Exact, approximate, before, after, between, and unknown date types with original source text preserved
- **Source citations** — Link sources to events or persons with confidence levels (0–3) and verbatim transcriptions

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

The app opens with a sidebar navigation for **Persons**, **Relationships**, and **Sources**.

- **Click "Add Person/Relationship/Source"** to open a form dialog
- **Click any row** to open its detail view (events, names, relationships, citations)
- **Cmd+N** (macOS) or **Ctrl+N** (Windows/Linux) to open additional windows

## Data Model

The database captures the full complexity of genealogical research:

- **Persons** with multiple names (birth, married, alias)
- **Relationships** (couple, parent-child, sibling, godparent) with subtypes (marriage, biological, adopted, etc.)
- **Events** (birth, death, marriage, baptism, immigration, census, etc.) with flexible date handling and multi-person participation via roles
- **Places** with hierarchical structure (farm → parish → härad → county), types, and optional coordinates
- **Sources and Citations** linking to events, persons, relationships, and places with confidence levels and verbatim transcriptions

## MCP Server

The app includes an MCP server that lets AI agents interact with your genealogy data programmatically.

### Setup

The project includes a `.mcp.json` that Claude Code picks up automatically. For other MCP clients, point them at:

```bash
npx tsx src/mcp/server.ts
```

### Available Tools

- **Persons:** `create_person`, `list_persons`, `search_persons`, `get_person`, `update_person`, `delete_person`, `add_person_name`, `get_person_names`
- **Relationships:** `create_relationship`, `list_relationships`, `search_relationships`, `get_relationship`, `update_relationship`, `delete_relationship`, `get_relationships_of_person`
- **Events:** `add_event`, `get_events_for_person`, `get_events_for_relationship`, `add_event_participant`, `get_event_participants`
- **Sources:** `add_source`, `add_citation`, `list_sources`, `search_sources`

### Custom Database Path

By default the database is stored in your OS app data directory. Override with:

```bash
SLAKTFORSKNING_DB=/path/to/my.db npx tsx src/mcp/server.ts
```

## Building

```bash
# Package for current platform
npm run package

# Build distributable installers
npm run make
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41 |
| Frontend | Vue 3 + Vue Router + Pinia |
| Build | Electron Forge + Vite |
| Database | SQLite (node-sqlite3-wasm) |
| Agent interface | MCP (stdio) |
| Language | TypeScript |

## Testing

```bash
npm test              # Unit tests (Vitest, 37 tests)
npx playwright test   # E2E tests (app launch + MCP server)
```

## Project Structure

```
src/
├── api/              # Business logic (pure TypeScript, no Electron deps)
├── main/             # Electron main process (windows, database, IPC)
├── preload/          # Context bridge (renderer ↔ main)
├── renderer/
│   ├── views/        # List views + detail views (Person, Relationship, Source)
│   ├── components/   # Shared: PersonPicker, DateInput, EventForm/List, CitationForm
│   └── constants/    # GEDCOM event types, date types, confidence levels
└── mcp/              # MCP server for agent access
.claude/
├── PLAN.md           # Vision, implementation status, roadmap
├── DATA_MODEL.md     # Schema design, GEDCOM compatibility
├── MCP.md            # MCP server tools and UI bridge reference
└── skills/           # Claude skills (commit, test, electron-dev, mcp-dev, domain)
tests/
├── unit/             # Vitest API layer tests
└── e2e/              # Playwright smoke tests
```

## Documentation

- **[README.md](README.md)** — This file. Quick start and overview for humans.
- **[CLAUDE.md](CLAUDE.md)** — Agent instructions. Architecture, commands, conventions.
- **[.claude/PLAN.md](.claude/PLAN.md)** — Vision, implementation status, roadmap.
- **[.claude/DATA_MODEL.md](.claude/DATA_MODEL.md)** — Schema design, GEDCOM compatibility.
- **[.claude/MCP.md](.claude/MCP.md)** — MCP server tools and UI bridge reference.

## License

MIT
