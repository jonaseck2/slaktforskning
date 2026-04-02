# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)

1. **[2026-03-15] Run tests and verify they pass before committing**
   Do instead: run `npm test` before each commit. Only commit when green. Never commit first and test after.

2. **[2026-03-15] Always commit ALL changed files, including .claude/ config**
   Do instead: run `git status` before committing and stage every modified/untracked file with `git add -A`.

3. **[2026-04-03] Bump `package.json` version when completing a milestone**
   Do instead: at the end of each roadmap version, update `"version"` in `package.json` and include it in the final commit.

4. **[2026-04-03] New columns on existing tables need ALTER TABLE migration guards**
   Do instead: after `CREATE TABLE IF NOT EXISTS`, append an idempotent migration block at the end of `initializeSchema()` — call `PRAGMA table_info(table)`, check each new column name, and run `ALTER TABLE ... ADD COLUMN` if missing. Without this, users with pre-existing DBs crash at runtime.

5. **[2026-03-15] Keep PLAN.md in sync with actual implementation state**
   Do instead: update `.claude/PLAN.md` checkboxes and move items between sections as work progresses. Completed versions go in Implementation Status; Roadmap is future-only.

6. **[2026-03-15] Write plans to files, not context**
   Do instead: persist plans, specs, and brainstorm outputs to disk immediately. Plans go in `.claude/plans/`, brainstorms in `.claude/plans/brainstorm/YYYY-MM-DD-topic/`.

7. **[2026-03-15] GPG signing fails in non-interactive agent context**
   Do instead: if commit fails with "Bad PIN", tell user and suggest `git config --local commit.gpgsign false`.

## Shell & Command Reliability

1. **[2026-03-15] node-sqlite3-wasm uses array parameter binding**
   Do instead: always pass parameters as arrays — `stmt.run([a, b])`, `stmt.get([id])`, `stmt.all([x, y])`. Spread args only bind the first parameter.

2. **[2026-03-15] node-sqlite3-wasm `.get()` returns undefined, not null**
   Do instead: always use `?? null` when wrapping `.get()` calls that should return `T | null`.

3. **[2026-03-15] node-sqlite3-wasm has no `.pragma()` method**
   Do instead: use `db.exec('PRAGMA ...')` — not `.pragma(...)`.

4. **[2026-03-15] Vite build output paths are relative to `root`**
   Do instead: use `resolve()` for absolute `outDir`. Renderer config needs `outDir: resolve('.vite/renderer/main_window')`.

5. **[2026-03-15] Vite main + preload builds share output dir — filenames collide**
   Do instead: set `entryFileNames: 'preload.js'` in `vite.preload.config.ts`.

## Domain Behavior Guardrails

1. **[2026-03-15] API layer must stay Electron-free**
   Do instead: never import from `electron` in `src/api/`. All api/ functions take `db: Database` as first arg.

2. **[2026-03-15] Vite bundles node-sqlite3-wasm JS, copies WASM file separately**
   Do instead: do NOT externalize node-sqlite3-wasm. Use a `closeBundle` plugin hook to copy the `.wasm` file to `.vite/build/`.

3. **[2026-03-15] Emscripten creates `.db.lock` directories that go stale on crash**
   Do instead: before opening the DB, check for and remove stale `.lock` directories (implemented in `database.ts` and `server.ts`).

4. **[2026-03-15] Use modal dialogs for create/edit, not page navigation**
   Do instead: data entry forms use modals; reserve page navigation for detail views.

## User Directives

1. **[2026-03-15] Commit all files — never selectively skip**
   Do instead: `git add -A` always. Check `git status` and stage everything.

2. **[2026-04-03] Always merge to main — never ask**
   Do instead: when finishing a branch, immediately merge to main. No PR, no options prompt.

3. **[2026-04-03] Brainstorm outputs go in `.claude/plans/brainstorm/YYYY-MM-DD-topic/`**
   Do instead: copy valuable brainstorm HTML files (mockups, comparisons — not waiting screens) there. Link the plan file to its brainstorm dir and vice versa. No "superpowers" in user-visible paths.

4. **[2026-04-03] Use `.claude/agents/` templates when dispatching implementer subagents**
   Do instead: match each task layer to its template (api-implementer, test-writer, ipc-mcp-wirer, vue-ui-builder, doc-syncer). Inject task-specific details rather than writing prompts from scratch.

5. **[2026-03-15] Docs split: PLAN.md (roadmap), DATA_MODEL.md (schema), MCP.md (tools)**
   Do instead: plan/status → `.claude/PLAN.md`, data model → `.claude/DATA_MODEL.md`, MCP tools → `.claude/MCP.md`, skills → `.claude/skills/`, plans → `.claude/plans/`.

6. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Do instead: prefer simple solutions. WASM-based SQLite eliminated all native module rebuild complexity.
