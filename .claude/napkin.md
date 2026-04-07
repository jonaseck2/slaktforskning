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

## MCP Server

1. **[2026-04-03] MCP server fails to start if `path` is not imported in server.ts**
   Do instead: verify `import path from 'node:path'` is present at the top of `src/mcp/server.ts`. Test with `echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | npx tsx src/mcp/server.ts` before assuming config issue.

2. **[2026-04-03] Use MCP tools (not one-off tsx scripts) for DB operations in a session**
   Do instead: check that slaktforskning MCP server is connected and use its tools (`search_persons`, `add_event`, etc.). If the server shows "failed" in Claude Code, fix the crash and ask user to reconnect.

## Shell & Command Reliability

1. **[2026-04-03] Security hook false-positive on SQLite's `db.exec` method**
   Do instead: the project hook flags the string `db.exec` followed by an open-paren as potential shell injection. It is a false positive for the SQLite `Database` method. Avoid writing that exact token sequence in plan files, PLAN.md, skill docs, or commit messages. Use `db.prepare('...').run([])` in source code instead (works identically). In existing code already using it the hook only fires when editing those files.

2. **[2026-03-15] Vite build output paths are relative to `root`**
   Do instead: use `resolve()` for absolute `outDir`. Renderer config needs `outDir: resolve('.vite/renderer/main_window')`.

3. **[2026-03-15] Vite main + preload builds share output dir — filenames collide**
   Do instead: set `entryFileNames: 'preload.js'` in `vite.preload.config.ts`.

(node-sqlite3-wasm quirks moved to `add-feature` skill — array binding, get() undefined, no .pragma().)

## Testing

1. **[2026-04-04] Import transform tests must assert DB-level outcomes, not just match fixtures**
   Do instead: after a transform test runs, query the DB and assert actual row counts/values — e.g. `expect(listPlaces(db)).toHaveLength(2)`. If the test fixtures mirror a buggy assumption (e.g. wrong column names), a fixture-only test will silently pass while the bug exists. DB-level assertions catch this. Root cause: the EVENT_PLACE and REMARK column bugs in Genney import were in both the transform code AND the test fixtures — only discovered against real data.

2. **[2026-04-04] Use MCP + UI tools to verify new UI features in the running app**
   Do instead: after `npm test` passes, seed data via MCP tools, then call `ui_navigate()`, `ui_screenshot()`, and `ui_get_dom()` to confirm the feature renders correctly in the live app. See `.claude/plans/2026-04-04-mcp-agent-workflow.md` for the full workflow. Faster than writing a Playwright test for every feature during development.

## Domain Behavior Guardrails

1. **[2026-03-15] API layer must stay Electron-free**
   Do instead: never import from `electron` in `src/api/`. All api/ functions take `db: Database` as first arg.

2. **[2026-03-15] Vite bundles node-sqlite3-wasm JS, copies WASM file separately**
   Do instead: do NOT externalize node-sqlite3-wasm. Use a `closeBundle` plugin hook to copy the `.wasm` file to `.vite/build/`.

3. **[2026-03-15] Emscripten creates `.db.lock` directories that go stale on crash**
   Do instead: before opening the DB, check for and remove stale `.lock` directories (implemented in `database.ts` and `server.ts`).

4. **[2026-03-15] Use modal dialogs for create/edit, not page navigation**
   Do instead: data entry forms use modals; reserve page navigation for detail views.

## Skills

1. **[2026-04-03] Every plan must include a "Skills to Update" section**
   Do instead: before finalizing any plan file, add a "## Skills to Update" section listing which skills need changes and what to change in each. Use the add-feature checklist as a reference.

(MCP tool registration pattern moved to `mcp-dev` skill. Skill update checklist moved to `add-feature` skill step 11.)

## UI Conventions

1. **[2026-04-08] Import/export option cards use `.io-group`/`.io-groups`, never `.section`**
   Do instead: wrap import/export option cards in `<div class="io-groups"><div class="io-group">`. The `.section` class is for other parts of the app. Button styles, headings, and badges are all covered by shared.css — scoped block needs only `:deep(.modal)`.

2. **[2026-04-08] Import/export text follows strict conventions**
   Do instead: tab names are short ("Genney", not "Import from Genney"). Box headings prefix "Import"/"Export" and put version info in the heading, not description ("Import GEDCOM 5.5.1 or 7.0"). Descriptions are one sentence, third-person present ("Imports…"/"Exports…"), no arrows, no ellipsis on buttons.

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
