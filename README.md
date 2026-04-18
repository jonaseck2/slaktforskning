# Släktforskning

A cross-platform desktop genealogy application. Store, organize, and research your family tree locally with full data ownership.

## Features

- **Local-first** — All data stays on your machine in a SQLite database
- **Multi-window** — Open multiple windows to work on different parts of your tree simultaneously
- **Cross-platform** — Runs on macOS, Windows, and Linux
- **Agent-friendly** — Built-in MCP server lets AI agents read and write genealogy data
- **Research-grade data model** — Proper source → citation → assertion separation
- **GEDCOM-aligned events** — Birth, death, marriage, divorce, christening, burial, census, immigration, emigration, naturalization, occupation, residence, education, military, and more
- **Flexible dates** — Exact, approximate, before, after, between, and unknown date types with original source text preserved
- **Source citations** — Link sources to events or persons with confidence levels (0–3) and verbatim transcriptions
- **Screen Reader Mode** — Standalone TTS navigation for visually impaired users with single-key hotkeys and arrow-key family tree traversal
- **High Contrast theme** — WCAG 2.1 AAA compliant high contrast appearance option

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
- **Places** with hierarchical structure (farm → parish → härad → county), types, and optional coordinates. 15 bundled gazetteers provide place resolution for Scandinavia (Sweden, Denmark, Norway, Finland, Iceland), North America (US, Canada), and the world (~244 countries)
- **Sources and Citations** linking to events, persons, relationships, and places with confidence levels and verbatim transcriptions

## MCP Server

The app includes an MCP server that lets AI agents interact with your genealogy data programmatically. With 80+ tools covering persons, relationships, events, sources, places, media, and more, you can use Claude Desktop or Claude Code to research, write narratives, audit sources, and manage your tree through natural conversation.

### Setup

The project includes a `.mcp.json` that Claude Code picks up automatically. For other MCP clients, point them at:

```bash
npx tsx src/mcp/server.ts
```

### AI Agent Access (Claude Desktop)

Configure your `claude_desktop_config.json` to connect Claude Desktop to your genealogy data:

```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/slaktforskning",
      "env": { "SLAKTFORSKNING_DB": "/path/to/your/database.db" }
    }
  }
}
```

See [docs/mcp-workflows/README.md](docs/mcp-workflows/README.md) for the full setup guide.

### Example Workflows

- [Generate a Research Report](docs/mcp-workflows/research-report.md) -- Gather person data and produce a structured summary with gaps and next steps
- [Write a Family History Narrative](docs/mcp-workflows/family-history.md) -- Build a multi-generation story from your tree
- [Audit Source Coverage](docs/mcp-workflows/source-audit.md) -- Find unsourced facts and prioritize research
- [Check and Fix Data Quality](docs/mcp-workflows/data-quality.md) -- Run quality checks and resolve issues
- [Photo Tagging with AI](docs/mcp-workflows/photo-tagging.md) -- Link photos to persons and events

### Available Tools

- **Persons:** `create_person`, `list_persons`, `search_persons`, `get_person`, `update_person`, `delete_person`, `add_person_name`, `get_person_names`
- **Relationships:** `create_relationship`, `list_relationships`, `search_relationships`, `get_relationship`, `update_relationship`, `delete_relationship`, `get_relationships_of_person`
- **Events:** `add_event`, `get_events_for_person`, `get_events_for_relationship`, `add_event_participant`, `get_event_participants`
- **Sources:** `add_source`, `add_citation`, `list_sources`, `search_sources`
- **Import/Export:** `import_gedcom` (GEDCOM 5.5.1/7.0), `import_genney` (Genney 4.1 `.backup`/`.gcc`), `import_holger` (Holger/OurKind GEDCOM export -- `.ged` or `.zip`; handles ENGA/ADOP subtypes, REMA/MISC notes, media path remapping), `export_gedcom`

### Custom Database Path

By default the database is stored in your OS app data directory. Override with:

```bash
SLAKTFORSKNING_DB=/path/to/my.db npx tsx src/mcp/server.ts
```

## Dev Container

A dev container is included for working on the project without a local Node/Electron setup.

```bash
# Open in VS Code — it will prompt to reopen in container
code .
```

**What works in the container:**

```bash
npm test              # Unit + component tests (no display needed)
npm run lint
npm run package       # Builds a Linux distributable
npx tsx src/mcp/server.ts  # MCP server
```

**E2E tests** require a virtual display:

```bash
source .devcontainer/xvfb-start.sh   # start Xvfb on :99
npx playwright test
```

`npm start` (the Electron GUI) does not work in a headless container.

## Accessibility

The app targets WCAG 2.1 AAA compliance:

- **Keyboard navigation** — All interactive elements are reachable via Tab, Enter, Space, and arrow keys
- **Screen reader support** — ARIA roles, labels, and live regions throughout (dialog, combobox, tree, radiogroup)
- **Focus management** — Focus trapping in modals, focus-visible outlines, skip-to-content link
- **Text-to-speech** — Built-in read-aloud feature (Settings > Read aloud) that narrates person, relationship, and source details on navigation
- **Screen Reader Mode** — Standalone mode that narrates every focused element, with single-key hotkeys (`P/R/S/L/T/V/Q/D` to navigate views, `N` to add, `E` to edit, arrow keys for charts) and a `?` command listing
- **High Contrast theme** — WCAG 2.1 AAA high contrast appearance for low-vision users
- **Chart accessibility** — Pedigree chart has ARIA tree roles with keyboard navigation, plus a list view alternative

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
- **[docs/PLAN.md](docs/PLAN.md)** — Vision, implementation status, roadmap.
- **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** — Schema design, GEDCOM compatibility.
- **[docs/MCP.md](docs/MCP.md)** — MCP server tools and UI bridge reference.

## License

MIT
