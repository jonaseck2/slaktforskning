# Developing Släktforskning

A guide for contributors and anyone building from source.

## Prerequisites

- Node.js 22 or later
- npm

## Setup

```bash
git clone https://github.com/jonaseck2/slaktforskning.git
cd slaktforskning
npm install
npm start              # Launch in dev mode (Vite HMR)
```

## Common Commands

```bash
npm start              # Launch in dev mode (Vite HMR)
npm test               # Unit tests (Vitest, ~1 200 tests)
npm test -- --coverage # With coverage report (80% threshold on src/api/)
npm run lint           # ESLint (must pass with 0 errors before committing)
npx playwright test    # E2E tests (requires Xvfb on Linux)
npm run make           # Build installer for current platform
npm run make:mac       # macOS .dmg
npm run make:win       # Windows .exe
npm run make:linux     # Linux .deb + .rpm
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

## Project Structure

```
src/
├── api/         # Business logic — pure TypeScript, no Electron deps
├── main/        # Electron main process (windows, database, IPC)
├── preload/     # Context bridge (renderer ↔ main)
├── renderer/    # Vue 3 app (views, components, composables)
└── mcp/         # MCP server for AI agent access
tests/
├── unit/        # Vitest tests for src/api/
└── e2e/         # Playwright smoke tests
docs/
├── PLAN.md          # Vision, status, roadmap
├── DATA_MODEL.md    # Schema design, GEDCOM compatibility
├── MCP.md           # MCP server tool reference
└── IPC_REFERENCE.md # window.api surface + IPC channel mapping
```

## Architecture Overview

`src/api/` is the single source of truth for all business logic — **zero Electron imports**. Both the IPC handlers (`src/main/ipc.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

See [CLAUDE.md](CLAUDE.md) for the complete architecture reference, domain types, schema, and component patterns.

## Dev Container

A dev container is included for development without a local setup. Unit tests, linting, and packaging all work inside the container. E2E tests need Xvfb first:

```bash
source .devcontainer/xvfb-start.sh
npx playwright test
```

`npm start` does not work in the container (no display). Use `npm test` and `npm run make` instead.

## Debugging

Launch with Chrome DevTools Protocol for renderer inspection:

```bash
./.devcontainer/dev-debug.sh          # CDP on port 9222
./.devcontainer/dev-debug.sh 9223 19242  # Custom ports for parallel instances
```

## MCP Dev Server

A development MCP server with additional tools for UI automation, chart inspection, and test data:

```bash
npx tsx src/mcp/devServer.ts
```

Adds 15 dev-only tools on top of the 34 production tools — UI screenshot/click/fill, chart inspection, seed/clear test data, and app status checks. See [docs/MCP.md](docs/MCP.md).

## Testing

### Unit Tests

Tests live in `tests/unit/` and test `src/api/` directly with an in-memory SQLite database. New features need corresponding tests; bug fixes need a regression test.

### E2E Tests

Tests in `tests/e2e/` cover app launch and MCP server connectivity. Run on Linux with Xvfb; CI runs them on Ubuntu automatically.

### WCAG Contrast Tests

`tests/unit/wcagContrast.test.ts` verifies all color token combinations meet WCAG 2.1 AA/AAA thresholds. Run this whenever you change a color token:

```bash
npx vitest run tests/unit/wcagContrast.test.ts
```

## Gazetteer Build Scripts

25 bundled gazetteers covering Scandinavia, North America, and the world. To rebuild:

```bash
npx tsx scripts/build-sv-parishes.ts   # Swedish parishes (Wikidata)
npx tsx scripts/build-world.ts         # World gazetteers (GeoNames)
# See scripts/build-*.ts and scripts/fetch-*.ts for all 19 scripts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions, commit message format, version bump rules, and PR guidelines.
