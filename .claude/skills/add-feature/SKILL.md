---
name: add-feature
description: Add a new feature, entity type, or field to the Släktforskning codebase. Use this skill whenever implementing any new data model change, CRUD operation, IPC channel, MCP tool, or Vue UI component — even if the user just says "add X" or "implement Y". Covers the full stack: schema, API, IPC, preload, MCP, Vue.
---

# Adding a Feature to Släktforskning

This codebase has a strict layered architecture. Every data feature touches all layers in order. Skipping a layer means the feature is unreachable from either the UI or MCP agents.

## The Checklist

Follow this order. Each step builds on the previous.

1. **Types** — define or extend the TypeScript interface in `src/api/types.ts`
2. **Schema** — add/alter tables in `src/api/schema.ts`; new tables use `CREATE TABLE IF NOT EXISTS`; new columns on existing tables **must** use a migration guard block (see below)
3. **API functions** — implement CRUD in `src/api/*.ts` (pure TS, `db: Database` as first arg, no Electron deps)
4. **Unit tests** — write tests in `tests/unit/` using `createTestDb()` before wiring anything else
5. **IPC handler** — register in `src/main/ipc.ts` using `wrapHandler(channel, fn)`
6. **Preload** — expose on `window.api.*` in `src/preload/index.ts`
7. **MCP tool** — add thin wrapper in `src/mcp/server.ts` (Zod schema, JSON response)
8. **Vue UI** — build component or extend view in `src/renderer/`
9. **Verify** — `npm test && npx playwright test`
10. **Docs** — update `README.md`, `CLAUDE.md`, `.claude/PLAN.md`, `.claude/DATA_MODEL.md`

## API Layer (Steps 1-4)

### Database migrations — adding columns to existing tables

`CREATE TABLE IF NOT EXISTS` only creates the table if it doesn't exist — it **never** adds missing columns to an existing database. Any new column on an existing table requires a migration guard at the end of `initializeSchema()` in `src/api/schema.ts`:

```typescript
// Append inside initializeSchema(), after the main db.exec block.
// Label with the version that introduced these columns.
// v0.5.0 migrations
const thingsCols = (db.prepare('PRAGMA table_info(things)').all([]) as Array<{ name: string }>).map(c => c.name);
if (!thingsCols.includes('new_column')) {
  db.exec('ALTER TABLE things ADD COLUMN new_column TEXT');
}
if (!thingsCols.includes('another_column')) {
  db.exec('ALTER TABLE things ADD COLUMN another_column INTEGER NOT NULL DEFAULT 0');
}
```

Rules:
- One `PRAGMA table_info` call per table, then check each new column separately
- Match the column definition exactly (type, DEFAULT, constraints) to the `CREATE TABLE` statement above
- **Never skip this** — missing migration = runtime crash for any user with a pre-existing database

### SQLite quirks (node-sqlite3-wasm)

These differ from better-sqlite3 — get them wrong and nothing breaks at compile time:

- Parameter binding uses **arrays**: `stmt.run([a, b])` not `stmt.run(a, b)`
- `db.get()` returns `undefined` not `null` — use `?? null` on every result
- No `.pragma()` — use `db.exec('PRAGMA foreign_keys = ON')`
- `.run()` returns `{ changes: number }` — cast if TypeScript complains

### API function pattern

```typescript
// src/api/things.ts
import { Database } from '../main/database';
import { Thing } from './types';

export function createThing(db: Database, data: { name: string }): Thing {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO things (id, name) VALUES (?, ?)').run([id, data.name]);
  return db.prepare('SELECT * FROM things WHERE id = ?').get([id]) as Thing;
}

export function deleteThing(db: Database, id: string): boolean {
  return (db.prepare('DELETE FROM things WHERE id = ?').run([id]) as { changes: number }).changes > 0;
}
```

### Unit test pattern

```typescript
// tests/unit/things.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createThing, deleteThing } from '../../src/api/things';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('things', () => {
  it('creates and retrieves a thing', () => {
    const thing = createThing(db, { name: 'Test' });
    expect(thing.name).toBe('Test');
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteThing(db, 'nonexistent')).toBe(false);
  });
});
```

Run after writing: `npm test -- --coverage` — verify thresholds still pass (80% lines and functions on `src/api/`)

## IPC Layer (Steps 5-6)

### Adding a new IPC channel

```typescript
// src/main/ipc.ts — import the api module at the top, then:
wrapHandler('things:create', (data) => things.createThing(getDatabase(), data as Parameters<typeof things.createThing>[1]));
wrapHandler('things:delete', (id: string) => things.deleteThing(getDatabase(), id));

// src/preload/index.ts — add to the contextBridge api object:
things: {
  create: (data: unknown) => ipcRenderer.invoke('things:create', data),
  delete: (id: string) => ipcRenderer.invoke('things:delete', id),
},

// Vue component — use it:
await window.api.things.create({ name: 'test' });
```

The preload TypeScript declaration used in Vue components:
```typescript
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};
```

See `.claude/IPC_REFERENCE.md` for the complete existing `window.api` surface and IPC channel to API function mapping.

## MCP Layer (Step 7)

```typescript
// src/mcp/server.ts
server.tool('create_thing', 'Create a new thing', {
  name: z.string().describe('The name of the thing'),
}, async ({ name }) => {
  const result = things.createThing(db, { name });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```

Rules:
- The tool is a **thin wrapper** — all logic stays in `src/api/`
- Add `.describe()` to every Zod parameter
- Handle not-found: return `{ content: [{ type: 'text', text: 'Thing not found' }] }`
- Use `JSON.stringify(result, null, 2)` for readable output

## Vue UI Layer (Step 8)

### script setup pattern

```vue
<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};
</script>
```

### Modal dialog (for create/edit forms)

```vue
<div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
  <div class="modal">
    <h3>Add Thing</h3>
    <form @submit.prevent="handleSubmit">
      <!-- fields -->
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="showForm = false">{{ $t('common.cancel') }}</button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </div>
</div>
```

### List view pattern (PersonsView, RelationshipsView, SourcesView)
- Header + "Add" button opens modal
- `<table>` with clickable rows navigating to `router.push('/things/:id')`
- Delete button uses `@click.stop` to prevent row navigation

### Detail view pattern (PersonDetailView, SourceDetailView)
- Load entity in `onMounted` via `useRoute().params.id`
- Auto-save on blur/change for editable fields
- Sections for related entities (events, names, citations) with embedded components

### Shared components to reuse
- `PersonPicker` — searchable autocomplete for selecting a person
- `DateInput` — compound date input with genealogy date types
- `EventForm` / `EventList` — event CRUD, embeds in detail views
- `CitationForm` — attach a source citation to any entity

### i18n
Add strings to both `src/renderer/i18n/sv.ts` (Swedish, primary) and `src/renderer/i18n/en.ts` (English fallback). Use `$t('key')` in templates.

## Before implementing a non-trivial feature

Use `superpowers:writing-plans` to write a plan first. Existing plans in `.claude/plans/` (and `.claude/plans/archive/`) are good templates — they show the expected task structure, file map format, and TDD step granularity for this codebase.

## Speeding up with subagents

The checklist maps to four focused subagent templates in `.claude/agents/`:

| Agent | Steps | Can run in parallel with |
|-------|-------|--------------------------|
| `api-implementer` | 1–3 | test-writer (after signatures are committed) |
| `test-writer` | 4 | — |
| `ipc-mcp-wirer` | 5–7 | vue-ui-builder |
| `vue-ui-builder` | 8 | ipc-mcp-wirer |
| `doc-syncer` | 10 | — |

Use `superpowers:subagent-driven-development` to dispatch these with two-stage review (spec compliance, then code quality) after each agent.

## After implementing

Use the `/test` skill to run and write tests. Then commit with `/commit`.
