# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-03-15] Always commit ALL changed files, including .claude/ config**
   Do instead: run `git status` before committing and stage every modified/untracked file. Never selectively skip files without explicit user instruction.

2. **[2026-03-15] Run tests and verify they pass before committing**
   Do instead: run `npm test` and `npx playwright test` before each commit. Only commit when green.

3. **[2026-03-15] GPG signing fails in non-interactive agent context**
   Do instead: if GPG signing is enabled and commit fails with "Bad PIN", tell user immediately and suggest `git config --local commit.gpgsign false`.

## Shell & Command Reliability
1. **[2026-03-15] better-sqlite3 native module version mismatch**
   Do instead: after `npm install`, run `npx electron-rebuild -f -w better-sqlite3` before launching the Electron app. Run `npm rebuild better-sqlite3` before running unit tests with system Node.

2. **[2026-03-15] better-sqlite3 `.get()` returns undefined, not null**
   Do instead: always use `?? null` when wrapping `.get()` calls that should return `T | null`.

## Domain Behavior Guardrails
1. **[2026-03-15] API layer must stay Electron-free**
   Do instead: never import from `electron` in `src/api/`. All api/ functions take `db: Database.Database` as first arg. Both IPC handlers and MCP server consume the same api/.

2. **[2026-03-15] Vite must externalize native modules**
   Do instead: keep `better-sqlite3` and all `builtinModules` in `vite.main.config.ts` → `build.rollupOptions.external`.

## User Directives
1. **[2026-03-15] Commit all files — don't skip any**
   Do instead: always include every changed file when committing. Check `git status` and stage everything.

2. **[2026-03-15] Skills live in .claude/skills/, spec in .claude/SPEC.md**
   Do instead: place all Claude-specific config under `.claude/`. Keep skills in `.claude/skills/`, product spec in `.claude/SPEC.md`.

3. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Do instead: prefer native modules and simple solutions over elaborate workarounds (e.g., disable asar rather than fighting native module bundling).
