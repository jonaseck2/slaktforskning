# MCP Server Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 114 CRUD MCP tools with ~35 workflow tools (prod server) and add ~15 dev tools with chart inspection (dev server), split into two entry points.

**Architecture:** Two MCP server entry points share one codebase. `createProdServer.ts` registers workflow tools that compose multiple `src/api/` calls. `createDevServer.ts` extends prod with UI automation, chart inspection, test data seeding. The `src/api/` layer is unchanged.

**Tech Stack:** MCP SDK (`@modelcontextprotocol/sdk`), Zod schemas, node-sqlite3-wasm, Electron IPC for chart bridge

**Spec:** `docs/superpowers/specs/2026-04-15-mcp-overhaul-design.md`

---

## Phase 1: Server Architecture (Tasks 1-2)

### Task 1: Create prod server factory + entry point

**Files:**
- Create: `src/mcp/createProdServer.ts`
- Create: `src/mcp/tools/prod/types.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Create `src/mcp/tools/prod/types.ts`** — shared context types (`ToolContext` with `getDb()`, `UtilityToolContext` with `getDbPath/setDb/setDbPath`). Copy from existing `src/mcp/tools/types.ts` and add `UtilityToolContext` (currently in `utility.ts`).

- [ ] **Step 2: Create `src/mcp/createProdServer.ts`** — factory function that creates `McpServer` with name `slaktforskning`, version `1.0.0`. Sets up `ctx` and `utilCtx` objects. Initially registers no tools (added in Tasks 3-7). Same db-swapping pattern as current `createServer.ts`.

- [ ] **Step 3: Update `src/mcp/server.ts`** — replace `createServer` import with `createProdServer`. Remove ALL UI tool registrations (`ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js`), the `uiPost`/`uiGet` helpers, and `UI_PORT`/`UI_BASE` constants. The prod entry point becomes: DB setup + `createProdServer(db, dbPath)` + stdio transport. Nothing else.

- [ ] **Step 4: Verify server boots** — run `npx playwright test tests/e2e/app.test.ts`. The MCP initialize handshake test should still pass.

- [ ] **Step 5: Commit** — `refactor: create prod server factory, remove UI tools from prod entry point`

---

### Task 2: Create dev server factory + entry point

**Files:**
- Create: `src/mcp/createDevServer.ts`
- Create: `src/mcp/devServer.ts`
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Create `src/mcp/createDevServer.ts`** — calls `createProdServer(initialDb, initialDbPath)` to get a server with all prod tools, then registers dev tools on the same instance. Initially empty (dev tools added in Tasks 9-12). Computes `uiBase` URL from `SLAKTFORSKNING_UI_PORT` env var (default 19241).

- [ ] **Step 2: Create `src/mcp/devServer.ts`** — same DB setup as `server.ts` (dbPath, lock cleanup, schema init), then `createDevServer(db, dbPath)` + stdio transport.

- [ ] **Step 3: Add `slaktforskning-dev` to `.claude/settings.local.json`** — `{"command": "npx", "args": ["tsx", "src/mcp/devServer.ts"]}`.

- [ ] **Step 4: Verify dev server boots** — `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | SLAKTFORSKNING_DB=/tmp/mcp-dev-test.db npx tsx src/mcp/devServer.ts` should return JSON with `"serverInfo"`.

- [ ] **Step 5: Commit** — `feat: add dev MCP server entry point`

---

## Phase 2: Prod Workflow Tools (Tasks 3-7)

Each task creates tool files in `src/mcp/tools/prod/`, writes unit tests, and registers in `createProdServer.ts`. The `src/api/` layer is unchanged — workflow tools compose existing api functions.

**Transaction pattern:** Workflow tools that create multiple records wrap in `db.exec('BEGIN') ... db.exec('COMMIT')` with try/catch rollback. Extract internal `_createPersonCore` (no transaction) that both `createPersonWorkflow` and `addChildWorkflow` can call, since SQLite doesn't support nested transactions.

**findOrCreateSource pattern:** Used by several tools. `searchSources(db, title)` → find exact match → if none, `createSource(db, { title })`. Put this in a shared helper.

### Task 3: Person workflow tools

**Files:**
- Create: `src/mcp/tools/prod/persons.ts`
- Create: `tests/unit/mcp-persons.test.ts`
- Modify: `src/mcp/createProdServer.ts`

**Tools:** `create_person`, `search_persons`, `get_person_summary`, `update_person`, `delete_person`, `add_person_name`, `merge_persons`, `find_duplicates`

- [ ] **Step 1: Write test file `tests/unit/mcp-persons.test.ts`** — test `createPersonWorkflow` directly (not via MCP):
  - Creates person with name only → verify person + name created
  - Creates person with birth_date + birth_place → verify birth event + event_participant + place created
  - Creates person with source_title → verify citation created, source found-or-created
  - Reuses existing source when title matches (create source first, then createPersonWorkflow with same title, assert source count unchanged)

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/unit/mcp-persons.test.ts`. Expected: FAIL, `createPersonWorkflow` not found.

- [ ] **Step 3: Implement `src/mcp/tools/prod/persons.ts`**

Export `createPersonWorkflow(db, args)` and internal `_createPersonCore(db, args)` (no transaction wrapper). The workflow function:
1. `persons.createPerson(db, { sex, living, notes, given_name, surname })`
2. If `birth_date` or `birth_place`: `places.findOrCreatePlace` → `events.createEvent(type: 'birth')` → `relationships.addEventParticipant(role: 'primary')`
3. If `source_title`: `findOrCreateSource` → `sources.createCitation(source_id, event_id, page)`

Register 8 MCP tools via `registerPersonTools(server, ctx)`. See spec for full input schemas.

- [ ] **Step 4: Register in `createProdServer.ts`** — import and call `registerPersonTools(server, ctx)`.

- [ ] **Step 5: Run tests** — `npx vitest run tests/unit/mcp-persons.test.ts`. Expected: all pass.

- [ ] **Step 6: Commit** — `feat(mcp): add person workflow tools`

---

### Task 4: Family workflow tools

**Files:**
- Create: `src/mcp/tools/prod/families.ts`
- Create: `tests/unit/mcp-families.test.ts`
- Modify: `src/mcp/createProdServer.ts`

**Tools:** `add_relationship`, `add_child`, `get_family_unit`, `get_ancestor_tree`

- [ ] **Step 1: Write test file `tests/unit/mcp-families.test.ts`** — test workflow functions directly:
  - `addChildWorkflow`: creates child + parent_child rel; with two parents creates two rels; with birth_date creates birth event
  - `addRelationshipWorkflow`: creates couple rel + marriage event when event_type/date provided

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `src/mcp/tools/prod/families.ts`**

`addChildWorkflow` calls `_createPersonCore` from persons.ts (avoids nested transactions), then creates parent_child relationship(s). `addRelationshipWorkflow` creates relationship + optional event with `findOrCreatePlace`.

Register 4 MCP tools via `registerFamilyTools(server, ctx)`.

- [ ] **Step 4: Register in `createProdServer.ts`**

- [ ] **Step 5: Run tests** — all pass

- [ ] **Step 6: Commit** — `feat(mcp): add family workflow tools`

---

### Task 5: Event workflow tools

**Files:**
- Create: `src/mcp/tools/prod/events.ts`
- Create: `tests/unit/mcp-events.test.ts`
- Modify: `src/mcp/createProdServer.ts`

**Tools:** `record_event`, `get_timeline`, `update_event`

- [ ] **Step 1: Write test for `recordEventWorkflow`** — test:
  - Creates event with primary participant
  - Creates event with multiple participants (person_ids array)
  - Creates citation when source_title provided
  - Creates place when place string provided

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `src/mcp/tools/prod/events.ts`**

`recordEventWorkflow`: `findOrCreatePlace` → `createEvent` → `addEventParticipant` for each participant → optional `findOrCreateSource` + `createCitation`. Transaction-wrapped.

`update_event` resolves place string to place_id via `findOrCreatePlace` before calling `events.updateEvent`.

- [ ] **Step 4: Register and run tests**

- [ ] **Step 5: Commit** — `feat(mcp): add event workflow tools`

---

### Task 6: Source, place, research, media, and data-management tools

**Files:**
- Create: `src/mcp/tools/prod/sources.ts`
- Create: `src/mcp/tools/prod/places.ts`
- Create: `src/mcp/tools/prod/research.ts`
- Create: `src/mcp/tools/prod/media.ts`
- Create: `src/mcp/tools/prod/data-management.ts`
- Modify: `src/mcp/createProdServer.ts`

These are mostly thin wrappers around existing api functions. The key composed tools:

- **`cite`** — finds-or-creates source by title, then creates citation. Accepts `source_id` OR `source_title`.
- **`run_checks`** — calls `runChecksForPerson` when `person_id` provided, `runAllChecks` otherwise.
- **`attach_media`** — creates media record + media_link in one call.
- **`import_file`** — unified import with format auto-detection from file extension. `.backup`/`.gcc` → genney, `.ged` → gedcom (unless `format: 'genney'` or `format: 'holger'` explicit). Accepts `media_dir` for Holger.

- [ ] **Step 1: Implement all 5 files** — sources (4 tools), places (4 tools), research (4 tools), media (3 tools), data-management (4 tools). Follow the registerTool pattern from Tasks 3-5.

- [ ] **Step 2: Register all in `createProdServer.ts`**

- [ ] **Step 3: Run all tests** — `npm test`

- [ ] **Step 4: Commit** — `feat(mcp): add source, place, research, media, and data-management workflow tools`

---

### Task 7: Delete old CRUD tool files

**Files:**
- Delete: `src/mcp/createServer.ts`
- Delete: `src/mcp/tools/persons.ts`, `relationships.ts`, `events.ts`, `sources.ts`, `places.ts`, `media.ts`, `import-export.ts`, `utility.ts`, `gazetteers.ts`, `types.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/mcp/createServer.ts
rm src/mcp/tools/persons.ts src/mcp/tools/relationships.ts src/mcp/tools/events.ts
rm src/mcp/tools/sources.ts src/mcp/tools/places.ts src/mcp/tools/media.ts
rm src/mcp/tools/import-export.ts src/mcp/tools/utility.ts src/mcp/tools/gazetteers.ts
rm src/mcp/tools/types.ts
```

- [ ] **Step 2: Verify no imports reference deleted files** — grep for old import paths in `src/mcp/`. Expected: no matches.

- [ ] **Step 3: Run all tests** — `npm test && npx playwright test`

- [ ] **Step 4: Commit** — `refactor(mcp): delete old CRUD tool files (114 tools replaced by 34 workflow tools)`

---

## Phase 3: Dev Tools (Tasks 8-11)

### Task 8: Dev UI automation tools

**Files:**
- Create: `src/mcp/tools/dev/ui.ts`
- Modify: `src/mcp/createDevServer.ts`
- Modify: `src/main/ui-server.ts` (add `/fill` endpoint)

**Tools:** `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`

- [ ] **Step 1: Add `/fill` endpoint to `src/main/ui-server.ts`** — accepts `{ selector, value }`, uses `nativeSetter` to set value on input/textarea, dispatches `input` and `change` events. Same error handling pattern as `/click`.

- [ ] **Step 2: Create `src/mcp/tools/dev/ui.ts`** — `registerUiTools(server, uiBase)`. Contains `uiPost` and `uiGet` helpers (moved from old `server.ts`). 5 tools wrapping the HTTP bridge endpoints: `/screenshot`, `/navigate`, `/click`, `/fill`, `/dom`.

- [ ] **Step 3: Update `createDevServer.ts`** — import and call `registerUiTools(server, uiBase)` where `uiBase` is computed from `SLAKTFORSKNING_UI_PORT` env var.

- [ ] **Step 4: Run tests** — `npm test`

- [ ] **Step 5: Commit** — `feat(mcp-dev): add UI automation tools`

---

### Task 9: Chart inspection — HTTP bridge + composable

**Files:**
- Modify: `src/main/ui-server.ts` (add chart endpoints)
- Modify: `src/preload/index.ts` (add chart IPC channels)
- Create: `src/renderer/composables/useChartBridge.ts`
- Modify: `src/renderer/views/VisualizationView.vue`

This is the most complex dev task — it wires renderer Vue state to HTTP endpoints via IPC.

- [ ] **Step 1: Add chart IPC channels to `src/preload/index.ts`**

Add `window.api.chart` namespace with:
- `onGetVisiblePersons(callback)` — listens for `chart:getVisiblePersons`, calls callback, sends result back via reply channel
- `onSelectPerson(callback)` — same pattern for `chart:selectPerson`
- `onFocusPerson(callback)` — same for `chart:focusPerson`
- `onGetLayout(callback)` — same for `chart:getLayout`
- `removeAllChartHandlers()` — removes all chart listeners

Pattern: renderer listens on IPC channel, main sends channel name + replyChannel, renderer calls callback and sends result back on replyChannel.

- [ ] **Step 2: Add chart HTTP endpoints to `src/main/ui-server.ts`**

Add routes: `POST /chart/persons`, `POST /chart/select`, `POST /chart/focus`, `GET /chart/layout`, `POST /chart/screenshot`.

Each route uses request-reply IPC: generate unique reply channel, `ipcMain.once(replyChannel, ...)`, `win.webContents.send('chart:...', replyChannel, body)`, with 2-second timeout returning `{ error: 'No chart is currently displayed' }`.

Import `ipcMain` from electron at top of file.

- [ ] **Step 3: Create `src/renderer/composables/useChartBridge.ts`**

`useChartBridge(state)` takes refs for `boxes`, `selectedPersonId`, `focalPersonId`, `chartType`, and functions `selectPerson(id)`, `focusPerson(id)`.

On mount: registers callbacks via `window.api.chart.onGetVisiblePersons(...)` etc.
- `getVisiblePersons`: maps `boxes` to `{ id, name, x, y, isSelected, isFocal }`, filtering out `__ph_` placeholders
- `selectPerson`: accepts `person_id` (exact) or `name` (case-insensitive substring match against visible), calls `state.selectPerson(id)`
- `focusPerson`: calls `state.focusPerson(id)`
- `getLayout`: returns `{ chartType, focalId, selectedId, boxCount }`

On unmount: calls `window.api.chart.removeAllChartHandlers()`.

- [ ] **Step 4: Wire into `VisualizationView.vue`** — import and call `useChartBridge` in setup, passing the existing reactive state.

- [ ] **Step 5: Manual test** — with app running and chart visible, `curl -s -X POST http://127.0.0.1:19241/chart/persons | python3 -m json.tool` should return visible person list.

- [ ] **Step 6: Commit** — `feat(mcp-dev): add chart inspection HTTP bridge + useChartBridge composable`

---

### Task 10: Dev chart MCP tools

**Files:**
- Create: `src/mcp/tools/dev/chart.ts`
- Modify: `src/mcp/createDevServer.ts`

**Tools:** `chart_list_persons`, `chart_select_person`, `chart_focus_person`, `chart_get_layout`, `chart_screenshot_person`

- [ ] **Step 1: Create `src/mcp/tools/dev/chart.ts`** — `registerChartTools(server, uiBase)`. 5 tools wrapping the chart HTTP bridge endpoints. `chart_select_person` accepts `person_id` OR `name`. `chart_screenshot_person` returns image content type.

- [ ] **Step 2: Register in `createDevServer.ts`**

- [ ] **Step 3: Commit** — `feat(mcp-dev): add chart inspection tools`

---

### Task 11: Dev seed and inspect tools

**Files:**
- Create: `src/mcp/tools/dev/seed.ts`
- Create: `src/mcp/tools/dev/inspect.ts`
- Create: `tests/unit/mcp-seed.test.ts`
- Modify: `src/mcp/createDevServer.ts`

**Tools:** `seed_family`, `seed_person`, `clear_test_data`, `app_status`, `db_stats`

- [ ] **Step 1: Write test for seed_family**

Test `seedFamilyWorkflow(db, { generations: 2, children_per_family: 2 })`:
- Returns created person count
- All persons belong to `__test__` group
- `clearTestData(db)` removes all seeded persons

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `src/mcp/tools/dev/seed.ts`**

`seedFamilyWorkflow` uses `_createPersonCore` from prod persons to create focal + parents + grandparents + children with Swedish-sounding generated names. All persons added to `__test__` group (created via `groups.createGroup` if not exists).

`clearTestData` finds `__test__` group, gets all members, deletes each person (cascade handles events/relationships), then deletes the group.

- [ ] **Step 4: Implement `src/mcp/tools/dev/inspect.ts`**

`db_stats`: runs `SELECT (SELECT COUNT(*) FROM persons) as persons, ...` for 6 tables.
`app_status`: calls `uiGet('/status')` — need to add `/status` endpoint to ui-server that returns `{ route, windowWidth, windowHeight }`.

- [ ] **Step 5: Register both in `createDevServer.ts`**

- [ ] **Step 6: Run tests** — `npm test`

- [ ] **Step 7: Commit** — `feat(mcp-dev): add seed and inspect tools`

---

## Phase 4: Finalization (Tasks 12-13)

### Task 12: Update E2E tests

**Files:**
- Modify: `tests/e2e/app.test.ts`

- [ ] **Step 1: Add dev server E2E test** — boot `devServer.ts` with temp DB, send initialize request, verify server info. Mirror existing prod server test.

- [ ] **Step 2: Run E2E tests** — `npx playwright test`. Both pass.

- [ ] **Step 3: Commit** — `test: add E2E test for dev MCP server`

---

### Task 13: Update documentation, skills, and version

**Files:**
- Modify: `CLAUDE.md` — MCP section: two servers, new tool names
- Modify: `docs/MCP.md` — full tool reference for prod (34) and dev (15)
- Modify: `.claude/skills/mcp-dev/SKILL.md` — prod/dev split, chart tool examples, chrome-devtools-mcp workflow
- Modify: `.claude/skills/electron-dev/SKILL.md` — chrome-devtools-mcp integration
- Modify: `docs/PLAN.md` — implementation status row
- Modify: `package.json` — version bump

- [ ] **Step 1: Update `CLAUDE.md`** — replace flat tool list with Prod (34 tools) and Dev (15 tools) sections. Update tool names.

- [ ] **Step 2: Update `docs/MCP.md`** — rewrite with Production and Development server sections.

- [ ] **Step 3: Update `mcp-dev` skill** — add chart debugging workflow, update acceptance testing mode, add chrome-devtools-mcp integration.

- [ ] **Step 4: Update `electron-dev` skill** — add chrome-devtools-mcp section for console/a11y/perf.

- [ ] **Step 5: Add PLAN.md entry** — version row in Implementation Status.

- [ ] **Step 6: Version bump + commit** — bump to next minor. Message: `feat(v0.X.0): MCP overhaul — prod/dev split, workflow tools, chart inspection`

---

## Task Dependency Graph

```
Task 1 (prod server factory)
  |-> Task 2 (dev server factory)
  |-> Tasks 3-6 (prod tools, parallelizable)
  |     |-> Task 7 (delete old files)
  |
  Task 2
  |-> Task 8 (dev UI tools)
  |-> Task 9 (chart bridge) -> Task 10 (chart MCP tools)
  |-> Task 11 (seed + inspect)
  |
  Tasks 7-11 all done
  |-> Task 12 (E2E tests)
  |-> Task 13 (docs + version bump)
```

**Parallelizable groups:**
- Tasks 3, 4, 5, 6 (prod tool domains)
- Tasks 8, 9, 11 (dev tool domains, except 10 depends on 9)
