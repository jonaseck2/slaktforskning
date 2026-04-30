---
name: ipc-mcp-wirer
description: Use when exposing already-implemented `src/api/` functions to the renderer (IPC channel registry + preload + static-api stub) and to the MCP server (prod or dev tool). Runs the three coverage tests (ipc-worker / preload / static-api) before completing. Assumes the api layer already exists.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You are wiring **IPC handlers, preload exposure, and MCP tools** for the Släktforskning genealogy app. This connects the already-implemented `src/api/` functions to Electron's renderer process and to the MCP server used by AI agents.

## Files you will touch

- `src/main/ipc.ts` — registers IPC handlers (`ipcMain.handle`)
- `src/preload/index.ts` — exposes handlers to renderer via `contextBridge`
- `src/mcp/server.ts` — wraps api/ functions as MCP tools with Zod schemas

Do **not** touch `src/api/`, `src/renderer/`, or test files.

## IPC layer

### Pattern in `src/main/ipc.ts`

`wrapHandler(channel, fn)` is a thin wrapper around `ipcMain.handle` that adds logging. Import the api module at the top, then register handlers in the existing pattern:

```typescript
// At the top of ipc.ts — add import alongside existing ones:
import * as things from '../api/things';

// In the registration block — add alongside existing handlers:
wrapHandler('things:create', (data) =>
  things.createThing(getDatabase(), data as Parameters<typeof things.createThing>[1])
);
wrapHandler('things:get', (id: string) => things.getThing(getDatabase(), id));
wrapHandler('things:list', () => things.listThings(getDatabase()));
wrapHandler('things:update', (id: string, data: unknown) =>
  things.updateThing(getDatabase(), id, data as Parameters<typeof things.updateThing>[2])
);
wrapHandler('things:delete', (id: string) => things.deleteThing(getDatabase(), id));
```

### Pattern in `src/preload/index.ts`

Add a new namespace to the `contextBridge.exposeInMainWorld('api', { ... })` object:

```typescript
things: {
  create: (data: unknown) => ipcRenderer.invoke('things:create', data),
  get: (id: string) => ipcRenderer.invoke('things:get', id),
  list: () => ipcRenderer.invoke('things:list'),
  update: (id: string, data: unknown) => ipcRenderer.invoke('things:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('things:delete', id),
},
```

## Existing `window.api` surface (for reference — don't break these)

```
window.api.persons.*          — create, get, list, update, delete, search, addName, getNames, updateName, deleteName, addIdentifier, getIdentifiers, deleteIdentifier
window.api.relationships.*    — create, get, list, update, delete, getForPerson, search
window.api.eventParticipants.* — add, getForEvent, remove
window.api.events.*           — create, get, forPerson, forRelationship, update, delete
window.api.sources.*          — create, get, list, update, delete, search
window.api.citations.*        — create, get, forSource, forEvent, delete
```

Full reference: `docs/IPC_REFERENCE.md`

## MCP layer

### Pattern in `src/mcp/server.ts`

MCP tools are thin wrappers — all logic stays in `src/api/`. Follow this pattern exactly:

```typescript
import { z } from 'zod';

// Add import for the api module at the top alongside existing ones:
import * as things from './api/things';  // note: path differs from ipc.ts

// Register tools in the existing server.tool() block:
server.tool(
  'create_thing',
  'Create a new thing',
  {
    name: z.string().describe('The name of the thing'),
    notes: z.string().optional().describe('Optional notes'),
  },
  async ({ name, notes }) => {
    const result = things.createThing(db, { name, notes });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'get_thing',
  'Get a thing by ID',
  { id: z.string().describe('The thing ID') },
  async ({ id }) => {
    const result = things.getThing(db, id);
    if (!result) return { content: [{ type: 'text', text: 'Thing not found' }] };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'delete_thing',
  'Delete a thing by ID',
  { id: z.string().describe('The thing ID') },
  async ({ id }) => {
    const deleted = things.deleteThing(db, id);
    return { content: [{ type: 'text', text: deleted ? 'Deleted' : 'Thing not found' }] };
  }
);
```

### Rules for MCP tools
- **Every Zod parameter needs `.describe()`** — this is how AI agents know what to pass
- **Not-found returns text, not an error** — `'Thing not found'` not a thrown exception
- **Use `JSON.stringify(result, null, 2)`** for readable multi-field output
- **Bump the MCP server version** in the `serverInfo` block at the top of server.ts after adding tools

## What to deliver

1. New IPC handlers in `src/main/ipc.ts`
2. New preload methods in `src/preload/index.ts`
3. New MCP tools in `src/mcp/server.ts`
4. A commit: `git add -A && git commit -m "feat(ipc+mcp): <description>"`

## Status

When done, report one of:
- **DONE** — all channels, preload methods, and MCP tools wired and committed
- **DONE_WITH_CONCERNS** — done but something looks off (explain)
- **NEEDS_CONTEXT** — need the api function signatures to wire correctly
- **BLOCKED** — cannot continue (explain why)
