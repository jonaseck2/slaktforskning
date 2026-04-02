---
name: mcp-dev
description: Add new MCP tools, test the MCP server, and debug MCP communication. Use when extending the MCP server or verifying agent-facing functionality.
---

# MCP Dev Skill

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

Follow this pattern in `src/mcp/server.ts`:

```typescript
server.tool('tool_name', 'Human-readable description', {
  // Zod schema for parameters
  param_name: z.string().describe('What this param does'),
  optional_param: z.string().optional().describe('Optional field'),
}, async (args) => {
  // Call the api/ function — NEVER put business logic here
  const result = apiModule.someFunction(db, args);
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});
```

### Rules:
1. **The MCP tool is a thin wrapper** — all logic lives in `src/api/`. The tool just calls the api function and returns JSON.
2. **Use Zod schemas** for parameter validation (imported as `z` from `'zod'`).
3. **Add `.describe()` to every parameter** — agents read these to understand what to pass.
4. **Return JSON in `content[0].text`** — always `JSON.stringify(result, null, 2)`.
5. **Handle not-found cases** — return a human-readable message like `'Person not found'`.

### End-to-end checklist for a new tool:
1. Implement the function in `src/api/*.ts`
2. Write unit tests in `tests/unit/`
3. Add the MCP tool in `src/mcp/server.ts`
4. Add the IPC handler in `src/main/ipc.ts`
5. Add to preload in `src/preload/index.ts`
6. Test: `npm test && npx playwright test`

## Current MCP Tools

See `src/mcp/server.ts` for the authoritative list of tools and their parameter schemas. Each tool is a thin wrapper over a `src/api/` function.

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
