# Släktforskning

A local-first, cross-platform desktop app for genealogy research. Your family tree, your data, your machine.

[![CI](https://github.com/jonaseck2/slaktforskning/actions/workflows/ci.yml/badge.svg)](https://github.com/jonaseck2/slaktforskning/actions/workflows/ci.yml)
[![Release](https://github.com/jonaseck2/slaktforskning/actions/workflows/release.yml/badge.svg)](https://github.com/jonaseck2/slaktforskning/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<!-- TODO: replace with a real screenshot -->
<!-- ![Släktforskning screenshot](docs/screenshot.png) -->

---

## What is this?

Släktforskning is a desktop genealogy application built with Electron, Vue 3, and SQLite. All data stays on your machine — no cloud account, no subscription, no upload. A built-in MCP server lets AI agents like Claude read and write your genealogy data through natural conversation. The interface is available in Swedish and English.

## Features

- **Local SQLite database** — no cloud, no account, full data ownership
- **GEDCOM 5.5.1 & 7.0** import and export
- **Family tree charts** — pedigree, hourglass, descendant, fan, timeline
- **Keepsake reports** — A Life, A Marriage, Place Chronicle, Your Ancestors, Photo Album, and more
- **Place resolution** with 25 bundled gazetteers covering Scandinavia, North America, and the world
- **Source citations** with confidence levels and verbatim transcriptions
- **Built-in MCP server** — 34 tools for AI-powered genealogy research
- **Multi-window** — open multiple windows for different parts of your tree
- **Accessibility** — screen reader mode, high contrast theme, keyboard navigation, TTS
- **Swedish and English** interface

## Installation

Download the latest installer from the [Releases](https://github.com/jonaseck2/slaktforskning/releases) page:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |
| Windows | `.exe` (Squirrel installer) |
| Linux | `.deb` / `.rpm` |

> **Note:** Builds are currently unsigned. macOS will show a Gatekeeper warning on first launch — right-click the app and choose Open to bypass it. Windows may show a SmartScreen warning.

## Getting Started

The app opens with a sidebar showing **Persons**, **Relationships**, **Sources**, and more.

- Click **Add Person** to create your first person
- Click any row to open the detail view — add names, events, and citations there
- Use **Cmd+N** (macOS) or **Ctrl+N** (Windows/Linux) to open a second window for side-by-side research
- Import an existing tree via **Settings > Import** (GEDCOM, Genney, or Holger format)

## MCP Server

Släktforskning includes a built-in MCP server that lets AI agents interact with your genealogy data. Use Claude Desktop or Claude Code to research, write narratives, audit sources, and manage your tree through natural conversation.

### Claude Desktop setup

Add this to your `claude_desktop_config.json`:

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

### Claude Code setup

The repo includes a `.mcp.json` that Claude Code picks up automatically when you open the project.

The server exposes 34 tools covering persons, families, events, sources, places, research tasks, media, and data management. See [docs/MCP.md](docs/MCP.md) for the full tool reference.

## Development

```bash
git clone https://github.com/jonaseck2/slaktforskning.git
cd slaktforskning
npm install
npm start       # Launch in dev mode
npm test        # Unit tests
npm run lint    # ESLint
```

See [DEVELOPING.md](DEVELOPING.md) for the full developer guide — build commands, dev container, debugging, gazetteer scripts, and architecture overview.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions, commit format, and PR guidelines.

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT — see [LICENSE](LICENSE).
