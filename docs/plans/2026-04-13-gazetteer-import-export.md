# Gazetteer Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-database gazetteer storage with import/export for both humans (UI) and agents (MCP tools).

**Architecture:** New `gazetteers` table stores imported gazetteer JSON blobs per-database. A new `src/api/gazetteers.ts` module provides CRUD operations. The existing `loadGazetteers()` merges bundled + imported gazetteers. MCP tools expose schema introspection, import/export, and place resolution. The UI adds import/export/delete buttons to `GazetteersView`.

**Tech Stack:** SQLite (node-sqlite3-wasm), TypeScript, Vue 3, MCP SDK (zod schemas)

**Spec:** `docs/superpowers/specs/2026-04-13-gazetteer-import-export-design.md`

---

### Task 1: Schema + API — `gazetteers` table and CRUD functions

**Files:**
- Modify: `src/api/schema.ts:217` (add CREATE TABLE before closing backtick of main DDL)
- Create: `src/api/gazetteers.ts`
- Modify: `src/api/place-gazetteers/types.ts` (add `GazetteerInfo` type)
- Test: `tests/unit/gazetteers.test.ts`

- [ ] **Step 1: Add `GazetteerInfo` type to `src/api/place-gazetteers/types.ts`**

Append after the `GazetteerConfig` interface (line 43):

```typescript
export interface GazetteerInfo {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  bundled: boolean;
}
```

- [ ] **Step 2: Add `gazetteers` table to `src/api/schema.ts`**

Inside the main `db.exec()` block (before the closing backtick on line 217), add:

```sql
CREATE TABLE IF NOT EXISTS gazetteers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locale TEXT NOT NULL,
  description TEXT,
  source_json TEXT,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Write failing tests in `tests/unit/gazetteers.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import {
  importGazetteer,
  exportGazetteer,
  deleteGazetteer,
  listGazetteers,
  getImportedGazetteers,
  getGazetteerSchema,
} from '../../src/api/gazetteers';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const validGazetteer: Gazetteer = {
  id: 'test-places',
  name: 'Test Places',
  locale: 'en',
  description: 'A test gazetteer',
  source: { name: 'Test', url: 'https://example.com', license: 'CC0', fetched: '2026-01-01' },
  root: {
    name: 'TestCountry',
    type: 'country',
    lat: 50.0,
    lon: 10.0,
    children: [
      { name: 'TestRegion', type: 'region', lat: 51.0, lon: 11.0 },
    ],
  },
};

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('importGazetteer', () => {
  it('imports a valid gazetteer and returns summary', () => {
    const result = importGazetteer(db, JSON.stringify(validGazetteer));
    expect(result.id).toBe('test-places');
    expect(result.name).toBe('Test Places');
    expect(result.locale).toBe('en');
    expect(result.nodeCount).toBe(2); // root + 1 child
  });

  it('rejects invalid JSON', () => {
    expect(() => importGazetteer(db, 'not json')).toThrow();
  });

  it('rejects gazetteer missing required fields', () => {
    expect(() => importGazetteer(db, JSON.stringify({ id: 'x' }))).toThrow(/name/i);
  });

  it('rejects gazetteer with missing node coordinates', () => {
    const bad = { ...validGazetteer, root: { name: 'X', type: 'y' } };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow(/lat/i);
  });

  it('rejects bundled gazetteer IDs', () => {
    const bundled = { ...validGazetteer, id: 'sv-socknar' };
    expect(() => importGazetteer(db, JSON.stringify(bundled))).toThrow(/bundled/i);
  });

  it('upserts on duplicate id', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    const updated = { ...validGazetteer, name: 'Updated Name' };
    const result = importGazetteer(db, JSON.stringify(updated));
    expect(result.name).toBe('Updated Name');
    const list = getImportedGazetteers(db);
    expect(list).toHaveLength(1);
  });
});

describe('exportGazetteer', () => {
  it('exports an imported gazetteer as JSON', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    const json = exportGazetteer(db, 'test-places');
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.id).toBe('test-places');
    expect(parsed.root.children).toHaveLength(1);
  });

  it('exports a bundled gazetteer as JSON', () => {
    const json = exportGazetteer(db, 'sv-socknar');
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.id).toBe('sv-socknar');
    expect(parsed.root.name).toBe('Sverige');
  });

  it('returns null for unknown id', () => {
    expect(exportGazetteer(db, 'nonexistent')).toBeNull();
  });
});

describe('deleteGazetteer', () => {
  it('deletes an imported gazetteer', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    expect(deleteGazetteer(db, 'test-places')).toBe(true);
    expect(getImportedGazetteers(db)).toHaveLength(0);
  });

  it('returns false for bundled gazetteer', () => {
    expect(deleteGazetteer(db, 'sv-socknar')).toBe(false);
  });

  it('returns false for unknown id', () => {
    expect(deleteGazetteer(db, 'nonexistent')).toBe(false);
  });

  it('removes deleted id from gazetteer_config', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    // Simulate enabling the gazetteer in config
    const { setDbSetting, getDbSetting } = require('../../src/api/db_settings');
    setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['sv-socknar', 'test-places'] }));
    deleteGazetteer(db, 'test-places');
    const config = JSON.parse(getDbSetting(db, 'gazetteer_config')!);
    expect(config.enabledGazetteers).toEqual(['sv-socknar']);
  });
});

describe('listGazetteers', () => {
  it('lists bundled gazetteers with bundled=true', () => {
    const list = listGazetteers(db);
    const svSocknar = list.find(g => g.id === 'sv-socknar');
    expect(svSocknar).toBeDefined();
    expect(svSocknar!.bundled).toBe(true);
  });

  it('lists imported gazetteers with bundled=false', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    const list = listGazetteers(db);
    const imported = list.find(g => g.id === 'test-places');
    expect(imported).toBeDefined();
    expect(imported!.bundled).toBe(false);
    expect(imported!.name).toBe('Test Places');
  });
});

describe('getImportedGazetteers', () => {
  it('returns empty array when no imports exist', () => {
    expect(getImportedGazetteers(db)).toEqual([]);
  });

  it('returns full Gazetteer objects with tree data', () => {
    importGazetteer(db, JSON.stringify(validGazetteer));
    const imported = getImportedGazetteers(db);
    expect(imported).toHaveLength(1);
    expect(imported[0].root.children).toHaveLength(1);
  });
});

describe('getGazetteerSchema', () => {
  it('returns a schema object with properties for Gazetteer', () => {
    const schema = getGazetteerSchema();
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('id');
    expect(schema.properties).toHaveProperty('root');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- tests/unit/gazetteers.test.ts`
Expected: FAIL — module `../../src/api/gazetteers` not found

- [ ] **Step 5: Implement `src/api/gazetteers.ts`**

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Gazetteer, GazetteerInfo, GazetteerNode, GazetteerSource } from './place-gazetteers/types';
import { getAllGazetteers } from './place-gazetteers/index';
import { getDbSetting, setDbSetting } from './db_settings';

const BUNDLED_IDS = new Set(getAllGazetteers().map(g => g.id));
const MAX_JSON_SIZE = 50 * 1024 * 1024; // 50 MB

function countNodes(node: GazetteerNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) count += countNodes(child);
  }
  return count;
}

function validateNode(node: unknown, path: string): asserts node is GazetteerNode {
  if (typeof node !== 'object' || node === null) {
    throw new Error(`Invalid node at ${path}: expected object`);
  }
  const n = node as Record<string, unknown>;
  if (typeof n.name !== 'string' || !n.name) {
    throw new Error(`Invalid node at ${path}: missing or empty 'name'`);
  }
  if (typeof n.type !== 'string' || !n.type) {
    throw new Error(`Invalid node at ${path}: missing or empty 'type'`);
  }
  if (typeof n.lat !== 'number') {
    throw new Error(`Invalid node at ${path}: missing or non-numeric 'lat'`);
  }
  if (typeof n.lon !== 'number') {
    throw new Error(`Invalid node at ${path}: missing or non-numeric 'lon'`);
  }
  if (n.aliases !== undefined) {
    if (!Array.isArray(n.aliases) || !n.aliases.every((a: unknown) => typeof a === 'string')) {
      throw new Error(`Invalid node at ${path}: 'aliases' must be string[]`);
    }
  }
  if (n.children !== undefined) {
    if (!Array.isArray(n.children)) {
      throw new Error(`Invalid node at ${path}: 'children' must be array`);
    }
    for (let i = 0; i < n.children.length; i++) {
      validateNode(n.children[i], `${path}.children[${i}]`);
    }
  }
}

function validateGazetteer(data: unknown): asserts data is Gazetteer {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Gazetteer must be a JSON object');
  }
  const g = data as Record<string, unknown>;
  if (typeof g.id !== 'string' || !g.id) {
    throw new Error("Missing or empty required field: 'id'");
  }
  if (typeof g.name !== 'string' || !g.name) {
    throw new Error("Missing or empty required field: 'name'");
  }
  if (typeof g.locale !== 'string' || !g.locale) {
    throw new Error("Missing or empty required field: 'locale'");
  }
  if (!g.root || typeof g.root !== 'object') {
    throw new Error("Missing or invalid required field: 'root'");
  }
  validateNode(g.root, 'root');
}

export function importGazetteer(
  db: Database,
  jsonString: string,
): { id: string; name: string; locale: string; nodeCount: number } {
  if (jsonString.length > MAX_JSON_SIZE) {
    throw new Error(`Gazetteer JSON exceeds ${MAX_JSON_SIZE / 1024 / 1024} MB limit`);
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON');
  }

  validateGazetteer(data);

  if (BUNDLED_IDS.has(data.id)) {
    throw new Error(`Cannot import: '${data.id}' conflicts with a bundled gazetteer ID`);
  }

  const nodeCount = countNodes(data.root);
  const sourceJson = data.source ? JSON.stringify(data.source) : null;

  const stmt = db.prepare(`
    INSERT INTO gazetteers (id, name, locale, description, source_json, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      locale = excluded.locale,
      description = excluded.description,
      source_json = excluded.source_json,
      data = excluded.data,
      created_at = datetime('now')
  `);
  stmt.run([data.id, data.name, data.locale, data.description ?? null, sourceJson, jsonString]);

  return { id: data.id, name: data.name, locale: data.locale, nodeCount };
}

export function exportGazetteer(db: Database, id: string): string | null {
  // Check imported first
  const row = db.prepare('SELECT data FROM gazetteers WHERE id = ?').get([id]) as { data: string } | undefined;
  if (row) return row.data;

  // Check bundled
  const bundled = getAllGazetteers().find(g => g.id === id);
  if (bundled) return JSON.stringify(bundled);

  return null;
}

export function deleteGazetteer(db: Database, id: string): boolean {
  if (BUNDLED_IDS.has(id)) return false;

  const changes = db.prepare('DELETE FROM gazetteers WHERE id = ?').run([id]);
  if (typeof changes === 'number' ? changes === 0 : (changes as { changes: number }).changes === 0) {
    return false;
  }

  // Remove from gazetteer_config if present
  const raw = getDbSetting(db, 'gazetteer_config');
  if (raw) {
    try {
      const config = JSON.parse(raw);
      if (Array.isArray(config.enabledGazetteers) && config.enabledGazetteers.includes(id)) {
        config.enabledGazetteers = config.enabledGazetteers.filter((g: string) => g !== id);
        setDbSetting(db, 'gazetteer_config', JSON.stringify(config));
      }
    } catch {
      // ignore malformed config
    }
  }

  return true;
}

export function listGazetteers(db: Database): GazetteerInfo[] {
  const bundled: GazetteerInfo[] = getAllGazetteers().map(g => ({
    id: g.id,
    name: g.name,
    locale: g.locale,
    description: g.description,
    source: g.source,
    bundled: true,
  }));

  const rows = db.prepare('SELECT id, name, locale, description, source_json FROM gazetteers').all([]) as Array<{
    id: string; name: string; locale: string; description: string | null; source_json: string | null;
  }>;

  const imported: GazetteerInfo[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    locale: r.locale,
    description: r.description ?? undefined,
    source: r.source_json ? JSON.parse(r.source_json) as GazetteerSource : undefined,
    bundled: false,
  }));

  return [...bundled, ...imported];
}

export function getImportedGazetteers(db: Database): Gazetteer[] {
  const rows = db.prepare('SELECT data FROM gazetteers').all([]) as Array<{ data: string }>;
  return rows.map(r => JSON.parse(r.data) as Gazetteer);
}

export function getGazetteerSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['id', 'name', 'locale', 'root'],
    properties: {
      id: { type: 'string', description: 'Unique identifier, e.g. "us-counties". Must not conflict with bundled gazetteer IDs.' },
      name: { type: 'string', description: 'Human-readable display name' },
      locale: { type: 'string', description: 'Locale code, e.g. "en", "sv", "de"' },
      description: { type: 'string', description: 'Optional human-readable description' },
      source: {
        type: 'object',
        description: 'Optional metadata about the data source',
        properties: {
          name: { type: 'string', description: 'Source name, e.g. "Wikidata"' },
          url: { type: 'string', description: 'Source URL' },
          license: { type: 'string', description: 'License, e.g. "CC0 1.0"' },
          created: { type: 'string', description: 'ISO date when source dataset was established' },
          fetched: { type: 'string', description: 'ISO date of last fetch' },
          kgmid: { type: 'string', description: 'Google Knowledge Graph ID' },
        },
      },
      root: { '$ref': '#/$defs/GazetteerNode' },
    },
    $defs: {
      GazetteerNode: {
        type: 'object',
        required: ['name', 'type', 'lat', 'lon'],
        properties: {
          name: { type: 'string', description: 'Display name of the place' },
          type: { type: 'string', description: 'Place type, e.g. "country", "county", "municipality", "parish", "locality", "church", "farm"' },
          aliases: { type: 'array', items: { type: 'string' }, description: 'Spelling variants and historical names' },
          lat: { type: 'number', description: 'Latitude (WGS 84)' },
          lon: { type: 'number', description: 'Longitude (WGS 84)' },
          children: { type: 'array', items: { '$ref': '#/$defs/GazetteerNode' }, description: 'Child places in the hierarchy' },
        },
      },
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/unit/gazetteers.test.ts`
Expected: All tests PASS

Note: The `deleteGazetteer` function uses `db.prepare(...).run()` which returns different shapes depending on the sqlite3-wasm version. Check what the project's version returns — if `.run()` returns the number of changes directly, simplify the check. If it returns `void`, use a SELECT before DELETE to check existence.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: gazetteer import/export API with validation and blob storage"
```

---

### Task 2: Update `loadGazetteers` to merge bundled + imported

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`
- Modify: `tests/unit/place-gazetteers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/unit/place-gazetteers.test.ts` in the `loadGazetteers` describe block:

```typescript
it('merges imported gazetteers with bundled when provided', () => {
  const imported: Gazetteer[] = [{
    id: 'test-imported',
    name: 'Test Imported',
    locale: 'en',
    root: { name: 'TestRoot', type: 'country', lat: 0, lon: 0 },
  }];
  const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar', 'test-imported'] };
  const result = loadGazetteers(config, imported);
  expect(result).toHaveLength(2);
  expect(result.map(g => g.id).sort()).toEqual(['sv-socknar', 'test-imported']);
});

it('filters imported gazetteers by config', () => {
  const imported: Gazetteer[] = [{
    id: 'test-imported',
    name: 'Test Imported',
    locale: 'en',
    root: { name: 'TestRoot', type: 'country', lat: 0, lon: 0 },
  }];
  const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
  const result = loadGazetteers(config, imported);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('sv-socknar');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/place-gazetteers.test.ts`
Expected: FAIL — `loadGazetteers` doesn't accept second argument / wrong result count

- [ ] **Step 3: Update `loadGazetteers` in `src/api/place-gazetteers/index.ts`**

Change the function signature to accept an optional second parameter:

```typescript
export function loadGazetteers(config: GazetteerConfig, imported: Gazetteer[] = []): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const all = [...BUNDLED_GAZETTEERS, ...imported];
  return all.filter(g => enabled.has(g.id));
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test -- tests/unit/place-gazetteers.test.ts`
Expected: All tests PASS (existing tests still work because `imported` defaults to `[]`)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: loadGazetteers merges bundled + imported gazetteers"
```

---

### Task 3: IPC handlers for gazetteer operations

**Files:**
- Create: `src/main/ipc/gazetteers.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [x] **Step 1: Create `src/main/ipc/gazetteers.ts`**

```typescript
import type { WrapHandlerFn } from './wrap-handler';
import * as gazetteers from '../../api/gazetteers';

export function registerGazetteerHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  wrapHandler: WrapHandlerFn,
) {
  wrapHandler('gazetteers:list', () => gazetteers.listGazetteers(getDb()));
  wrapHandler('gazetteers:import', (json) => gazetteers.importGazetteer(getDb(), json as string));
  wrapHandler('gazetteers:export', (id) => gazetteers.exportGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:delete', (id) => gazetteers.deleteGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:getImported', () => gazetteers.getImportedGazetteers(getDb()));
  wrapHandler('gazetteers:getSchema', () => gazetteers.getGazetteerSchema());
}
```

- [x] **Step 2: Register in `src/main/ipc/index.ts`**

Add import at line 10 (after the `database` import):

```typescript
import { registerGazetteerHandlers } from './gazetteers';
```

Add registration call inside `registerIpcHandlers()` (after `registerUtilityHandlers`):

```typescript
registerGazetteerHandlers(getDb, wrapHandler);
```

- [x] **Step 3: Add preload API surface in `src/preload/index.ts`**

Add a `gazetteers` section to the `api` object (after the `backup` section, around line 212):

```typescript
gazetteers: {
  list: () => ipcRenderer.invoke('gazetteers:list'),
  import: mutating((json: string) => ipcRenderer.invoke('gazetteers:import', json)),
  export: (id: string) => ipcRenderer.invoke('gazetteers:export', id),
  delete: mutating((id: string) => ipcRenderer.invoke('gazetteers:delete', id)),
  getImported: () => ipcRenderer.invoke('gazetteers:getImported'),
  getSchema: () => ipcRenderer.invoke('gazetteers:getSchema'),
},
```

- [x] **Step 4: Run tests to verify nothing is broken**

Run: `npm test`
Expected: All existing tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: IPC handlers and preload API for gazetteer import/export"
```

---

### Task 4: MCP tools for gazetteers

**Files:**
- Create: `src/mcp/tools/gazetteers.ts`
- Modify: `src/mcp/createServer.ts`

- [x] **Step 1: Create `src/mcp/tools/gazetteers.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  importGazetteer,
  exportGazetteer,
  deleteGazetteer,
  listGazetteers,
  getGazetteerSchema,
  getImportedGazetteers,
} from '../../api/gazetteers';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace, searchGazetteer } from '../../api/place-gazetteers/resolver';
import { getDbSetting } from '../../api/db_settings';
import type { GazetteerConfig } from '../../api/place-gazetteers/types';
import type { ToolContext } from './types';

function getEnabledGazetteers(ctx: ToolContext) {
  const db = ctx.getDb();
  const raw = getDbSetting(db, 'gazetteer_config');
  const config: GazetteerConfig = raw
    ? JSON.parse(raw) as GazetteerConfig
    : { enabledGazetteers: [] };
  const imported = getImportedGazetteers(db);
  return loadGazetteers(config, imported);
}

export function registerGazetteerTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('get_gazetteer_schema', {
    description: 'Get the JSON Schema for the Gazetteer format. Use this to understand what structure a gazetteer JSON must have before creating one. Use export_gazetteer on a bundled gazetteer (e.g. "sv-socknar") to see a concrete example.',
  }, async () => {
    const schema = getGazetteerSchema();
    return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
  });

  server.registerTool('list_gazetteers', {
    description: 'List all available gazetteers (bundled + imported) with metadata. Does not include the tree data — use export_gazetteer to get the full data.',
  }, async () => {
    const list = listGazetteers(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('import_gazetteer', {
    description: 'Import a gazetteer JSON blob into the current database. Validates the format, stores it, and returns a summary. If a gazetteer with the same ID already exists, it is replaced. Cannot overwrite bundled gazetteers.',
    inputSchema: {
      json: z.string().describe('Complete gazetteer JSON string conforming to the Gazetteer schema (use get_gazetteer_schema to see the format)'),
    },
  }, async (args) => {
    const result = importGazetteer(getDb(), args.json);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('export_gazetteer', {
    description: 'Export a gazetteer as a JSON string. Works for both bundled and imported gazetteers. Exporting a bundled gazetteer is useful to see a concrete example of the format.',
    inputSchema: {
      id: z.string().describe('Gazetteer ID (e.g. "sv-socknar" for bundled, or the ID of an imported gazetteer)'),
    },
  }, async (args) => {
    const json = exportGazetteer(getDb(), args.id);
    if (!json) return { content: [{ type: 'text', text: 'Gazetteer not found' }] };
    return { content: [{ type: 'text', text: json }] };
  });

  server.registerTool('delete_gazetteer', {
    description: 'Delete an imported gazetteer from the current database. Cannot delete bundled gazetteers.',
    inputSchema: {
      id: z.string().describe('Gazetteer ID to delete'),
    },
  }, async (args) => {
    const ok = deleteGazetteer(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found or is a bundled gazetteer' }] };
  });

  server.registerTool('resolve_place', {
    description: 'Resolve a place name string against all enabled gazetteers. Returns coordinates, match quality (exact/partial/ambiguous), matched path in the hierarchy, and unmatched components.',
    inputSchema: {
      name: z.string().describe('Place name string, optionally comma-separated hierarchy (e.g. "Vallsjö, Sävsjö, Jönköpings län, Sverige")'),
    },
  }, async (args) => {
    const gazetteers = getEnabledGazetteers(ctx);
    const result = resolvePlace(args.name, gazetteers);
    if (!result) return { content: [{ type: 'text', text: 'No match found in enabled gazetteers' }] };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('search_gazetteer', {
    description: 'Search enabled gazetteers for nodes matching a query string. Returns matching nodes with their full path in the hierarchy.',
    inputSchema: {
      query: z.string().describe('Search query'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default 10)'),
    },
  }, async (args) => {
    const gazetteers = getEnabledGazetteers(ctx);
    const hits = searchGazetteer(args.query, gazetteers, args.limit);
    const results = hits.map(h => ({
      name: h.node.name,
      type: h.node.type,
      lat: h.node.lat,
      lon: h.node.lon,
      path: h.path.map(n => n.name),
      gazetteer: h.gazetteer,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });
}
```

- [x] **Step 2: Register in `src/mcp/createServer.ts`**

Add import after line 8:

```typescript
import { registerGazetteerTools } from './tools/gazetteers';
```

Add registration call after `registerUtilityTools` (before the `return server` line):

```typescript
registerGazetteerTools(server, ctx);
```

- [x] **Step 3: Run tests to verify nothing is broken**

Run: `npm test`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: MCP tools for gazetteer schema, import/export, resolve, search"
```

---

### Task 5: Update `usePlaceResolver` to load imported gazetteers

**Files:**
- Modify: `src/renderer/composables/usePlaceResolver.ts`

- [ ] **Step 1: Update `ensureLoaded()` to fetch imported gazetteers via IPC**

Replace the `ensureLoaded` function body in `src/renderer/composables/usePlaceResolver.ts`:

Change lines 17-26 from:
```typescript
  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
    const config: GazetteerConfig = raw
      ? JSON.parse(raw) as GazetteerConfig
      : { enabledGazetteers: [] };
    gazetteersRef = loadGazetteers(config);
    configLoaded = true;
    ready.value = true;
  }
```

To:
```typescript
  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
    const config: GazetteerConfig = raw
      ? JSON.parse(raw) as GazetteerConfig
      : { enabledGazetteers: [] };
    const imported = (await window.api.gazetteers.getImported()) as Gazetteer[];
    gazetteersRef = loadGazetteers(config, imported);
    configLoaded = true;
    ready.value = true;
  }
```

- [ ] **Step 2: Run tests to verify nothing is broken**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: usePlaceResolver loads imported gazetteers from database"
```

---

### Task 6: Update GazetteersView UI with import/export/delete

**Files:**
- Modify: `src/renderer/views/GazetteersView.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add i18n strings to `src/renderer/i18n/en.ts`**

In the `gazetteers` section (around line 1101, after `noGazetteers`), add:

```typescript
importBtn: 'Import',
importSuccess: 'Imported "{name}" ({nodeCount} places)',
importError: 'Import failed: {error}',
exportBtn: 'Export',
deleteBtn: 'Delete',
deleteConfirmTitle: 'Delete Gazetteer',
deleteConfirmMessage: 'Delete gazetteer "{name}"? This cannot be undone.',
bundled: 'Bundled',
imported: 'Imported',
nodeCount: '{count} places',
```

- [ ] **Step 2: Add i18n strings to `src/renderer/i18n/sv.ts`**

In the `gazetteers` section (around line 1080, after `noGazetteers`), add:

```typescript
importBtn: 'Importera',
importSuccess: 'Importerade "{name}" ({nodeCount} platser)',
importError: 'Import misslyckades: {error}',
exportBtn: 'Exportera',
deleteBtn: 'Ta bort',
deleteConfirmTitle: 'Ta bort ortsregister',
deleteConfirmMessage: 'Ta bort ortsregistret "{name}"? Detta kan inte ångras.',
bundled: 'Inbyggt',
imported: 'Importerat',
nodeCount: '{count} platser',
```

- [ ] **Step 3: Rewrite `GazetteersView.vue`**

Replace the entire `<template>` and `<script setup>` sections. Keep the existing `<style scoped>` block and add new styles.

The key changes:
1. Header gets an Import button
2. Gazetteer list uses `listGazetteers` IPC (which returns bundled + imported with `bundled` flag)
3. Each card gets Export button (all) and Delete button (imported only)
4. A badge shows "Bundled" or "Imported"
5. Import button opens file picker via a hidden `<input type="file">`
6. Delete shows ConfirmModal before deleting

Template:
```vue
<template>
  <div>
    <div class="header">
      <h2>{{ $t('gazetteers.title') }}</h2>
      <button class="btn-add" @click="fileInput?.click()">+ {{ $t('gazetteers.importBtn') }}</button>
      <input
        ref="fileInput"
        type="file"
        accept=".json,.json.gz"
        style="display: none"
        @change="handleImport"
      />
    </div>

    <p class="gazetteers-description">{{ $t('gazetteers.description') }}</p>

    <!-- Installed gazetteers -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.installed') }}</h4>
      </div>
      <div v-if="gazetteerList.length > 0" class="gazetteer-cards">
        <div v-for="gaz in gazetteerList" :key="gaz.id" class="gazetteer-card">
          <div class="gazetteer-card-header">
            <label class="gazetteer-toggle">
              <input
                type="checkbox"
                :checked="config.enabledGazetteers.includes(gaz.id)"
                @change="toggleGazetteer(gaz.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="gazetteer-card-name">{{ gaz.name }}</span>
            </label>
            <div class="gazetteer-card-actions">
              <span :class="['type-badge', gaz.bundled ? 'type-bundled' : 'type-imported']">
                {{ gaz.bundled ? $t('gazetteers.bundled') : $t('gazetteers.imported') }}
              </span>
              <button class="btn-sm" @click="handleExport(gaz.id, gaz.name)">{{ $t('gazetteers.exportBtn') }}</button>
              <button v-if="!gaz.bundled" class="btn-delete" @click="confirmDelete(gaz)">{{ $t('gazetteers.deleteBtn') }}</button>
            </div>
          </div>
          <div v-if="gaz.description" class="gazetteer-card-desc">{{ gaz.description }}</div>
          <div v-if="gaz.source" class="gazetteer-card-source">
            {{ $t('gazetteers.source') }}:
            <a href="#" @click.prevent="openExternal(gaz.source.url)">{{ gaz.source.name }}</a>
            <span class="source-license">({{ gaz.source.license }})</span>
            <span v-if="gaz.source.created" class="source-date">{{ $t('gazetteers.created') }} {{ gaz.source.created }}</span>
            <span class="source-date">{{ $t('gazetteers.fetched') }} {{ gaz.source.fetched }}</span>
            <a v-if="gaz.source.kgmid" href="#" class="source-kg-link" @click.prevent="openExternal('https://www.google.com/search?kgmid=' + encodeURIComponent(gaz.source.kgmid))">{{ $t('gazetteers.knowledgeGraph') }}</a>
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">{{ $t('gazetteers.noGazetteers') }}</p>
    </div>

    <!-- Test lookup (unchanged) -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.testLookup') }}</h4>
      </div>
      <input
        v-model="testQuery"
        type="text"
        class="test-input"
        :placeholder="$t('gazetteers.testPlaceholder')"
      />
      <div v-if="testQuery && results.length > 0" class="test-results">
        <div v-for="r in results" :key="r.gaz.id" class="test-result">
          <div class="result-header">
            <span :class="['quality-badge', 'quality-' + r.result.matchQuality]">
              {{ $t('gazetteers.match.' + r.result.matchQuality) }}
            </span>
            <span class="result-gazetteer">{{ r.gaz.name }}</span>
          </div>
          <div class="result-path">{{ r.result.matchedPath.join(' > ') }}</div>
          <div class="result-details">
            <span class="result-coords">{{ r.result.lat.toFixed(4) }}, {{ r.result.lon.toFixed(4) }}</span>
            <span v-if="r.result.unmatchedComponents.length > 0" class="result-unmatched">
              {{ $t('gazetteers.unmatched') }}: {{ r.result.unmatchedComponents.join(', ') }}
            </span>
          </div>
        </div>
      </div>
      <p v-else-if="testQuery && results.length === 0" class="empty-hint">{{ $t('gazetteers.noMatch') }}</p>
    </div>

    <ConfirmModal
      :visible="!!deletingGaz"
      :title="$t('gazetteers.deleteConfirmTitle')"
      :message="$t('gazetteers.deleteConfirmMessage', { name: deletingGaz?.name ?? '' })"
      @confirm="doDelete"
      @cancel="deletingGaz = null"
    />
  </div>
</template>
```

Script:
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, GazetteerInfo, Gazetteer } from '../../api/place-gazetteers/types';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import ConfirmModal from '../components/ConfirmModal.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { invalidate: invalidatePlaceResolver } = usePlaceResolver();

const gazetteerList = ref<GazetteerInfo[]>([]);
const config = ref<GazetteerConfig>({ enabledGazetteers: [] });
const testQuery = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const deletingGaz = ref<GazetteerInfo | null>(null);

// For test lookup, load full gazetteers (bundled + imported) matching enabled config
const enabledGazetteers = ref<Gazetteer[]>([]);

async function loadAll() {
  gazetteerList.value = (await window.api.gazetteers.list()) as GazetteerInfo[];
  const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
  if (raw) {
    try { config.value = JSON.parse(raw) as GazetteerConfig; } catch { /* keep default */ }
  } else {
    // Default: enable all
    config.value = { enabledGazetteers: gazetteerList.value.map(g => g.id) };
  }
  await refreshEnabledGazetteers();
}

async function refreshEnabledGazetteers() {
  const imported = (await window.api.gazetteers.getImported()) as Gazetteer[];
  enabledGazetteers.value = loadGazetteers(config.value, imported);
}

const results = computed(() => {
  const q = testQuery.value;
  if (!q) return [];
  return enabledGazetteers.value
    .map(gaz => ({ gaz, result: resolvePlace(q, [gaz]) }))
    .filter((r): r is { gaz: Gazetteer; result: NonNullable<ReturnType<typeof resolvePlace>> } => r.result !== null);
});

async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  invalidatePlaceResolver();
  await refreshEnabledGazetteers();
}

function toggleGazetteer(id: string, checked: boolean) {
  if (checked) {
    if (!config.value.enabledGazetteers.includes(id)) {
      config.value = { ...config.value, enabledGazetteers: [...config.value.enabledGazetteers, id] };
    }
  } else {
    config.value = { ...config.value, enabledGazetteers: config.value.enabledGazetteers.filter(g => g !== id) };
  }
  saveConfig();
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    let text: string;
    if (file.name.endsWith('.gz')) {
      const buffer = await file.arrayBuffer();
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(buffer));
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks);
      text = await blob.text();
    } else {
      text = await file.text();
    }

    const result = (await window.api.gazetteers.import(text)) as { id: string; name: string; nodeCount: number };

    // Auto-enable the imported gazetteer
    if (!config.value.enabledGazetteers.includes(result.id)) {
      config.value = { ...config.value, enabledGazetteers: [...config.value.enabledGazetteers, result.id] };
      await saveConfig();
    }

    await loadAll();
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    input.value = ''; // reset file input
  }
}

async function handleExport(id: string, name: string) {
  const json = (await window.api.gazetteers.export(id)) as string | null;
  if (!json) return;

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmDelete(gaz: GazetteerInfo) {
  deletingGaz.value = gaz;
}

async function doDelete() {
  if (!deletingGaz.value) return;
  await window.api.gazetteers.delete(deletingGaz.value.id);
  deletingGaz.value = null;
  invalidatePlaceResolver();
  await loadAll();
}

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}

onMounted(loadAll);
</script>
```

- [ ] **Step 4: Add new styles**

Add to the `<style scoped>` block:

```css
.gazetteer-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gazetteer-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
}

.type-bundled {
  background: #e0e7ff;
  color: #3730a3;
}

.type-imported {
  background: #d1fae5;
  color: #065f46;
}
```

- [ ] **Step 5: Run tests to verify nothing is broken**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: GazetteersView import/export/delete UI with badges and confirmation"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/MCP.md`
- Modify: `docs/IPC_REFERENCE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the API Functions section, add a `gazetteers.ts` subsection:

```markdown
### gazetteers.ts
\`\`\`
importGazetteer(db, jsonString) → { id, name, locale, nodeCount }
exportGazetteer(db, id) → string | null
deleteGazetteer(db, id) → boolean
listGazetteers(db) → GazetteerInfo[]
getImportedGazetteers(db) → Gazetteer[]
getGazetteerSchema() → JSON Schema object
\`\`\`
```

In the IPC/preload section, add `gazetteers` namespace.

In the MCP tools section, add the 7 gazetteer tools.

In the File Map, add `src/api/gazetteers.ts` entry.

- [ ] **Step 2: Update `docs/MCP.md`**

Add a Gazetteer tools section:

```markdown
**Gazetteer tools:** `get_gazetteer_schema`, `list_gazetteers`, `import_gazetteer`, `export_gazetteer`, `delete_gazetteer`, `resolve_place`, `search_gazetteer`
```

- [ ] **Step 3: Update `docs/IPC_REFERENCE.md`**

Add the gazetteer IPC channels mapping.

- [ ] **Step 4: Update `docs/PLAN.md`**

Mark the gazetteer import/export milestone as done with a pointer to the plan file.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add gazetteer import/export to CLAUDE.md, MCP.md, IPC_REFERENCE.md, PLAN.md"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit any fixes if needed**

Only if previous steps required changes.
