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

4. **[2026-03-15] Keep PLAN.md in sync with actual implementation state**
   Do instead: when completing or starting work, update `.claude/PLAN.md` checkboxes and move items between sections. The plan is the single source of truth for what's done and what's planned.

5. **[2026-03-15] Write plans to files, not context**
   Do instead: always persist plans, specs, and implementation notes to disk immediately. Context can be lost at any time. Never keep large plans only in conversation context.

## Shell & Command Reliability
1. **[2026-03-15] node-sqlite3-wasm uses array parameter binding**
   Do instead: always pass parameters as arrays — `stmt.run([a, b])`, `stmt.get([id])`, `stmt.all([x, y])`. Spread args (`stmt.run(a, b)`) only bind the first parameter.

2. **[2026-03-15] node-sqlite3-wasm `.get()` returns undefined, not null**
   Do instead: always use `?? null` when wrapping `.get()` calls that should return `T | null`.

3. **[2026-03-15] node-sqlite3-wasm has no `.pragma()` method**
   Do instead: use `db.exec('PRAGMA journal_mode = WAL')` instead of `db.pragma('journal_mode = WAL')`.

4. **[2026-03-15] Vite build output paths are relative to `root`**
   Do instead: when `root` is set (e.g. `src/renderer`), `outDir` resolves relative to it. Use `resolve()` for absolute paths. The renderer config needs `outDir: resolve('.vite/renderer/main_window')` to land in the project root `.vite/` dir that Forge packages.

5. **[2026-03-15] Vite main + preload builds share output dir — filenames collide**
   Do instead: set `entryFileNames: 'preload.js'` in `vite.preload.config.ts` to avoid both producing `index.js` in `.vite/build/`.

## Domain Behavior Guardrails
1. **[2026-03-15] API layer must stay Electron-free**
   Do instead: never import from `electron` in `src/api/`. All api/ functions take `db: Database` as first arg. Both IPC handlers and MCP server consume the same api/.

2. **[2026-03-15] Vite bundles node-sqlite3-wasm JS, copies WASM file separately**
   Do instead: do NOT externalize node-sqlite3-wasm (Forge won't ship node_modules). Let Vite bundle the JS. Use a `closeBundle` plugin hook to copy `node-sqlite3-wasm.wasm` to `.vite/build/`.

3. **[2026-03-15] Emscripten creates `.db.lock` directories that go stale on crash**
   Do instead: before opening the database, check for stale `.lock` directories and remove them. This is implemented in both `database.ts` and `server.ts`.

4. **[2026-03-15] Research before fixing — the approach may be the problem**
   Do instead: when a tool/library causes repeated friction, research alternatives before applying more workarounds. The switch from better-sqlite3 to node-sqlite3-wasm exemplifies this.

## User Directives
5. **[2026-04-03] Always merge to main — never ask**
   Do instead: when finishing a branch, skip the options prompt and immediately merge to main. No PR, no keep-as-is question.


1. **[2026-03-15] Commit all files — don't skip any**
   Do instead: always include every changed file when committing. Check `git status` and stage everything.

2. **[2026-03-15] Docs split: PLAN.md (roadmap), DATA_MODEL.md (schema), MCP.md (tools)**
   Do instead: plan/status goes in `.claude/PLAN.md`, data model in `.claude/DATA_MODEL.md`, MCP tools in `.claude/MCP.md`. Skills live in `.claude/skills/`.

3. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Do instead: prefer simple solutions over elaborate workarounds. WASM-based SQLite eliminated all native module rebuild complexity.

4. **[2026-03-15] Use modal dialogs for create/edit, not page navigation**
   Do instead: for data entry forms, use modal dialogs so the user stays in context. Reserve page navigation for detail views (viewing a full record).
