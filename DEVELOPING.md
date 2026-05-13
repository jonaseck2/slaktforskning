# Developing Släktforskning

A guide for contributors and anyone building from source.

## Prerequisites

- Node.js 22 or later
- npm
- Rust toolchain (`rustup` — the Tauri build needs `cargo`)

## Setup

```bash
git clone https://github.com/jonaseck2/slaktforskning.git
cd slaktforskning
npm install
npm start              # Launch the Tauri app in dev mode
```

The first `npm start` compiles the Rust core from scratch (slow — a few minutes on a cold cache); subsequent starts are incremental (~3 s for Rust changes, instant HMR for Vue).

## Common Commands

```bash
npm start              # Launch the Tauri app in dev mode
npm test               # Unit tests (Vitest)
npm test -- --coverage # With coverage report (80% threshold on src/api/)
npm run lint           # ESLint (must pass with 0 errors before committing)
npm run test:e2e       # E2E tests (Playwright against a built Tauri bundle)
npm run build          # Build native bundle: .app + .dmg (mac), NSIS .exe (Windows), .AppImage (Linux)
npm run build:bin      # Just the raw binary, no bundle (faster — used by e2e / dev)
```

## Project Structure

```
src/
├── api/         # Business logic — runtime-neutral TypeScript
├── shared/      # Cross-runtime helpers (channel registry, worker-state, preview-html-inject, ...)
├── renderer/    # Vue 3 app + tauri-window-api.ts (the window.api wiring) + db-shim.ts
├── static/     # Static SPA entry (website export target)
└── mcp/         # MCP server for AI agent access
src-tauri/
├── src/         # Rust core (db.rs, ui_server.rs, lib.rs, fs/dialog/shell commands)
├── Cargo.toml   # Rust deps (rusqlite, tauri, tauri-plugin-*)
└── tauri.conf.json
tests/
├── unit/        # Vitest tests for src/api/ + src/shared/
├── components/  # Vitest with happy-dom (renderer-side resolver tests, etc.)
└── e2e/         # Playwright tests against the packaged Tauri binary
docs/
├── PLAN.md          # Vision, status, roadmap
├── DATA_MODEL.md    # Schema design, GEDCOM compatibility
├── MCP.md           # MCP server tool reference
└── IPC_REFERENCE.md # window.api surface + channel registry mapping
```

## Architecture Overview

`src/api/` is the single source of truth for all business logic — **runtime-neutral TypeScript**. The renderer's `tauri-window-api.ts` walks the channel registry in `src/shared/channels/` at boot and wires `window.api.*` to each handler. SQLite calls route through `src/renderer/db-shim.ts` to rusqlite in `src-tauri/src/db.rs`. The MCP server calls the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

See [CLAUDE.md](CLAUDE.md) for the complete architecture reference, domain types, schema, and component patterns.

## Dev Container

A dev container is included for development without a local setup. Unit tests, linting, and the Rust build all work inside the container. E2E tests need Xvfb first:

```bash
source .devcontainer/xvfb-start.sh
npm run test:e2e
```

`npm start` does not work in the container (no display). Use `npm test` and `npm run build` instead.

### Dev Container Secrets

The container reads four environment variables from the host via `${localEnv:...}` in `devcontainer.json`. Set these in your shell profile (`.zshrc`, `.bashrc`, etc.) before opening the project in a dev container.

| Variable | Required | Purpose |
|----------|----------|---------|
| `GIT_AUTHOR_NAME` | For git identity | Your full name for commit authorship and `Signed-off-by` trailers. |
| `GIT_AUTHOR_EMAIL` | For git identity | Your email for commit authorship and `Signed-off-by` trailers. |
| `CLAUDE_CODE_OAUTH_TOKEN` | For agentic dev pipeline | Authenticates Claude Code (the AI agent) inside the container. Without it Claude Code will prompt for login on every container rebuild. |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | For GitHub MCP tools | Used by the GitHub MCP server to read/write issues, PRs, and code on your behalf. Needs `repo` + `read:org` scopes. |
| `GIT_SIGNING_KEY` | For DCO-compliant commits | SSH private key used to cryptographically sign commits (shows "Verified" on GitHub). A `prepare-commit-msg` hook also adds `Signed-off-by:` automatically for the DCO trailer. |
| `DISPLAY` | Set automatically | Points to the Xvfb virtual display (`:99`). Set by `postStartCommand`, not the host — listed here for completeness. |

#### Setting up `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`

Add to your shell profile:

```bash
export GIT_AUTHOR_NAME="Your Name"
export GIT_AUTHOR_EMAIL="you@example.com"
```

The `postCreateCommand` script reads these on container creation and runs `git config --global user.name/email` so commits and the `Signed-off-by` hook work from the first commit without any manual setup.

#### Setting up `CLAUDE_CODE_OAUTH_TOKEN`

Run Claude Code on your host machine once to log in:

```bash
claude  # follow the OAuth flow; token is saved to ~/.claude/
```

Then export the token for the container:

```bash
# Find the token
cat ~/.claude/credentials.json

# Add to your shell profile
export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
```

#### Setting up `GITHUB_PERSONAL_ACCESS_TOKEN`

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with **Contents** (read/write), **Pull requests** (read/write), and **Issues** (read/write) permissions for this repository
3. Add to your shell profile:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_..."
```

#### Setting up `GIT_SIGNING_KEY`

Generate a dedicated SSH signing key (or reuse an existing Ed25519 key):

```bash
ssh-keygen -t ed25519 -C "git-signing" -f ~/.ssh/git_signing_key
```

Add the **public key** to GitHub → Settings → SSH and GPG keys → **Signing keys** (not authentication keys):

```bash
cat ~/.ssh/git_signing_key.pub  # paste this into GitHub
```

Export the **private key** for the container:

```bash
export GIT_SIGNING_KEY="$(cat ~/.ssh/git_signing_key)"
```

The `postCreateCommand` script ([.devcontainer/setup-signing.sh](.devcontainer/setup-signing.sh)) writes the key inside the container, configures SSH signing, and installs a global `prepare-commit-msg` hook that appends `Signed-off-by: Name <email>` to every commit automatically.

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
