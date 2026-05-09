---
name: mcp-dev
description: Add new MCP tools, test the MCP server, and debug MCP communication. Use when extending the MCP server or verifying agent-facing functionality.
---

# MCP Dev Skill

## ⚠️ Prime Directive: Pass-Through, Never Synthesize

MCP tools are an interface for *the agent's* authored input. They are not a place to "be helpful" by filling in fields the agent didn't supply. Every persistent value an MCP tool writes must come from an explicit argument the agent provided.

**Forbidden patterns:**
- `date_type: args.date_type ?? (args.date_value ? 'exact' : 'unknown')` — this is the canonical violation. The agent passed `date_value` but didn't say what type. Inferring `'exact'` is fabricating data. Pass through `args.date_type` and let the api/schema default to `'unknown'`. Only populate `date_value` when the agent also confirmed `date_type` — otherwise store the input as `date_original` only.
- Auto-resolving a place name to coordinates and writing them to `places.latitude/longitude` — that's a gazetteer-resolved value, never persisted (see gazetteers skill).
- Defaulting `sex` to `'U'` is OK — that's the schema's "I don't know" sentinel, not an inference. Defaulting `sex` to `'M'` based on the given name would be a violation.

**Allowed:**
- Pass agent-supplied fields straight through to the api/ function. Let the api/schema layer default missing optional fields to a sentinel value (`'unknown'`, NULL).
- Argument validation (rejecting clearly invalid input).
- Document the contract in the tool's `describe()` so agents know when to supply structured fields vs free-form fallbacks.

This rule is in `CLAUDE.md` as the prime directive. Past violations corrupted real databases. Treat MCP tool arguments as a write API, not a guessing game.

## Prod vs Dev Server

The MCP server has two entry points:

| Server | Entry point | Tools |
|--------|-------------|-------|
| Production | `src/mcp/server.ts` | 77 workflow tools — full CRUD parity with the desktop app for genealogy research |
| Development | `src/mcp/devServer.ts` | All prod tools + 15 dev-only tools |

Use the **dev server** for all agent-driven development, UI testing, and chart debugging. Use the **prod server** for research sessions and narrative generation.

## Three Modes of Use

The MCP server is not just an API surface — it is the primary tool for agents to develop, test, and research in the running app.

### Mode 1: Agent-Driven Development

Seed test data and verify new UI features without touching the app manually. **Use the dev server** (`src/mcp/devServer.ts`):

```
1. seed_family({ children: 2 })  — realistic test data in one call
   — or — create_person / record_event / ...
2. ui_navigate("/your-new-route") — go to the view
3. ui_screenshot()                — visual confirmation it renders
4. ui_get_dom()                   — assert specific elements exist in the DOM
5. ui_click("button.add")         — exercise primary interactions
```

**The MCP server shares the same SQLite database as the running app.** Data seeded via MCP tools is immediately visible in the app — no restart needed.

#### Chart debugging with the dev server

When working on chart layout bugs, use the chart inspection tools:

```
1. chart_list_persons()                    — see all boxes with x/y positions
2. chart_select_person({ id: "..." })      — select a person (shows outlines)
3. chart_get_layout()                      — full layout: boxes, lines, placeholders
4. chart_screenshot_person({ id: "..." })  — screenshot cropped to one box
5. ui_screenshot()                         — full chart screenshot for context
```

This lets you verify connector positions, outline placement, and spacing without reading raw layout data from source files.

### Mode 2: Acceptance Testing After Feature Implementation

After implementing a UI feature (e.g. ResearchTasksView), before committing:

1. Ensure the app is running (`npm start` or check with `app_status`)
2. Seed data via MCP: `seed_person`, `seed_family`, or direct workflow tools
3. `ui_navigate("/research-tasks")` → verify the view loads
4. `ui_get_dom()` → assert tasks appear in the table
5. `ui_click()` → test status change, filter, add/delete interactions

This is faster than writing a full Playwright E2E test and covers the full IPC → Vue rendering stack that unit tests don't reach.

### Mode 3: Active Research Session

During genealogy research, use the **prod server** (`src/mcp/server.ts`):

- `search_persons("Nilsson")` → find candidates
- `get_person_summary(id)` → everything about a person in one call
- `record_event(...)` → record a newly found birth record with place + citation
- `get_research_gaps(id)` → check what's missing
- `get_current_database` → confirm which DB is active before making changes

### Data integrity rule: search before create

**Always call `search_persons` (or the relevant search tool) before `create_person`.** Never blindly create a record that may already exist. This applies to all entity types — persons, places, sources, groups. Duplicates are expensive to clean up and confuse users.

### Media file_ref rule — NEVER pass a URL or absolute path

`media.file_ref` is resolved at render time by joining it to the directory containing the active database (e.g. `~/db/family.db` → `~/db/` + `file_ref`). The renderer treats `file_ref` as a path. So:

- ✅ `file_ref: "claude-media/photo.jpg"` (relative to db directory, file lives at `~/db/claude-media/photo.jpg`)
- ❌ `file_ref: "https://i.ytimg.com/vi/X/maxresdefault.jpg"` — fails to load. The renderer doesn't fetch URLs.
- ❌ `file_ref: "/Users/.../photo.jpg"` — absolute paths must be consolidated into `<dbname>-media/` first (see `.claude/rules/media.md`).

**If you have a URL pointing at an image you want to attach:**
1. `curl -o /path/to/<dbname>-media/<filename>.jpg "<url>"` (use `getMediaDir(dbPath)` to compute the folder; create it with `mkdir -p` if missing).
2. `attach_media({ file_ref: "<dbname>-media/<filename>.jpg", format: "jpg", ... })`.

**If a URL belongs as a citation, not as a media file:** put it in a `source.url` and `cite()` the person/event — that's what sources are for. The LinkedIn/Facebook profile URL of a living person is almost always a citation, not media.

**To repair a broken `file_ref` after the fact:** use `update_media({ id, file_ref: "..." })`. To drop a media row entirely (e.g. an attached URL that should have been a source): `delete_media({ id })`.

### Headless / pipeline mode

If you are running as a headless agent (Kubernetes pod, CI, no window server, no `.mcp.json`):

- **Skip all `ui_*` tools** — they require the Electron app to be running with a display. Calling them will fail or hang.
- **Data tools work fine** — run the prod server standalone (`npx tsx src/mcp/server.ts`) with `SLAKTFORSKNING_DB=/path/to/db.db` and call data tools directly via stdin/stdout JSON-RPC.
- **Use E2E tests for UI verification** — `npx playwright test` runs headless and covers the full IPC → Vue rendering stack. Prefer this over `ui_screenshot` for pipeline verification.

### Session Start Checklist

At the start of any session where UI work or research will happen:
1. Call `get_current_database` — confirm which DB is active
2. If the app is not running, UI tools (`ui_screenshot`, `ui_navigate`, etc.) will return errors — data tools still work
3. Data tools operate directly on SQLite; they do not require the Electron app to be running

---

## Running the MCP Server

### Production server (for research sessions)
```bash
npx tsx src/mcp/server.ts
```
Uses the default DB path (`~/Library/Application Support/slaktforskning/slaktforskning.db` on macOS).

### Development server (for agent-driven development)
```bash
npx tsx src/mcp/devServer.ts
```
Includes all prod tools plus UI automation, chart inspection, seed, and inspect tools.

### With a test database
```bash
SLAKTFORSKNING_DB=/tmp/test.db npx tsx src/mcp/devServer.ts
```

### Via Claude Code
The MCP server is configured in `.claude/settings.local.json` as `slaktforskning`. Configure it to use the dev server for development work:
```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/devServer.ts"]
    }
  }
}
```

## Testing MCP Tools

### Quick test — send an initialize request
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | SLAKTFORSKNING_DB=/tmp/mcp-test.db npx tsx src/mcp/server.ts
```
Should output JSON containing `"serverInfo"` and `"slaktforskning"`.

### E2E test
```bash
npx playwright test tests/e2e/app.test.ts
```
The second test (`MCP server starts and responds`) verifies the server boots and responds to `initialize`.

### Via Claude Code MCP tools
Use ToolSearch to find and call the `slaktforskning` MCP tools directly:
- `mcp__slaktforskning__create_person`
- `mcp__slaktforskning__list_persons`
- `mcp__slaktforskning__search_persons`
- etc.

### When changing the MCP server source: full process restart required

The MCP server is a long-running child process spawned by Claude Code from `.mcp.json`. **Reconnecting the MCP from Claude Code does not always respawn the underlying `npx tsx` process** — sometimes only the transport reconnects. Symptoms:

- A newly added tool isn't visible via `ToolSearch`.
- `update_event` / `record_event` reject `date_value_end` ("Input validation error: Unrecognized key").
- `mcp__slaktforskning__update_person_name` returns "No matching deferred tools found".

To force a real restart, use Claude Code's `/mcp` slash command and explicitly restart the slaktforskning server (or quit + reopen the Claude Code window). After restart:

1. **The MCP server's "current database" resets to the default app data DB.** Always call `switch_database` again before continuing work.
2. Verify the new tool appears via `ToolSearch` before calling it — if it's still missing, the restart didn't take.

## Adding a New MCP Tool

**Production tools** live in `src/mcp/createProdServer.ts`. **Dev-only tools** live in `src/mcp/createDevServer.ts` (which imports and extends prod). Use `registerTool()`, not the deprecated `tool()` overload:

```typescript
// src/mcp/createProdServer.ts — inside createMcpServer(db)
server.registerTool('tool_name', {
  description: 'Human-readable description',
  inputSchema: {
    param_name: z.string().describe('What this param does'),
    optional_param: z.string().optional().describe('Optional field'),
  },
}, async ({ param_name, optional_param }) => {
  // Call the api/ function — NEVER put business logic here
  const result = apiModule.someFunction(db, { param_name, optional_param });
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});
```

### Rules:
1. **The MCP tool is a thin wrapper** — all logic lives in `src/api/`. The tool just calls the api function and returns JSON.
2. **Use `registerTool()`** not `tool()` — the 4-arg `tool()` overload is deprecated.
3. **Add `.describe()` to every parameter** — agents read these to understand what to pass.
4. **Return JSON in `content[0].text`** — always `JSON.stringify(result, null, 2)`.
5. **Handle not-found cases** — return a human-readable message like `'Person not found'`.

### End-to-end checklist for a new tool:
1. Implement the function in `src/api/*.ts`
2. Write unit tests in `tests/unit/`
3. Add the MCP tool in `src/mcp/createProdServer.ts` (or `createDevServer.ts` for dev-only tools)
4. Add the IPC channel via `defineChannel()` in `src/shared/channels/<domain>.ts`
5. Add the matching `window.api.<domain>.<method>` line manually to `src/preload/index.ts` (and a stub in `src/static/static-api.ts`)
6. Test: `npm test && npx playwright test`

## Common pitfalls (real bugs we shipped)

### 1. Pass-through dropped in a branching code path

The Prime Directive ("never synthesize") catches the inference case, but it does not catch the silent-drop case where a tool accepts a field, the agent supplies it, and one branch of the wrapper just doesn't pass it on.

Concrete bug from the 2026-05-09 Bernadotte test session: `add_place` accepted `place_type` / `latitude` / `longitude` / `notes` etc. The no-`parent_chain` branch destructured `...rest` and forwarded them to `createPlace`. The `parent_chain` branch only forwarded `name`. Result: every chained-place call silently lost four authored fields. The MCP tool reported success and returned a row with all four fields null.

The fix shape is to extend the api function with a `leafProps` parameter and forward `rest` through:

```typescript
// MCP tool
}, async (args) => {
  const { parent_chain, name, ...leafProps } = args;
  if (parent_chain && parent_chain.length > 0) {
    return placeApi.findOrCreatePlaceWithChain(getDb(), name,
      parent_chain.map((n) => ({ name: n })),
      leafProps,                                     // ← was missing
    );
  }
  return placeApi.createPlace(getDb(), { name, ...leafProps });
});
```

**Rule:** if a tool's `inputSchema` declares a field, every branch in the handler must pass it on (or document why not in a code comment). When you write a tool that has multiple call paths, write a unit test that asserts every declared field round-trips through every path.

### 2. `mutating: true` is what makes the renderer notice

A worker channel marked `mutating: true` does two things:

1. The renderer's preload `mutating()` wrapper fires `dataChangedListeners` after the call returns — this is what `useEntityData` and `usePagedList` listen for to refresh.
2. As of `c3f12d95`, the worker also broadcasts `data:changed` to all renderer windows on completion — so MCP-side mutations refresh list views the same way renderer-initiated ones do.

**A new mutating channel that forgets the flag will:**
- Save to the DB correctly,
- Return the right value,
- And leave every list view stale until the user hard-reloads.

This is the single most expensive failure mode in MCP-driven testing — the agent thinks the seed step "didn't work" because the panel still says (0). The data is in the DB; the renderer just never heard. Always set `mutating: true` on any registry channel that performs a write, and verify by clicking through the list view after the call (or by running `tests/unit/data-changed-broadcast.test.ts`).

### 3. UI sections that compute their count via `defineExpose({ count })` need `v-show`, not `v-if`

When a panel section component is the source of truth for its count badge (parent reads `sectionRef.value?.count ?? 0`), `v-if`-collapsing the section unmounts the child and the count falls back to 0 — making the panel header lie. Surfaced for `Uppgifter` and `Kvalitet` on PersonPanel / PlacePanel / MediaPanel during the Bernadotte test.

The fix: switch to `v-show` so the child stays mounted while the body is hidden via `display: none`. The child's `useEntityData` caches its first fetch, so the per-mount cost is one IPC. The right long-term fix is for the parent to fetch a lightweight COUNT for these sections too (matching how `events`, `media`, `relationships`, `groups` work), but `v-show` is the single-line patch.

## Current MCP Tools

See `docs/MCP.md` for the full tool reference grouped by domain. Source files are always authoritative:
- Production tools: `src/mcp/createProdServer.ts`
- Dev-only tools: `src/mcp/createDevServer.ts`
- Entry points: `src/mcp/server.ts` (prod), `src/mcp/devServer.ts` (dev)

## MCP Server Config

In `.claude/settings.local.json` — use the dev server for development work:
```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/devServer.ts"]
    }
  }
}
```
