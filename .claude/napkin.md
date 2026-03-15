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
1. **[2026-03-15] node-sqlite3-wasm uses array parameter binding**
   Do instead: always pass parameters as arrays — `stmt.run([a, b])`, `stmt.get([id])`, `stmt.all([x, y])`. Spread args (`stmt.run(a, b)`) only bind the first parameter.

2. **[2026-03-15] node-sqlite3-wasm `.get()` returns undefined, not null**
   Do instead: always use `?? null` when wrapping `.get()` calls that should return `T | null`.

3. **[2026-03-15] node-sqlite3-wasm has no `.pragma()` method**
   Do instead: use `db.exec('PRAGMA journal_mode = WAL')` instead of `db.pragma('journal_mode = WAL')`.

## Domain Behavior Guardrails
1. **[2026-03-15] API layer must stay Electron-free**
   Do instead: never import from `electron` in `src/api/`. All api/ functions take `db: Database` as first arg. Both IPC handlers and MCP server consume the same api/.

2. **[2026-03-15] Vite must externalize node-sqlite3-wasm**
   Do instead: keep `node-sqlite3-wasm` and all `builtinModules` in `vite.main.config.ts` → `build.rollupOptions.external`.

3. **[2026-03-15] Research before fixing — the approach may be the problem**
   Do instead: when a tool/library causes repeated friction, research alternatives before applying more workarounds. The switch from better-sqlite3 to node-sqlite3-wasm exemplifies this.

## User Directives
1. **[2026-03-15] Commit all files — don't skip any**
   Do instead: always include every changed file when committing. Check `git status` and stage everything.

2. **[2026-03-15] Skills live in .claude/skills/, spec in .claude/SPEC.md**
   Do instead: place all Claude-specific config under `.claude/`. Keep skills in `.claude/skills/`, product spec in `.claude/SPEC.md`.

3. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Do instead: prefer simple solutions over elaborate workarounds. WASM-based SQLite eliminated all native module rebuild complexity.
