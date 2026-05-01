# Coverage Push (≥80%) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every `src/` file currently under 80% line coverage up to ≥80%, in four tiered commits each shipping as a patch-bumped release.

**Architecture:** Existing test conventions, no new infrastructure. `tests/unit/` for pure-logic / DB-driven tests against in-memory SQLite via `createTestDb()`. `tests/components/` for Vue composable tests using `@vue/test-utils` mounted host components (mirror `tests/components/usePagedList.test.ts`). One small helper added in Tier 1 (`tests/unit/helpers/mcpHarness.ts`) to capture MCP-tool handlers without refactoring source files.

**Tech Stack:** Vitest + node-sqlite3-wasm (in-memory) + `@vue/test-utils` + `fflate` (already a dep, used for tier-2 zip fixture synthesis).

**Spec:** [docs/plans/2026-05-01-coverage-push-design.md](2026-05-01-coverage-push-design.md)

---

## Conventions

Every new test file:
- Uses `import { createTestDb } from "./helpers"` (or `"../unit/helpers"` from components dir).
- Asserts DB state when the function under test mutates the DB — never just the return value (per `.claude/rules/api.md`).
- Uses `beforeEach(() => { db = createTestDb(); })` for a fresh DB per test.
- Vue composable tests follow the pattern in `tests/components/usePagedList.test.ts`: `mount()` a tiny host component, drive it via refs/methods, assert via `wrapper.vm`.

Coverage target per file: ≥80% **lines**. Branch / function coverage is a soft goal — don't write contrived tests just to hit a single uncovered branch when the line is exercised.

After every test file is added:
1. `npm run lint` — must be clean.
2. `npm test` — full suite must pass.
3. `npx vitest run --coverage 2>&1 | grep <filename>` — confirm ≥80%.

---

## Tier 0 — Preflight (1 task)

### Task 0.1: MCP-tool capture harness

**Why:** `mcp/tools/prod/media.ts`, `research.ts`, and `places.ts` only export `register*Tools(server, ctx)`. Their handlers are anonymous closures registered against the MCP `server`. To exercise them without refactoring the source, we build a tiny fake `McpServer` that captures every `registerTool` call.

**Files:**
- Create: `tests/unit/helpers/mcpHarness.ts`

- [ ] **Step 1: Create the harness**

```typescript
// tests/unit/helpers/mcpHarness.ts
import type { Database } from 'node-sqlite3-wasm';

type Handler = (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;

export interface CapturedTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: Handler;
}

export function createCaptureServer() {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool(name: string, def: { description: string; inputSchema: unknown }, handler: Handler) {
      tools.set(name, { name, description: def.description, inputSchema: def.inputSchema, handler });
    },
  };
  return { server: server as any, tools };
}

/** Invoke a captured tool and parse the JSON text payload. */
export async function callTool<T = any>(
  tools: Map<string, CapturedTool>,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  const res = await tool.handler(args);
  const text = res.content?.[0]?.text ?? '';
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

export function makeCtx(db: Database) {
  return { getDb: () => db, getDbPath: () => ':memory:' };
}
```

- [ ] **Step 2: Smoke-test the harness against an existing prod tool**

Verify the harness works by registering an existing tool family that already has tests (e.g. persons), confirming the handler runs and mutates the DB. No file commit yet — this is just sanity-checking the harness shape; if `registerPersonTools` doesn't fit, adjust `createCaptureServer` until it does. Refer to [src/mcp/tools/prod/persons.ts:110](../../src/mcp/tools/prod/persons.ts#L110) for the registration shape.

- [ ] **Step 3: Commit the harness**

```bash
git add tests/unit/helpers/mcpHarness.ts
git commit -m "test(helpers): mcp tool capture harness for prod-tool unit tests" -m "Captures registerTool calls into a Map so anonymous handlers in src/mcp/tools/prod/{media,research,places}.ts can be invoked from unit tests without refactoring the source files." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Tier 1 — Trivial wins (7 tasks)

Pure functions and thin wrappers. Highest ROI. Each task adds a single test file targeting a single source file.

### Task 1.1: `mcp/tools/prod/media.ts` (22% → ≥80%)

**Files:**
- Test: `tests/unit/mcp-prod-media.test.ts`
- Source under test: [src/mcp/tools/prod/media.ts](../../src/mcp/tools/prod/media.ts)

- [ ] **Step 1: Read the source to enumerate tools**

```bash
grep -n "registerTool" src/mcp/tools/prod/media.ts
```

Expected: list of every tool name (`attach_media`, etc). Each becomes a `describe` block in the test.

- [ ] **Step 2: Write the test file**

Pattern (one block shown; replicate per tool):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { registerMediaTools } from '../../src/mcp/tools/prod/media';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';
import { createCaptureServer, callTool, makeCtx } from './helpers/mcpHarness';

let db: ReturnType<typeof createTestDb>;
let tools: ReturnType<typeof createCaptureServer>['tools'];

beforeEach(() => {
  db = createTestDb();
  const cap = createCaptureServer();
  registerMediaTools(cap.server, makeCtx(db));
  tools = cap.tools;
});

describe('attach_media', () => {
  it('creates a media row and a media_link in one transaction', async () => {
    const person = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'L' });
    const res = await callTool<{ media: { id: string }; link: { id: string } }>(tools, 'attach_media', {
      title: 'Portrait',
      file_ref: '/tmp/p.jpg',
      format: 'jpg',
      entity_type: 'person',
      entity_id: person.id,
      link_type: 'portrait',
    });
    expect(res.media.id).toBeTruthy();
    expect(res.link.id).toBeTruthy();
    // Assert DB state, not just return value:
    const rows = db.prepare('SELECT * FROM media_links WHERE entity_id = ?').all([person.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].media_id).toBe(res.media.id);
    expect(rows[0].link_type).toBe('portrait');
  });

  it('rolls back media row when link insert fails', async () => {
    // attach_media to a non-existent entity violates the entity reference
    // and should leave zero rows in `media`.
    await expect(callTool(tools, 'attach_media', {
      title: 'Bad', entity_type: 'person', entity_id: 'no-such-person',
    })).rejects.toThrow();
    const count = db.prepare('SELECT COUNT(*) AS c FROM media').get([]) as { c: number };
    expect(count.c).toBe(0);
  });
});
```

For each remaining tool (e.g. `tag_person_in_media`, `get_media_for_person_context`, `update_media`, etc.):
- One happy-path test that asserts DB state.
- One error-path test where applicable (missing FK, bad enum, etc.).

- [ ] **Step 3: Verify tests pass**

```bash
npx vitest run tests/unit/mcp-prod-media.test.ts
```

Expected: all green.

- [ ] **Step 4: Verify coverage**

```bash
npx vitest run --coverage 2>&1 | grep "media.ts"
```

Expected: `mcp/tools/prod/media.ts` line coverage ≥ 80%. If not, identify uncovered lines (`Uncovered Line #s` column) and add tests.

- [ ] **Step 5: Don't commit yet — batch with the rest of Tier 1.**

---

### Task 1.2: `mcp/tools/prod/research.ts` (25% → ≥80%)

Same pattern as 1.1.

**Files:**
- Test: `tests/unit/mcp-prod-research.test.ts`
- Source: [src/mcp/tools/prod/research.ts](../../src/mcp/tools/prod/research.ts)

- [ ] **Step 1:** Enumerate tools via `grep -n "registerTool" src/mcp/tools/prod/research.ts`.
- [ ] **Step 2:** Write tests — one happy path + one error path per tool. Use `createCaptureServer` + `callTool` harness. For each mutation, assert via `db.prepare('SELECT ... FROM research_tasks').all([])`.
- [ ] **Step 3:** `npx vitest run tests/unit/mcp-prod-research.test.ts` — green.
- [ ] **Step 4:** `npx vitest run --coverage 2>&1 | grep "research.ts"` — ≥80%.
- [ ] **Step 5:** Hold for batched commit.

---

### Task 1.3: `mcp/tools/prod/places.ts` (45% → ≥80%)

Same pattern as 1.1.

**Files:**
- Test: `tests/unit/mcp-prod-places.test.ts`
- Source: [src/mcp/tools/prod/places.ts](../../src/mcp/tools/prod/places.ts)

Specific behaviors to cover:
- Place creation with parent chain (`add_place`).
- Place resolution from name (`resolve_place`) — should return both DB matches and gazetteer matches; assert that gazetteer-only matches are NOT persisted (per data-fidelity prime directive in CLAUDE.md).
- Place hierarchy walk (`get_place_history`).

- [ ] **Step 1–4:** as in 1.2, file = `places.ts`.
- [ ] **Step 5:** Hold for batched commit.

---

### Task 1.4: `renderer/utils/qualityIgnore.ts` (45% → ≥80%)

Pure function. No DB, no DOM.

**Files:**
- Test: `tests/unit/qualityIgnore.test.ts`
- Source: [src/renderer/utils/qualityIgnore.ts](../../src/renderer/utils/qualityIgnore.ts)

- [ ] **Step 1: Read the source.** Note: the file is small (~40 lines, currently 45% covered → uncovered lines 32–40). Identify the predicate's signature and the shape of the input it filters.
- [ ] **Step 2: Write the test:**

```typescript
import { describe, it, expect } from 'vitest';
// import { ... } from '../../src/renderer/utils/qualityIgnore';

describe('qualityIgnore', () => {
  // One test per branch in the source — match the file's actual exported API.
  // Verify ignore rules match expected check codes; verify non-matching codes pass through.
});
```

- [ ] **Step 3:** `npx vitest run tests/unit/qualityIgnore.test.ts` — green.
- [ ] **Step 4:** Coverage ≥80%.
- [ ] **Step 5:** Hold.

---

### Task 1.5: `renderer/utils/cropImage.ts` (42% → ≥80%)

Geometry math is pure; canvas branches are not testable in node. Cover the math and stub the canvas for the rest.

**Files:**
- Test: `tests/unit/cropImage.test.ts`
- Source: [src/renderer/utils/cropImage.ts](../../src/renderer/utils/cropImage.ts)

- [ ] **Step 1: Read the source.** The uncovered range is lines 45–84. Inspect what those lines do — likely the canvas-draw path. If 80% line coverage is achievable by exercising the math in 1–44 plus a mocked-canvas pass through 45–84, do so. If lines 45–84 cannot be reached without a real canvas, add `cropImage.ts` to the `coverage.exclude` list in `vitest.config.mts` with a comment, and extract any pure math helpers into a sibling file (e.g. `cropMath.ts`) that *is* covered.
- [ ] **Step 2: Write tests for the pure math** — input geometry → expected crop rectangle.
- [ ] **Step 3:** `npx vitest run tests/unit/cropImage.test.ts` — green.
- [ ] **Step 4:** Coverage ≥80% on the covered file (which may be `cropImage.ts` or `cropMath.ts` + an exclude on `cropImage.ts`).
- [ ] **Step 5:** Hold.

---

### Task 1.6: `api/html_site/preview.ts` (0% → ≥80%)

Render-time exporter. Mirror [tests/unit/snapshot.test.ts](../../tests/unit/snapshot.test.ts) and [tests/unit/scope.test.ts](../../tests/unit/scope.test.ts).

**Files:**
- Test: `tests/unit/html_site-preview.test.ts`
- Source: [src/api/html_site/preview.ts](../../src/api/html_site/preview.ts)

- [ ] **Step 1: Read the source** to identify the exported function (likely `buildPreview(db, options)` or similar). Note its signature, return type, and any sub-functions.
- [ ] **Step 2: Write the test:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
// import { buildPreview } from '../../src/api/html_site/preview';
import { createTestDb } from './helpers';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('buildPreview', () => {
  it('returns a preview structure for a single-person tree', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'A', surname: 'B' });
    // const preview = buildPreview(db, { rootPersonId: p.id /* or whatever the API expects */ });
    // expect(preview.persons).toHaveLength(1);
    // expect(preview.persons[0].id).toBe(p.id);
  });

  it('honors scope filters', () => {
    // Build a small graph with two branches; call buildPreview with a scope
    // that should exclude one branch; assert the excluded persons are absent.
  });

  it('does not persist any inferred values back to DB', () => {
    // Per CLAUDE.md prime directive: render-time exporters compute on demand.
    // Snapshot DB state before & after; rows must be unchanged.
    const before = db.prepare('SELECT * FROM places').all([]);
    // buildPreview(db, { ... });
    const after = db.prepare('SELECT * FROM places').all([]);
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 3:** `npx vitest run tests/unit/html_site-preview.test.ts` — green.
- [ ] **Step 4:** `npx vitest run --coverage 2>&1 | grep "preview.ts"` — ≥80%.
- [ ] **Step 5:** Hold.

---

### Task 1.7: Tier 1 finalize — bump, CHANGELOG, commit

- [ ] **Step 1: Confirm full suite passes.**

```bash
npm run lint && npm test
```

Both must be clean.

- [ ] **Step 2: Confirm Tier 1 coverage targets.**

```bash
npx vitest run --coverage 2>&1 | grep -E "(media\.ts|research\.ts|places\.ts|qualityIgnore\.ts|cropImage\.ts|preview\.ts)"
```

Every line should show ≥80% in the lines column.

- [ ] **Step 3: Bump version.**

In `package.json`: bump patch (e.g. 0.179.0 → 0.179.1). If user has bumped to a feature already, increment patch from current.

- [ ] **Step 4: CHANGELOG entry.**

Add under `## Unreleased` (or as the first versioned entry if no Unreleased section):

```markdown
## v0.179.1 — Test coverage tier 1: MCP wrappers, utils, html_site preview

- test: brought `mcp/tools/prod/{media,research,places}.ts`, `renderer/utils/{qualityIgnore,cropImage}.ts`, and `api/html_site/preview.ts` to ≥80% line coverage. Added `tests/unit/helpers/mcpHarness.ts` to capture anonymous MCP tool handlers without refactoring source files. No production code changes.
```

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/mcp-prod-media.test.ts tests/unit/mcp-prod-research.test.ts \
        tests/unit/mcp-prod-places.test.ts tests/unit/qualityIgnore.test.ts \
        tests/unit/cropImage.test.ts tests/unit/html_site-preview.test.ts \
        package.json CHANGELOG.md
git commit -m "test: tier 1 coverage push — MCP wrappers, utils, html_site preview" -m "Brings six files to ≥80% line coverage. See CHANGELOG for details." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

If `cropImage.ts` was excluded from coverage instead of tested, also stage `vitest.config.mts`. If a `cropMath.ts` was extracted, also stage `src/renderer/utils/cropMath.ts` and any importers updated to point at it.

---

## Tier 2 — Importer orchestrators (3 tasks)

### Task 2.1: `import/holger/index.ts` (2% → ≥80%)

**Files:**
- Test: `tests/unit/import-holger-orchestrator.test.ts`
- Source: [src/import/holger/index.ts](../../src/import/holger/index.ts)

- [ ] **Step 1: Read the source** to enumerate the entry points and branches:
  - `.ged` direct path
  - `.zip` path (uses `unzipSync` from `fflate`; picks largest `.ged` inside)
  - folder scan (`pickGedFromFolder` — walks recursively for `.ged`)
  - missing-file error → throws `HOLGER_EXPORT_INSTRUCTIONS`
  - `mediaDir` remapping of Windows-style FILE paths in OBJE records
  - `onProgress` callback invocation

- [ ] **Step 2: Write the test:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { zipSync } from 'fflate';
import { importHolger } from '../../src/import/holger';
import { createTestDb } from './helpers';

const MIN_GED = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Anna /Lindström/
1 SEX F
0 TRLR`;

let tmpDir: string;
let db: any;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-test-'));
  db = createTestDb();
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('importHolger', () => {
  it('imports a .ged file directly', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);
    const result = await importHolger(db, { sourcePath: gedPath });
    expect(result.gedPath).toBe(gedPath);
    expect(result.report).toBeDefined();
    const persons = db.prepare('SELECT * FROM persons').all([]);
    expect(persons).toHaveLength(1);
  });

  it('extracts and imports from a .zip with the largest .ged inside', async () => {
    const small = new TextEncoder().encode(MIN_GED);
    const big = new TextEncoder().encode(MIN_GED + '\n0 @I2@ INDI\n1 NAME Erik /S/\n1 SEX M\n0 TRLR');
    const zipBytes = zipSync({ 'small.ged': small, 'big.ged': big });
    const zipPath = path.join(tmpDir, 'export.zip');
    fs.writeFileSync(zipPath, zipBytes);
    const result = await importHolger(db, { sourcePath: zipPath });
    expect(result.gedPath.endsWith('big.ged')).toBe(true);
  });

  it('walks a folder recursively to find a .ged', async () => {
    const sub = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    const gedPath = path.join(sub, 'inner.ged');
    fs.writeFileSync(gedPath, MIN_GED);
    const result = await importHolger(db, { sourcePath: tmpDir });
    expect(result.gedPath).toBe(gedPath);
  });

  it('throws HOLGER_EXPORT_INSTRUCTIONS for an empty folder', async () => {
    await expect(importHolger(db, { sourcePath: tmpDir }))
      .rejects.toThrow(/Export from Holger/);
  });

  it('invokes onProgress at least once', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);
    const messages: string[] = [];
    await importHolger(db, { sourcePath: gedPath, onProgress: (m) => messages.push(m) });
    expect(messages.length).toBeGreaterThan(0);
  });

  it('remaps Windows-style FILE paths to mediaDir', async () => {
    // Build a GED with an OBJE FILE pointing to e.g. C:\Users\X\Y\photo.jpg
    // Pass mediaDir = tmpDir; assert the imported media row's file_ref starts with tmpDir.
  });
});
```

If the actual exported function name differs from `importHolger`, fix the import path. Use `grep -n "^export" src/import/holger/index.ts` to confirm.

- [ ] **Step 3:** `npx vitest run tests/unit/import-holger-orchestrator.test.ts` — green.
- [ ] **Step 4:** `npx vitest run --coverage 2>&1 | grep "holger/index.ts"` — ≥80%.
- [ ] **Step 5:** Hold for tier commit.

---

### Task 2.2: `import/genney/index.ts` (31% → ≥80%)

**Files:**
- Test: `tests/unit/import-genney-orchestrator.test.ts`
- Source: [src/import/genney/index.ts](../../src/import/genney/index.ts)

- [ ] **Step 1: Read the source.** This is 539 lines — identify which segments are uncovered. The current coverage report flagged uncovered ranges 67–471 and 514–537. Cross-reference these with the file structure to find the orchestrator branches not exercised by [tests/unit/genney.test.ts](../../tests/unit/genney.test.ts) and [tests/unit/import-genney-archive.test.ts](../../tests/unit/import-genney-archive.test.ts).

- [ ] **Step 2: Identify uncovered behaviors.** Likely candidates:
  - Archive-vs-single-file routing
  - Error paths (malformed input, missing required sections)
  - Progress callback / report aggregation
  - Edge cases in the link-rules / source-linker integration

- [ ] **Step 3: Write the test file.** Reuse fixture data from [tests/unit/genney.test.ts](../../tests/unit/genney.test.ts). Synthesize multi-file archive layouts in `os.tmpdir()` using the same `fs.mkdtempSync` + `fflate.zipSync` pattern as Task 2.1.

- [ ] **Step 4:** `npx vitest run tests/unit/import-genney-orchestrator.test.ts` — green.
- [ ] **Step 5:** Coverage ≥80%.
- [ ] **Step 6:** Hold.

---

### Task 2.3: Tier 2 finalize

- [ ] **Step 1:** `npm run lint && npm test` — clean.
- [ ] **Step 2:** Confirm `import/holger/index.ts` and `import/genney/index.ts` ≥80%.
- [ ] **Step 3:** Patch-bump `package.json` (e.g. 0.179.1 → 0.179.2).
- [ ] **Step 4:** CHANGELOG entry:

```markdown
## v0.179.2 — Test coverage tier 2: importer orchestrators

- test: brought `import/holger/index.ts` (2% → ≥80%) and `import/genney/index.ts` (31% → ≥80%) to coverage. Tests synthesize zip archives and folder layouts in `os.tmpdir()` via `fflate` + `fs.mkdtempSync` — no checked-in binaries. No production code changes.
```

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/import-holger-orchestrator.test.ts \
        tests/unit/import-genney-orchestrator.test.ts \
        package.json CHANGELOG.md
git commit -m "test: tier 2 coverage push — importer orchestrators" -m "Holger and Genney orchestrators (file-IO routing, zip handling, folder scan) at ≥80%. Fixtures synthesized at runtime via fflate; no checked-in binaries." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Tier 3 — Chart layouts (5 tasks)

Pure layout functions plus one DOM-event composable. Assert position invariants, NOT pixel-perfect snapshots.

### Task 3.1: `chart-layout/hourglass-tree.ts` (25% → ≥80%)

**Files:**
- Test: `tests/unit/chart-layout-hourglass-tree.test.ts`
- Source: [src/renderer/utils/chart-layout/hourglass-tree.ts](../../src/renderer/utils/chart-layout/hourglass-tree.ts)

- [ ] **Step 1: First — confirm this file is still in use.** The coverage report shows 25% line coverage and uncovered range 13–183 — almost the entire file. This may be legacy code superseded by `hourglass.ts` (currently 79.23%). Run:

```bash
grep -rn "from.*chart-layout/hourglass-tree" src/
```

If no production importers exist (only tests or none at all), **delete the file** instead of testing it. Document the deletion in the tier commit's CHANGELOG. Then skip steps 2–6 of this task.

- [ ] **Step 2: If still in use,** read the file to understand its layout API and identify the exported functions.

- [ ] **Step 3: Write the test using the tree-layout skill conventions.** Build a small synthetic person tree via in-memory DB with `createPerson` and `createRelationship`, run the layout, assert:
  - Ancestor lane and descendant lane are disjoint (no node from one appears in the other).
  - Root subject is at the lane boundary.
  - Generation k nodes have a consistent y-coordinate (or x, depending on orientation).
  - No two siblings overlap.

- [ ] **Step 4:** `npx vitest run tests/unit/chart-layout-hourglass-tree.test.ts` — green.
- [ ] **Step 5:** Coverage ≥80%.
- [ ] **Step 6:** Hold.

---

### Task 3.2: `chart-layout/descendant.ts` (48% → ≥80%)

**Files:**
- Test: `tests/unit/chart-layout-descendant.test.ts`
- Source: [src/renderer/utils/chart-layout/descendant.ts](../../src/renderer/utils/chart-layout/descendant.ts)

- [ ] **Step 1: Read the source.** Uncovered range: 202–317 and 326–343. Identify which branches those are.
- [ ] **Step 2: Write tests** that build a multi-generation descendant tree with branching and assert:
  - Children align under their parent.
  - Sibling spacing is ≥ the configured min.
  - Connector endpoints map to box edges (not centers, depending on the API).
  - Wrap-deep-trees branch (if uncovered range corresponds to it) — build a tree deep enough to trigger it.
- [ ] **Step 3:** Tests pass.
- [ ] **Step 4:** Coverage ≥80%.
- [ ] **Step 5:** Hold.

---

### Task 3.3: `chart-layout/pedigree.ts` (60% → ≥80%)

**Files:**
- Test: `tests/unit/chart-layout-pedigree.test.ts`
- Source: [src/renderer/utils/chart-layout/pedigree.ts](../../src/renderer/utils/chart-layout/pedigree.ts)

- [ ] **Step 1: Read the source.** Uncovered ranges 286–306 and 325–331.
- [ ] **Step 2: Write tests** for both orientation modes (horizontal and vertical) and the empty-slot branch (subject without one or both parents).
- [ ] **Step 3–5:** Verify, ≥80%, hold.

---

### Task 3.4: `renderer/utils/useChartZoom.ts` (13% → ≥80%)

DOM event handler — needs `@vue/test-utils`.

**Files:**
- Test: `tests/components/useChartZoom.test.ts`
- Source: [src/renderer/utils/useChartZoom.ts](../../src/renderer/utils/useChartZoom.ts)

- [ ] **Step 1: Read the source** to understand the composable's signature and what events it binds.

- [ ] **Step 2: Write the test using the host-component pattern from [tests/components/usePagedList.test.ts](../../tests/components/usePagedList.test.ts):**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { useChartZoom } from '../../src/renderer/utils/useChartZoom';

function makeHost() {
  return defineComponent({
    setup() {
      const containerEl = ref<HTMLElement | null>(null);
      const zoom = useChartZoom(/* args */);
      return { containerEl, zoom };
    },
    template: '<div ref="containerEl" style="width:400px;height:400px"></div>',
  });
}

describe('useChartZoom', () => {
  it('initial scale is 1', () => {
    const wrapper = mount(makeHost());
    expect((wrapper.vm as any).zoom.scale.value).toBe(1);
  });

  it('wheel event with ctrl/meta modifies scale', async () => {
    const wrapper = mount(makeHost());
    const el = wrapper.vm.$refs.containerEl as HTMLElement;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true }));
    // Assert scale changed in the expected direction.
  });

  // Cover: clamping at min/max scale, pan via drag, reset, programmatic zoom.
});
```

Adjust based on the real `useChartZoom` API.

- [ ] **Step 3–5:** Verify, ≥80%, hold.

---

### Task 3.5: Tier 3 finalize

- [ ] **Step 1:** `npm run lint && npm test` — clean.
- [ ] **Step 2:** Confirm chart-layout files ≥80%.
- [ ] **Step 3:** Patch-bump.
- [ ] **Step 4:** CHANGELOG:

```markdown
## v0.179.3 — Test coverage tier 3: chart layouts

- test: brought `renderer/utils/chart-layout/{hourglass-tree,descendant,pedigree}.ts` and `renderer/utils/useChartZoom.ts` to ≥80% line coverage. Layout tests assert position invariants (lane separation, sibling spacing, connector endpoints) rather than pixel-perfect snapshots, so they don't rot when spacing is tuned. [If hourglass-tree.ts was deleted: also remove dead-code file `renderer/utils/chart-layout/hourglass-tree.ts` (superseded by `hourglass.ts`).]
```

- [ ] **Step 5:** Commit.

```bash
git add tests/unit/chart-layout-*.test.ts tests/components/useChartZoom.test.ts \
        package.json CHANGELOG.md
git commit -m "test: tier 3 coverage push — chart layouts + useChartZoom" -m "Layout tests assert invariants rather than pixel snapshots." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

(Add `src/renderer/utils/chart-layout/hourglass-tree.ts` to the staging set if it was deleted, and any imports updated.)

---

## Tier 4 — Vue composables & utils (7 tasks)

All tests follow the host-component pattern from [tests/components/usePagedList.test.ts](../../tests/components/usePagedList.test.ts).

### Task 4.1: `composables/usePanelSections.ts` (0% → ≥80%)

**Files:**
- Test: `tests/components/usePanelSections.test.ts`
- Source: [src/renderer/composables/usePanelSections.ts](../../src/renderer/composables/usePanelSections.ts)

- [ ] **Step 1:** Read the source — the file is 36 lines (uncovered 3–36 = entire file).
- [ ] **Step 2:** Write a host-component test exercising every public method/ref returned by the composable. If the composable reads/writes `localStorage`, stub it via `vi.spyOn(Storage.prototype, 'getItem')` etc.
- [ ] **Step 3–5:** Verify, ≥80%, hold.

### Task 4.2: `composables/useProfilePic.ts` (0% → ≥80%)

**Files:**
- Test: `tests/components/useProfilePic.test.ts`
- Source: [src/renderer/composables/useProfilePic.ts](../../src/renderer/composables/useProfilePic.ts)

Same pattern as 4.1. Likely calls `window.api.media.*` — stub via `vi.stubGlobal('window', { api: { media: { ... } } })` or attach `window.api` in a `beforeEach`.

### Task 4.3: `renderer/utils/mediaProfile.ts` (0% → ≥80%)

**Files:**
- Test: `tests/components/mediaProfile.test.ts` (or `tests/unit/mediaProfile.test.ts` if it's pure)
- Source: [src/renderer/utils/mediaProfile.ts](../../src/renderer/utils/mediaProfile.ts)

- [ ] **Step 1:** Read source. If it's a pure function (no Vue reactive primitives), put the test in `tests/unit/`. Otherwise `tests/components/`.
- [ ] **Step 2–5:** Standard pattern.

### Task 4.4: `composables/useDeleteConfirm.ts` (27% → ≥80%)

**Files:**
- Test: `tests/components/useDeleteConfirm.test.ts`
- Source: [src/renderer/composables/useDeleteConfirm.ts](../../src/renderer/composables/useDeleteConfirm.ts)

Cover: open/close state, confirm callback, cancel callback, escape-key behaviour if any.

### Task 4.5: `composables/useStatusBarParentInfo.ts` (21% → ≥80%)

**Files:**
- Test: `tests/components/useStatusBarParentInfo.test.ts`
- Source: [src/renderer/composables/useStatusBarParentInfo.ts](../../src/renderer/composables/useStatusBarParentInfo.ts)

Likely fetches parent data via `window.api`. Stub the api, drive the composable with a person id, assert the computed status string.

### Task 4.6: `composables/usePanelResize.ts` (49% → ≥80%)

**Files:**
- Test: `tests/components/usePanelResize.test.ts`
- Source: [src/renderer/composables/usePanelResize.ts](../../src/renderer/composables/usePanelResize.ts)

Drag-handle composable. Per [feedback_drag_mouse_handling.md](memory:feedback_drag_mouse_handling.md): test that mousedown attaches window-level listeners, mousemove updates state in screen pixels then converts to percentage, mouseup detaches listeners and clears state.

### Task 4.7: Tier 4 finalize

- [ ] **Step 1–2:** Lint + tests + per-file coverage.
- [ ] **Step 3:** Patch-bump.
- [ ] **Step 4:** CHANGELOG:

```markdown
## v0.179.4 — Test coverage tier 4: Vue composables

- test: brought `composables/{usePanelSections,useProfilePic,useDeleteConfirm,useStatusBarParentInfo,usePanelResize}.ts` and `renderer/utils/mediaProfile.ts` to ≥80% line coverage. Tests use the host-component pattern from `tests/components/usePagedList.test.ts` — mount a tiny `<script setup>` shell, drive via `wrapper.vm`, assert via refs. No production code changes.
```

- [ ] **Step 5:** Commit.

```bash
git add tests/components/usePanelSections.test.ts tests/components/useProfilePic.test.ts \
        tests/components/mediaProfile.test.ts tests/components/useDeleteConfirm.test.ts \
        tests/components/useStatusBarParentInfo.test.ts tests/components/usePanelResize.test.ts \
        package.json CHANGELOG.md
git commit -m "test: tier 4 coverage push — Vue composables" -m "Six composables/utils brought to ≥80% via host-component mounted tests." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

(Move `tests/components/mediaProfile.test.ts` to `tests/unit/` if it turned out to be pure.)

---

## Tier 5 — Threshold & exclusions (1 task)

### Task 5.1: Promote the global threshold

After tiers 1–4, global function coverage should have crossed 80%. Lock it in.

**Files:**
- Modify: `vitest.config.mts`

- [ ] **Step 1: Run a fresh coverage report.**

```bash
npx vitest run --coverage 2>&1 | tail -10
```

Confirm: Statements ≥ 80%, Branches ≥ 70%, Functions ≥ 80%, Lines ≥ 80%.

If functions is still below 80%, identify the next batch of sub-80% files in the report and either add tests (a small follow-up) or — for files that legitimately can't be covered — add to `coverage.exclude`.

- [ ] **Step 2: Add `src/shared/channels/**` to the exclude list** (per spec — `register()` only runs in the worker; parity is enforced by `tests/unit/registry.test.ts`).

```typescript
// vitest.config.mts
coverage: {
  exclude: [
    // ... existing
    'src/shared/channels/**', // Per-channel register() runs in the IPC worker; parity is enforced by tests/unit/registry.test.ts.
  ],
  thresholds: {
    // Tighten globals once Tier 4 lands global coverage ≥80%
    lines: 80,
    functions: 80,
    statements: 80,
    branches: 70,
  },
},
```

(Read the actual current `vitest.config.mts` first and merge with existing config — don't overwrite.)

- [ ] **Step 3: Verify the threshold passes.**

```bash
npx vitest run --coverage
```

Expected: no `ERROR: Coverage for ... does not meet global threshold` line.

- [ ] **Step 4: Patch-bump and commit.**

```markdown
## v0.179.5 — Coverage thresholds promoted to global

- test: added `src/shared/channels/**` to the coverage exclude list (per-channel register() runs in the IPC worker; parity is enforced by `tests/unit/registry.test.ts`). Promoted vitest coverage thresholds from per-`src/api/` to a true global floor (lines/functions/statements 80%, branches 70%) so future regressions block the coverage build.
```

```bash
git add vitest.config.mts package.json CHANGELOG.md
git commit -m "test: promote coverage thresholds to global ≥80%" -m "After tiers 1–4, every file under src/ that can be covered is at ≥80%. Locks the floor in via vitest.config.mts and excludes src/shared/channels/** (parity-tested by registry.test.ts)." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** Every file enumerated in the design doc has a task. Out-of-scope items (`snapshot.ts` 66%, `media_ai/personLiving/undo_wrappers` at 73–79%) are not given tasks per the spec. ✓
- **Placeholder scan:** Several tasks' Step 2 says "Write tests for the following behaviors" rather than full code. This is deliberate — the executor must read each source file under test (which is what TDD against existing code requires); enumerating the behaviors and showing the *pattern* in Task 1.1 + Task 2.1 + Task 3.4 + the host-component snippet is sufficient. The executor cannot meaningfully write tests without reading the source.
- **Type consistency:** `createCaptureServer`, `callTool`, `makeCtx` are referenced consistently across Tier 1 tasks. ✓
- **Stop-points:** Each tier-finalize task is a clean stopping point with its own version + commit. ✓
- **Risk:** Task 3.1 has a kill-switch (delete the file if dead code). Task 1.5 has a fallback (extract pure math or exclude). Task 4.3 routes between unit/components based on inspection. These keep the plan honest without paving over reality.
