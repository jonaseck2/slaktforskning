# Contributing to Släktforskning

Thank you for your interest in contributing to Släktforskning! This document provides guidance for participating in the project.

## Getting Started

### Prerequisites

- Node.js 22 or later
- npm

### Initial Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/slaktforskning.git
   cd slaktforskning
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development app:
   ```bash
   npm start
   ```

### Running Tests and Linting

Before committing, always run:

```bash
npm run lint          # ESLint code style check
npm test              # Unit tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright, optional)
```

Unit tests must pass. Linting must pass with zero errors.

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the patterns in `CLAUDE.md`.

3. **Write tests** for new features and regression tests for bug fixes.

4. **Run checks before committing**:
   ```bash
   npm run lint && npm test
   ```

5. **Commit with a clear message** (see Commit Messages section below).

6. **Version bump**: Update `package.json` version:
   - Patch (`x.y.Z`) for bug fixes
   - Minor (`x.Y.0`) for new features
   - Only bump when the feature or fix is complete and tested

7. **Open a Pull Request** against `main` with a clear description of the changes.

## Commit Messages

Follow these conventions:

- Use **imperative mood**: "add feature" not "added feature"
- Start with a **type prefix**:
  - `feat:` — new feature or capability
  - `fix:` — bug fix
  - `docs:` — documentation only
  - `chore:` — build, dependencies, tooling (no code change)
  - `refactor:` — code restructure without feature change
  - `test:` — test-only changes

Examples:
```
feat: add place gazetteer resolver
fix: correct event date parsing for partial years
docs: update API reference
refactor: consolidate person name validation
test: add citation linking tests
```

## Architecture

Släktforskning is structured to separate concerns:

- **`src/api/`** — Pure TypeScript business logic with **zero Electron imports**. This is the single source of truth for all genealogy operations.
- **`src/main/`** — Electron main process. IPC handlers in `src/main/ipc.ts` bridge the renderer and api/.
- **`src/renderer/`** — Vue 3 UI. All requests go through `window.api.*` IPC channels.
- **`src/mcp/`** — Model Context Protocol server. Uses the same api/ functions as IPC handlers.

**Key principle**: Both IPC handlers and MCP tools call the same api/ functions. All api/ functions take a `Database` instance as the first argument (dependency injection, no singletons).

For the complete architecture reference, see `CLAUDE.md`.

## Testing

### Unit Tests

Unit tests live in `tests/unit/` and test `src/api/` directly with an in-memory SQLite database:

```bash
npm test
npm test -- --coverage
```

New features require corresponding tests. Bug fixes should include a regression test.

### End-to-End Tests

E2E tests in `tests/e2e/` use Playwright to test app launch and MCP server connectivity:

```bash
npx playwright test
```

These are optional during development but are run in CI.

## Code of Conduct

This project adheres to the Contributor Covenant 2.1. See `CODE_OF_CONDUCT.md` for details. By participating, you agree to maintain a respectful and inclusive community.

## Questions?

- Open a GitHub issue for bug reports or feature requests
- Check `CLAUDE.md` for architecture details
- Check `docs/` for design docs and implementation guides

Thank you for contributing!
