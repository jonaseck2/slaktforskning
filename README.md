# Släktforskning

A cross-platform desktop genealogy application. Store, organize, and research your family tree locally with full data ownership.

## Features

- **Local-first** — All data stays on your machine in a SQLite database
- **Multi-window** — Open multiple windows to work on different parts of your tree simultaneously
- **Cross-platform** — Runs on macOS, Windows, and Linux
- **Agent-friendly** — Built-in MCP server lets AI agents read and write genealogy data
- **Research-grade data model** — Supports the Genealogical Proof Standard with proper source → citation → assertion separation

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

The app opens with a sidebar navigation for Persons, Families, and Sources. Use **Cmd+N** (macOS) or **Ctrl+N** (Windows/Linux) to open additional windows.

## Data Model

The database captures the full complexity of genealogical research:

- **Persons** with multiple names (birth, married, alias)
- **Families** linking partners and children with relationship types (biological, adopted, foster, step)
- **Events** (birth, death, marriage, baptism, immigration, census, etc.) with flexible date handling (exact, approximate, ranges)
- **Places** with hierarchical structure and optional coordinates
- **Sources and Citations** with confidence levels and verbatim transcriptions

## MCP Server

The app includes an MCP server that lets AI agents interact with your genealogy data programmatically.

### Setup

The project includes a `.mcp.json` that Claude Code picks up automatically. For other MCP clients, point them at:

```bash
npx tsx src/mcp/server.ts
```

### Available Tools

- `create_person`, `list_persons`, `search_persons`, `get_person`, `update_person`, `delete_person`
- `create_family`, `add_child_to_family`, `list_families`
- `add_event`, `get_events_for_person`
- `add_source`, `add_citation`, `list_sources`

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
npm test              # Unit tests (Vitest, 30 tests)
npx playwright test   # E2E tests (app launch + MCP server)
```

## Project Structure

```
src/
├── api/        # Business logic (pure TypeScript, no Electron deps)
├── main/       # Electron main process (windows, database, IPC)
├── preload/    # Context bridge (renderer ↔ main)
├── renderer/   # Vue 3 UI
└── mcp/        # MCP server for agent access
.claude/
├── SPEC.md     # Product spec and design decisions
└── skills/     # Claude skills for genealogy research
tests/
├── unit/       # Vitest API layer tests
└── e2e/        # Playwright smoke tests
```

## Documentation

- **[README.md](README.md)** — This file. Quick start and overview for humans.
- **[CLAUDE.md](CLAUDE.md)** — Agent instructions. Architecture, commands, conventions.
- **[.claude/SPEC.md](.claude/SPEC.md)** — Product spec. Vision, design decisions, roadmap, data model rationale.

## License

MIT
