---
name: mcp-dev
description: Add new MCP tools, test the MCP server, and debug MCP communication. Use when extending the MCP server or verifying agent-facing functionality.
---

# MCP Dev Skill

## Three Modes of Use

The MCP server is not just an API surface — it is the primary tool for agents to develop, test, and research in the running app.

### Mode 1: Agent-Driven Development

Seed test data and verify new UI features without touching the app manually:

```
1. create_person / add_event / ... — seed realistic test data
2. ui_navigate("/your-new-route") — go to the view
3. ui_screenshot()                — visual confirmation it renders
4. ui_get_dom()                   — assert specific elements exist in the DOM
5. ui_click("button.add")         — exercise primary interactions
```

**The MCP server shares the same SQLite database as the running app.** Data seeded via MCP tools is immediately visible in the app — no restart needed.

### Mode 2: Acceptance Testing After Feature Implementation

After implementing a UI feature (e.g. ResearchTasksView), before committing:

1. Ensure the app is running (`npm start` or check with `ui_screenshot`)
2. Seed data via MCP: `create_research_task`, `create_person`, etc.
3. `ui_navigate("/research-tasks")` → verify the view loads
4. `ui_get_dom()` → assert tasks appear in the table
5. `ui_click()` → test status change, filter, add/delete interactions

This is faster than writing a full Playwright E2E test and covers the full IPC → Vue rendering stack that unit tests don't reach.

### Mode 3: Active Research Session

During genealogy research, use MCP tools to query and update data:

- `search_persons("Nilsson")` → find candidates
- `get_events_for_person(id)` → see what's already known
- `add_event(...)` → record a newly found birth record
- `get_research_tasks_for_person(id)` → check open tasks
- `get_current_database` → confirm which DB is active before making changes

### Data integrity rule: search before create

**Always call `search_persons` (or the relevant search tool) before `create_person`.** Never blindly create a record that may already exist. This applies to all entity types — persons, places, sources, groups. Duplicates are expensive to clean up and confuse users.

### Session Start Checklist

At the start of any session where UI work or research will happen:
1. Call `get_current_database` — confirm which DB is active
2. If the app is not running, UI tools (`ui_screenshot`, `ui_navigate`, etc.) will return errors — data tools still work
3. Data tools operate directly on SQLite; they do not require the Electron app to be running

---

## Running the MCP Server

### Standalone (for testing)
```bash
npx tsx src/mcp/server.ts
```
Uses the default DB path (`~/Library/Application Support/slaktforskning/slaktforskning.db` on macOS).

### With a test database
```bash
SLAKTFORSKNING_DB=/tmp/test.db npx tsx src/mcp/server.ts
```

### Via Claude Code
The MCP server is configured in `.claude/settings.local.json` as `slaktforskning`. Claude can call its tools directly (create_person, list_persons, etc.).

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

## Adding a New MCP Tool

MCP tools live in `src/mcp/createServer.ts` (not `server.ts` — that file only handles DB setup and launches the server). Use `registerTool()`, not the deprecated `tool()` overload:

```typescript
// src/mcp/createServer.ts — inside createMcpServer(db)
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
3. Add the MCP tool in `src/mcp/createServer.ts`
4. Add the IPC handler in `src/main/ipc.ts`
5. Add to preload in `src/preload/index.ts`
6. Test: `npm test && npx playwright test`

## Current MCP Tools

Read `references/tools.md` (in this skill directory) for the full tool list grouped by domain. `src/mcp/server.ts` is always authoritative — the reference file is a convenience summary.

## MCP Server Config

In `.claude/settings.local.json`:
```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"]
    }
  }
}
```
