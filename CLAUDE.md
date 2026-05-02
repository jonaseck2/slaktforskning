# Släktforskning — Project Instructions

## ⚠️ Prime Directive: Data Fidelity

**The user's data is sacred. The DB holds exactly what the user authored — nothing inferred is added, nothing authored is silently removed.**

The genealogist authored what is in the database. Every other value is derived at read time from what they authored. This is non-negotiable, project-defining, never-violated.

**What is "inferred data":**
- Coordinates resolved from a place name via a gazetteer
- A "best guess" date computed from a `date_original` string
- A "looks like" value from a typo-tolerance heuristic
- A normalized version of a value when the original is preserved elsewhere
- ANY value an algorithm produced that the user did not type, click, or import

**The rule:**
- The DB stores **only** what the user actively wrote (UI, modal, picker, MCP tool call) or what was in the file they imported.
- The resolver / formatter / display layer computes inferred values **on demand**, every render, against the current gazetteers/rules. Users never see stale inference.
- Any code path that writes inferred output back to the DB is a bug. Catch yourself at the point of `places.update`, `events.update`, `INSERT INTO`, or any mutation — if the value being written wasn't authored by a human action *in this session*, stop.
- **Authored values are not discarded by side effect.** Hiding a field in the UI is not consent to null it out on save. If a value was written by a human action, it stays in the DB until *another* explicit human action removes it (an empty field, a "Clear" button, a delete). A mutation builder writes what the form says — it never second-guesses which fields the new entity-shape "should" have. Modal patterns like `cause: form.event_type === 'death' ? form.cause : null` discard authored data based on a UI mode change and are a Prime Directive violation.

**Why this matters:**
- Persisted inferences pin the database to a specific version of the inferring code. Improving the resolver/gazetteer/parser later doesn't fix old rows.
- The user can't tell what they authored vs what we made up. Their corrections are silently overwritten by our guesses.
- Genealogy is a long-term archive; future researchers depend on data fidelity, not whatever we thought was "helpful" in 2026.

**Allowed exceptions (these are not inferences — they are deterministic derivations of authored input):**
- `normalized_name` from `name` (lowercase + strip diacritics — pure function of the authored value, used only for SQL collation).
- `created_at` / `updated_at` timestamps.
- UUIDs.

**If a feature seems to need inferred persistence to work, it's the wrong design.** Compute on render. Cache in memory if needed for performance. Never write back to the DB.

This rule applies to: import paths, MCP tools, IPC handlers, Vue components, AI agents, scripts, migrations. Everywhere. No exceptions.

## Project Overview

Släktforskning is a cross-platform desktop genealogy app built with Electron + Vue 3 + TypeScript. All data stays local in SQLite. A built-in MCP server lets AI agents read/write genealogy data without the UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 (Chromium + Node.js) |
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vue Router + Pinia |
| Build | Electron Forge + Vite |
| Database | SQLite via node-sqlite3-wasm (WAL mode, foreign keys on) |
| MCP Server | @modelcontextprotocol/sdk (stdio transport) |
| Language | TypeScript throughout |

## Architecture

### Key Principle

`src/api/` is the single source of truth for all business logic. It has **zero Electron dependencies**. Both the Electron IPC handlers (`src/main/ipc/*.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

**Worker Thread:** All 130+ DB-touching IPC channels run in a dedicated Node.js Worker Thread (`src/main/db-worker.ts`). The Electron main thread handles only Electron-specific operations (dialog, shell, BrowserWindow, printToPDF, fs for import/export). This keeps the main thread unblocked and eliminates click stutter. Worker startup is fire-and-forget; calls are queued until the worker signals `ready`.

### File Map

Top-level layout — run `ls src/<dir>/` for the leaves.

```
src/
├── api/                  # Pure TS business logic — NO Electron imports. CRUD per entity, schema.ts, types.ts.
│   ├── link-rules/       # Default link rule sets per locale (sv, en, de, da, no, universal)
│   ├── html_site/        # Website export helpers (snapshot, scope, redact, thumbnails)
│   └── place-gazetteers/ # Render-time place resolution. data/ holds 27 bundled JSON files (~42 MB).
├── gazetteer-build/      # Shared utils for gazetteer build scripts (geo, sparql, geonames, wikidata, tree, io)
├── shared/channels/      # Typed IPC channel registry — one defineChannel() per channel, per-domain files
├── main/                 # Electron main process: index.ts, database.ts, settings.ts, db-worker.ts, ipc/*
├── preload/index.ts      # contextBridge — hand-maintained window.api map (preload-coverage.test.ts enforces parity)
├── renderer/             # Vue 3 app — App.vue, router.ts, views/, components/, components/ui/, components/modals/,
│                         # composables/, directives/, utils/chart-layout/, constants/, styles/{tokens,shared}.css
├── static/               # Static SPA entry (website export target) — App.vue, router.ts, static-api.ts, views/
└── mcp/                  # createProdServer.ts (34 workflow tools), createDevServer.ts (+ 15 dev tools), server.ts, devServer.ts

tests/
├── unit/                 # Vitest against in-memory SQLite. createTestDb() in helpers.ts.
└── e2e/                  # Playwright against packaged binary. AppDriver in fixture.ts.

docs/                     # PLAN.md (roadmap), DATA_MODEL.md, MCP.md, IPC_REFERENCE.md, UX_INVENTORY.md (per-surface Purpose + CTA grid), plans/ (active + archive/)
.claude/                  # napkin.md (auto-curated runbook), skills/ (auto-discovered project skills)
.devcontainer/            # Linux dev container with Node 22 + Electron deps + Xvfb
```

## Common Commands

```bash
npm start              # Dev mode (Vite HMR)
npm run lint           # ESLint (must pass with 0 errors before committing)
npm test               # Vitest unit + component tests (~2120 tests, 80% coverage threshold on src/api/)
npm run test:e2e       # Package + Playwright (~30s end-to-end). Use `npx playwright test` if `out/` is already built.
npm run package        # Package for current platform
npm run make           # Build distributable installers
npm run build:static   # Build static SPA bundle (dist-static/)
npm run dev:static     # Dev server for static SPA at localhost:5174
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

Each `BrowserWindow` runs an independent Vue app sharing the same main process and SQLite DB. New windows: `Cmd+N` / `Ctrl+N`.

Reference docs (load on demand): `docs/PLAN.md` (roadmap), `docs/DATA_MODEL.md`, `docs/MCP.md`, `docs/IPC_REFERENCE.md`, `.claude/napkin.md`.

## Skills

`oss-release`, `oss-triage`, `oss-stale`, `oss-welcome` are invoked by a scheduled maintainer agent on the public GitHub repo, not interactively by developers. Ignore them in normal coding work.

## Workflow

**Plan format:** every plan in `docs/plans/` follows [`.claude/rules/plans.md`](.claude/rules/plans.md) — User goal first, full pattern scope (deviations explicit), verification by user-observable outcome, RCA footer for follow-up plans. **Subagent dispatch:** use the `subagent-handoff` skill (project-local prompt templates centering user goals over spec compliance).

**Plan-driven work → worktree + subagents.** After `writing-plans` finishes, create a git worktree (`superpowers:using-git-worktrees`) and then invoke `superpowers:subagent-driven-development` (with `subagent-handoff` templates). Do not present the execution-approach choice to the user. Plans are by definition multi-task work that benefits from isolation and fresh-context subagents.

**Finishing a plan (do every time, not optional):** when the last task's spec + quality reviews pass, run this checklist before invoking `superpowers:finishing-a-development-branch`:
1. Mark every checkbox in the plan file as `[x]` (Self-review checklist included). Skill / rule updates the plan called for must already have landed in commits.
2. Move the plan file (and its `-design.md` sibling if any) to `docs/plans/archive/` via `git mv`.
3. Final version bump in `package.json` matching the largest change shipped (any feature → minor; fix-only refactor → patch) and add a `## Unreleased` line in `CHANGELOG.md` summarising the plan.
4. Commit `chore: archive completed <plan-name>` + the bump.
5. Merge worktree → `main` (`finishing-a-development-branch` Option 1), delete the branch, remove the worktree.

**Small fixes → main is fine.** One-off typo fixes, i18n tweaks, single-file bug fixes, or any change that doesn't warrant a plan file can be done directly on `main` without a worktree.

**Plan + spec path convention (overrides superpowers defaults):** All plan and design-spec files live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. `superpowers:brainstorming` and `superpowers:writing-plans` default to `docs/superpowers/specs/`; **always override** with an explicit `docs/plans/` path. Before committing, if any file lives under `docs/superpowers/` or `.claude/plans/`, move it to `docs/plans/` first.

