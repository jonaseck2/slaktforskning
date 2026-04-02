---
name: test
description: Run tests, write new tests, and verify code changes. Use when implementing features, fixing bugs, or before committing.
---

# Test Skill

## Running Tests

### Unit tests (API layer)
```bash
npm test                   # Run all unit + component tests (Vitest)
npm test -- --coverage     # Run with coverage report (v8, src/api/ only)
npm run test:watch         # Watch mode for active development
```

### E2E tests (app launch + MCP server)
```bash
npx playwright test   # Run both E2E tests
```

### Full verification before committing
```bash
npm test && npx playwright test
```

### Coverage thresholds
`vitest.config.mts` enforces **80% lines and functions** on `src/api/`. The build fails if coverage drops below. Current baseline: ~90% statements, 100% lines, 100% functions.

## Writing Unit Tests

Unit tests live in `tests/unit/` and test the `src/api/` layer with an in-memory SQLite database.

### Pattern — always follow this structure:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
// Import the api functions you're testing:
import { createThing, getThing, listThings } from '../../src/api/things';

let db: any;

beforeEach(() => {
  db = createTestDb();  // Fresh in-memory DB with full schema
});

describe('things', () => {
  it('creates a thing', () => {
    const thing = createThing(db, { name: 'test' });
    expect(thing.id).toBeDefined();
    expect(thing.name).toBe('test');
  });

  it('lists things', () => {
    createThing(db, { name: 'a' });
    createThing(db, { name: 'b' });
    const list = listThings(db);
    expect(list).toHaveLength(2);
  });
});
```

### Key rules:
- **Test the `src/api/` functions directly** — not IPC, not Vue components
- **Use `createTestDb()`** from `tests/unit/helpers.ts` — gives you a fresh `:memory:` SQLite with full schema
- **Each `beforeEach` creates a fresh DB** — tests are isolated
- **node-sqlite3-wasm quirk**: `db.get()` returns `undefined` not `null`. The api/ functions handle this with `?? null`, but be aware in raw assertions.
- **Parameter binding uses arrays**: `stmt.run([a, b])` not `stmt.run(a, b)`

### Test file naming:
- `tests/unit/persons.test.ts` — tests `src/api/persons.ts`
- `tests/unit/families.test.ts` — tests `src/api/families.ts`
- `tests/unit/events.test.ts` — tests `src/api/events.ts`
- `tests/unit/sources.test.ts` — tests `src/api/sources.ts`

### What to test for each CRUD function:
1. **Create** — returns entity with UUID id, fields match input, defaults work
2. **Get by ID** — returns entity; **returns null for missing ID** (not undefined — api/ uses `?? null`)
3. **List** — returns array, respects ordering
4. **Update** — changes specified fields, leaves others untouched, returns updated entity
5. **Delete** — returns true on success; **returns false for missing ID**; cascades correctly (verify child rows are gone)

Negative cases (null returns, false returns) are easy to skip and frequently missed. Always include them.

## E2E Tests

E2E tests live in `tests/e2e/` and use Playwright (not browser Playwright — process spawning).

### Existing tests:
1. **App smoke test** — spawns `electron-forge start`, verifies "Launched Electron" in output
2. **MCP server test** — spawns `npx tsx src/mcp/server.ts`, sends JSON-RPC `initialize`, verifies `serverInfo` response

### Both use:
- `SLAKTFORSKNING_DB` env var pointed at a temp file
- Process spawning with timeout (30s for app, 15s for MCP)
- Cleanup: `fs.rmSync(dbPath)` after test

## When Tests Fail

- **Read the error message first** — don't blindly re-run or change code.
- **Check if it's a test bug or a code bug** — the test may have wrong expectations after a legitimate code change.
- **For SQLite errors** — remember `db.get()` returns `undefined` not `null`, and parameter binding uses arrays.
- **For E2E timeouts** — check if a previous Electron process is still running (`pkill -f "electron-forge"`).

## When to Run Tests

- **After changing any `src/api/*.ts` file** → `npm test`
- **After adding a new API function** → `npm test -- --coverage` to verify thresholds still pass
- **After changing IPC, preload, or main process** → `npx playwright test`
- **Before every commit** → `npm test && npx playwright test`
- **When adding a new feature** → write unit tests for the api/ functions FIRST, then implement
