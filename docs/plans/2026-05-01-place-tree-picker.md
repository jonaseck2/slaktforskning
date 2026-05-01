# Place Tree Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tree-button to PlacePicker that opens a modal browsing the merged DB-places + gazetteer tree, with click-to-select and inline `+ Add child` per node.

**Architecture:** The modal is purely renderer-side. `usePlaceTree` composable builds a lazy merged tree from the existing `places.list*` + in-memory gazetteers; selecting a node funnels back through the picker's existing `select()` so emit/path-display logic is unchanged. Two small read-only API functions are added (`listPlaceChildren`, `getPlaceAncestors`) so we can lazy-expand and pre-populate the chain without dragging the whole `places` table into the renderer.

**Tech Stack:** Vue 3 Composition API, `<script setup lang="ts">`, BaseSubPanel modal pattern, existing `usePlaceResolver` for gazetteers, node-sqlite3-wasm for the API additions, Vitest for unit/component tests, Playwright for E2E.

**Design doc:** [docs/plans/2026-05-01-place-tree-picker-design.md](2026-05-01-place-tree-picker-design.md)

---

## Task 1: API — `listPlaceChildren`

**Files:**
- Modify: `src/api/places.ts` (append new export)
- Test: `tests/unit/places.test.ts` (append new describe block)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/places.test.ts` (before the final closing of the file or at the end of the existing imports block):

```typescript
describe('listPlaceChildren', () => {
  it('returns root places when parentId is null', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const denmark = createPlace(db, { name: 'Danmark' });
    createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });

    const roots = listPlaceChildren(db, null);

    expect(roots.map(r => r.name).sort()).toEqual(['Danmark', 'Sverige']);
  });

  it('returns direct children only when parentId is set', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });
    createPlace(db, { name: 'Skåne', parent_place_id: sweden.id });

    const children = listPlaceChildren(db, sweden.id);

    expect(children.map(c => c.name).sort()).toEqual(['Skåne', 'Stockholm']);
  });

  it('flags hasChildren correctly', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const roots = listPlaceChildren(db, null);
    const sw = roots.find(r => r.name === 'Sverige')!;
    expect(sw.hasChildren).toBe(true);

    const children = listPlaceChildren(db, sweden.id);
    const sthlm = children.find(c => c.name === 'Stockholm')!;
    expect(sthlm.hasChildren).toBe(true);

    const leaves = listPlaceChildren(db, stockholm.id);
    const solna = leaves.find(c => c.name === 'Solna')!;
    expect(solna.hasChildren).toBe(false);
  });

  it('returns empty array when parent has no children', () => {
    const p = createPlace(db, { name: 'Solo' });
    expect(listPlaceChildren(db, p.id)).toEqual([]);
  });
});
```

Add `listPlaceChildren` to the import list at the top of the file:

```typescript
import {
  createPlace, getPlace, listPlaces, searchPlaces,
  updatePlace, deletePlace, findOrCreatePlace, findOrCreatePlaceWithChain,
  getPersonsForPlace,
  listPlacesPage, countPlaces,
  listPlaceChildren,
} from '../../src/api/places';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/places.test.ts -t "listPlaceChildren" --reporter=verbose`
Expected: FAIL — `listPlaceChildren is not a function`

- [ ] **Step 3: Implement `listPlaceChildren`**

Append to `src/api/places.ts` after `getPlacePath` (around line 116):

```typescript
/**
 * Direct children of a place node. Pass `null` for root places (no parent).
 * `hasChildren` is computed via EXISTS so the tree picker can render chevrons
 * without N+1 queries when expanding.
 */
export function listPlaceChildren(
  db: Database,
  parentId: string | null,
): (Place & { hasChildren: boolean })[] {
  if (parentId === null) {
    return queryAll<Place & { hasChildren: boolean }>(db, `
      SELECT p.*,
        EXISTS(SELECT 1 FROM places c WHERE c.parent_place_id = p.id) AS hasChildren
      FROM places p
      WHERE p.parent_place_id IS NULL
      ORDER BY p.name ASC
    `);
  }
  return queryAll<Place & { hasChildren: boolean }>(db, `
    SELECT p.*,
      EXISTS(SELECT 1 FROM places c WHERE c.parent_place_id = p.id) AS hasChildren
    FROM places p
    WHERE p.parent_place_id = ?
    ORDER BY p.name ASC
  `, [parentId]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/places.test.ts -t "listPlaceChildren" --reporter=verbose`
Expected: PASS — all four cases.

Note: `EXISTS(...)` returns 0/1 in SQLite. SQLite booleans round-trip as numbers; the assertion `.toBe(true)` may need to compare `=== 1`. If tests fail on the truthiness, change the SELECT to `CAST(EXISTS(...) AS INTEGER) AS hasChildren` and adjust assertions to `expect(sw.hasChildren).toBeTruthy()` / `expect(solna.hasChildren).toBeFalsy()`. Update assertions before re-running.

- [ ] **Step 5: Commit**

```bash
git add src/api/places.ts tests/unit/places.test.ts
git commit -m "feat(api): add listPlaceChildren for lazy tree expansion"
```

---

## Task 2: API — `getPlaceAncestors`

**Files:**
- Modify: `src/api/places.ts`
- Test: `tests/unit/places.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/places.test.ts`:

```typescript
describe('getPlaceAncestors', () => {
  it('returns the chain from root to the given place inclusive', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    const solna = createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const chain = getPlaceAncestors(db, solna.id);

    expect(chain.map(p => p.name)).toEqual(['Sverige', 'Stockholm', 'Solna']);
  });

  it('returns single-element array for a root place', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    expect(getPlaceAncestors(db, sweden.id).map(p => p.name)).toEqual(['Sverige']);
  });

  it('returns empty array for unknown id', () => {
    expect(getPlaceAncestors(db, 'nonexistent')).toEqual([]);
  });

  it('caps depth at 32 to defend against cycles', () => {
    let parentId: string | null = null;
    let lastId = '';
    for (let i = 0; i < 40; i++) {
      const p = createPlace(db, { name: `L${i}`, parent_place_id: parentId });
      parentId = p.id;
      lastId = p.id;
    }
    const chain = getPlaceAncestors(db, lastId);
    expect(chain.length).toBeLessThanOrEqual(32);
  });
});
```

Add to the imports at top of file:

```typescript
import {
  createPlace, getPlace, listPlaces, searchPlaces,
  updatePlace, deletePlace, findOrCreatePlace, findOrCreatePlaceWithChain,
  getPersonsForPlace,
  listPlacesPage, countPlaces,
  listPlaceChildren, getPlaceAncestors,
} from '../../src/api/places';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/places.test.ts -t "getPlaceAncestors" --reporter=verbose`
Expected: FAIL — `getPlaceAncestors is not a function`

- [ ] **Step 3: Implement `getPlaceAncestors`**

Append to `src/api/places.ts`:

```typescript
const MAX_PLACE_ANCESTOR_DEPTH = 32;

/**
 * Chain from root to `id` (inclusive). Walks `parent_place_id` upward then
 * reverses. Capped at MAX_PLACE_ANCESTOR_DEPTH to defend against accidental
 * cycles in user data.
 */
export function getPlaceAncestors(db: Database, id: string): Place[] {
  const reverseChain: Place[] = [];
  let currentId: string | null = id;
  for (let i = 0; i < MAX_PLACE_ANCESTOR_DEPTH && currentId; i++) {
    const row = queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [currentId]);
    if (!row) break;
    reverseChain.push(row);
    currentId = row.parent_place_id ?? null;
  }
  return reverseChain.reverse();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/places.test.ts -t "getPlaceAncestors" --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/places.ts tests/unit/places.test.ts
git commit -m "feat(api): add getPlaceAncestors for tree pre-population"
```

---

## Task 3: Wire channels, preload, static-api, MCP

**Files:**
- Modify: `src/shared/channels/places.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/static/static-api.ts`
- Modify: `src/mcp/tools/prod/places.ts`
- Modify: `tests/unit/channels-places.test.ts`

- [ ] **Step 1: Update channel-count test (will fail until handlers added)**

Edit `tests/unit/channels-places.test.ts` line 8:

```typescript
expect(placeChannels.length).toBe(13);
```

Append a new assertion at the end of the first describe block:

```typescript
  it('places:listChildren and places:getAncestors are read-only worker channels', () => {
    const lc = getChannel('places:listChildren');
    const ga = getChannel('places:getAncestors');
    expect(lc).toBeDefined();
    expect(lc!.thread).toBe('worker');
    expect(lc!.mutating).toBeFalsy();
    expect(ga).toBeDefined();
    expect(ga!.thread).toBe('worker');
    expect(ga!.mutating).toBeFalsy();
  });
```

- [ ] **Step 2: Run channel test to verify it fails**

Run: `npx vitest run tests/unit/channels-places.test.ts --reporter=verbose`
Expected: FAIL — count is 11 (≠ 13), and `places:listChildren` is undefined.

- [ ] **Step 3: Add channel definitions**

Append to `src/shared/channels/places.ts` (before the trailing newline):

```typescript
defineChannel({
  name: 'places:listChildren',
  thread: 'worker',
  handler: (db, parentId: string | null) => places.listPlaceChildren(db, parentId),
});

defineChannel({
  name: 'places:getAncestors',
  thread: 'worker',
  handler: (db, id: string) => places.getPlaceAncestors(db, id),
});
```

- [ ] **Step 4: Add preload exposure**

Edit `src/preload/index.ts` inside the `places: { ... }` block (right after `getPath`, around line 125):

```typescript
    listChildren: (parentId: string | null) => ipcRenderer.invoke('places:listChildren', parentId),
    getAncestors: (id: string) => ipcRenderer.invoke('places:getAncestors', id),
```

- [ ] **Step 5: Add static-api stubs**

Edit `src/static/static-api.ts` inside the `places = {` object (right after `getPath`, around line 343):

```typescript
    listChildren: async (parentId: string | null) => {
      const all = parentId === null
        ? snapshot.places.filter(p => !p.parent_place_id)
        : snapshot.places.filter(p => p.parent_place_id === parentId);
      const childMap = new Map<string | null, number>();
      for (const p of snapshot.places) {
        const k = p.parent_place_id ?? null;
        childMap.set(k, (childMap.get(k) ?? 0) + 1);
      }
      return all
        .map(p => ({ ...p, hasChildren: (childMap.get(p.id) ?? 0) > 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    getAncestors: async (id: string) => {
      const out: Place[] = [];
      let cur = idx.placeById.get(id);
      let depth = 0;
      while (cur && depth < 32) {
        out.push(cur);
        cur = cur.parent_place_id ? idx.placeById.get(cur.parent_place_id) : undefined;
        depth++;
      }
      return out.reverse();
    },
```

- [ ] **Step 6: Add MCP tools**

Append inside `registerPlaceTools` in `src/mcp/tools/prod/places.ts` (before the closing `}` of the function):

```typescript
  server.registerTool('list_place_children', {
    description: 'List direct children of a place (pass null for root-level places). Returns rows with a hasChildren flag for each.',
    inputSchema: {
      parent_place_id: z.string().nullable().describe('Parent place ID, or null for root-level places'),
    },
  }, async (args) => {
    const rows = placeApi.listPlaceChildren(getDb(), args.parent_place_id ?? null);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  server.registerTool('get_place_ancestors', {
    description: 'Get the ancestor chain (root → self) for a place.',
    inputSchema: {
      place_id: z.string().describe('Place ID'),
    },
  }, async (args) => {
    const chain = placeApi.getPlaceAncestors(getDb(), args.place_id);
    return { content: [{ type: 'text', text: JSON.stringify(chain, null, 2) }] };
  });
```

- [ ] **Step 7: Run all coverage tests**

Run:
```bash
npx vitest run tests/unit/channels-places.test.ts \
                tests/unit/ipc-worker-coverage.test.ts \
                tests/unit/preload-coverage.test.ts \
                tests/unit/static-api-coverage.test.ts \
                --reporter=verbose
```
Expected: PASS (all four). The coverage tests assert that every registry channel is exposed in preload + static-api stub.

- [ ] **Step 8: Commit**

```bash
git add src/shared/channels/places.ts src/preload/index.ts src/static/static-api.ts \
        src/mcp/tools/prod/places.ts tests/unit/channels-places.test.ts
git commit -m "feat(ipc): expose listPlaceChildren + getPlaceAncestors via IPC and MCP"
```

---

## Task 4: `usePlaceTree` composable

**Files:**
- Create: `src/renderer/composables/usePlaceTree.ts`
- Test: `tests/components/usePlaceTree.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/components/usePlaceTree.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlaceTree, type PlaceTreeNode } from '../../src/renderer/composables/usePlaceTree';

type DbPlace = { id: string; name: string; parent_place_id: string | null; place_type: string | null; hasChildren: boolean };
type GazNode = { name: string; type: string; children?: GazNode[] };
type Gaz = { id: string; name: string; root: GazNode };

function setupApiMock(places: DbPlace[]) {
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).api = {
    places: {
      listChildren: vi.fn((parentId: string | null) =>
        Promise.resolve(places.filter(p => (p.parent_place_id ?? null) === parentId))),
      getAncestors: vi.fn((id: string) => {
        const out: DbPlace[] = [];
        let cur = places.find(p => p.id === id);
        while (cur) { out.unshift(cur); cur = cur.parent_place_id ? places.find(p => p.id === cur!.parent_place_id) : undefined; }
        return Promise.resolve(out);
      }),
    },
  };
}

function makeGaz(id: string, root: GazNode): Gaz { return { id, name: id, root }; }

describe('usePlaceTree', () => {
  beforeEach(() => {
    (window as any).api = undefined;
  });

  it('builds merged roots from DB places and gazetteers, deduped by name', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: 'country', hasChildren: false },
      { id: 'db-no', name: 'Norge', parent_place_id: null, place_type: 'country', hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [
      makeGaz('sv-geo', { name: 'Sverige', type: 'country', children: [{ name: 'Stockholm', type: 'county' }] }),
      makeGaz('dk-geo', { name: 'Danmark', type: 'country' }),
    ]);
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const names = tree.roots.value.map(n => n.name).sort();
    expect(names).toEqual(['Danmark', 'Norge', 'Sverige']);
    const sv = tree.roots.value.find(n => n.name === 'Sverige')!;
    expect(sv.source).toBe('merged');
    expect(sv.dbId).toBe('db-sv');
    expect(sv.gazId).toBe('sv-geo');
    expect(sv.hasChildren).toBe(true);
  });

  it('expandNode lazy-builds children from DB and gazetteer', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: null, hasChildren: true },
      { id: 'db-skane', name: 'Skåne', parent_place_id: 'db-sv', place_type: null, hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [
      makeGaz('sv-geo', {
        name: 'Sverige',
        type: 'country',
        children: [{ name: 'Stockholm', type: 'county' }, { name: 'Skåne', type: 'county' }],
      }),
    ]);
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const sv = tree.roots.value.find(n => n.name === 'Sverige')!;
    await tree.expandNode(sv);
    const childNames = sv.children.map(c => c.name).sort();
    expect(childNames).toEqual(['Skåne', 'Stockholm']);
    const skane = sv.children.find(c => c.name === 'Skåne')!;
    expect(skane.source).toBe('merged');
    expect(skane.dbId).toBe('db-skane');
    expect(sv.childrenLoaded).toBe(true);
  });

  it('filter keeps matching nodes plus their ancestors and auto-expands them', async () => {
    setupApiMock([]);
    const gazetteers: Gaz[] = [
      makeGaz('sv-geo', {
        name: 'Sverige',
        type: 'country',
        children: [
          { name: 'Stockholm', type: 'county', children: [{ name: 'Solna', type: 'city' }] },
          { name: 'Skåne', type: 'county' },
        ],
      }),
    ]);
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    await tree.applyFilter('solna');
    const visible = tree.visibleNodes.value;
    const names = visible.map((n: PlaceTreeNode) => n.name);
    expect(names).toContain('Sverige');
    expect(names).toContain('Stockholm');
    expect(names).toContain('Solna');
    expect(names).not.toContain('Skåne');
  });

  it('findPathTo returns the chain of node keys for a DB place id', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: null, hasChildren: true },
      { id: 'db-sthlm', name: 'Stockholm', parent_place_id: 'db-sv', place_type: null, hasChildren: true },
      { id: 'db-solna', name: 'Solna', parent_place_id: 'db-sthlm', place_type: null, hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [];
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const path = await tree.findPathTo('db-solna');
    expect(path.map(n => n.name)).toEqual(['Sverige', 'Stockholm', 'Solna']);
  });
});
```

- [ ] **Step 2: Run the test (will fail — composable does not yet exist)**

Run: `npx vitest run tests/components/usePlaceTree.test.ts --reporter=verbose`
Expected: FAIL — `Cannot find module '../../src/renderer/composables/usePlaceTree'`

- [ ] **Step 3: Implement the composable**

Create `src/renderer/composables/usePlaceTree.ts`:

```typescript
import { ref, computed } from 'vue';

export type PlaceTreeNodeSource = 'db' | 'gazetteer' | 'merged';

export interface PlaceTreeNode {
  key: string;
  name: string;
  type: string | null;
  source: PlaceTreeNodeSource;
  dbId: string | null;
  gazId: string | null;
  /** Ancestor names from root to self inclusive (for `findOrCreatePlaceWithChain`). */
  gazPath: string[] | null;
  parent: PlaceTreeNode | null;
  hasChildren: boolean;
  childrenLoaded: boolean;
  expanded: boolean;
  children: PlaceTreeNode[];
}

interface GazetteerNodeLike {
  name: string;
  type: string;
  children?: GazetteerNodeLike[];
}

interface GazetteerLike {
  id: string;
  root: GazetteerNodeLike;
}

interface DbChildRow {
  id: string;
  name: string;
  parent_place_id: string | null;
  place_type: string | null;
  hasChildren: boolean | number;
}

interface UsePlaceTreeOptions {
  /** Getter for enabled gazetteers. Read each time roots/children build,
   *  so callers can construct the tree before `ensureLoaded()` resolves. */
  getGazetteers: () => GazetteerLike[];
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function gazKeyFor(gazId: string, path: string[]): string {
  return `gaz:${gazId}:${path.join('>')}`;
}

function dbKeyFor(id: string): string {
  return `db:${id}`;
}

function findGazNode(gaz: GazetteerLike, path: string[]): GazetteerNodeLike | null {
  if (path.length === 0) return null;
  if (normalize(path[0]) !== normalize(gaz.root.name)) return null;
  let cur: GazetteerNodeLike | undefined = gaz.root;
  for (let i = 1; i < path.length && cur; i++) {
    cur = cur.children?.find(c => normalize(c.name) === normalize(path[i]));
  }
  return cur ?? null;
}

export function usePlaceTree(opts: UsePlaceTreeOptions) {
  const roots = ref<PlaceTreeNode[]>([]);
  const filter = ref<string>('');

  async function loadRoots(): Promise<void> {
    const dbRoots = (await window.api?.places.listChildren(null)) as DbChildRow[] | undefined ?? [];
    const merged = new Map<string, PlaceTreeNode>();

    for (const row of dbRoots) {
      const key = dbKeyFor(row.id);
      merged.set(normalize(row.name), {
        key,
        name: row.name,
        type: row.place_type,
        source: 'db',
        dbId: row.id,
        gazId: null,
        gazPath: null,
        parent: null,
        hasChildren: !!row.hasChildren,
        childrenLoaded: false,
        expanded: false,
        children: [],
      });
    }

    for (const gaz of opts.getGazetteers()) {
      const norm = normalize(gaz.root.name);
      const existing = merged.get(norm);
      if (existing) {
        existing.source = 'merged';
        existing.gazId = gaz.id;
        existing.gazPath = [gaz.root.name];
        if ((gaz.root.children?.length ?? 0) > 0) existing.hasChildren = true;
      } else {
        merged.set(norm, {
          key: gazKeyFor(gaz.id, [gaz.root.name]),
          name: gaz.root.name,
          type: gaz.root.type,
          source: 'gazetteer',
          dbId: null,
          gazId: gaz.id,
          gazPath: [gaz.root.name],
          parent: null,
          hasChildren: (gaz.root.children?.length ?? 0) > 0,
          childrenLoaded: false,
          expanded: false,
          children: [],
        });
      }
    }

    roots.value = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function expandNode(node: PlaceTreeNode): Promise<void> {
    if (node.childrenLoaded) {
      node.expanded = true;
      return;
    }
    const merged = new Map<string, PlaceTreeNode>();

    if (node.dbId) {
      const dbChildren = (await window.api?.places.listChildren(node.dbId)) as DbChildRow[] | undefined ?? [];
      for (const row of dbChildren) {
        merged.set(normalize(row.name), {
          key: dbKeyFor(row.id),
          name: row.name,
          type: row.place_type,
          source: 'db',
          dbId: row.id,
          gazId: null,
          gazPath: null,
          parent: node,
          hasChildren: !!row.hasChildren,
          childrenLoaded: false,
          expanded: false,
          children: [],
        });
      }
    }

    if (node.gazId && node.gazPath) {
      const gaz = opts.getGazetteers().find(g => g.id === node.gazId);
      const gazNode = gaz ? findGazNode(gaz, node.gazPath) : null;
      const gazChildren = gazNode?.children ?? [];
      for (const child of gazChildren) {
        const norm = normalize(child.name);
        const childPath = [...node.gazPath, child.name];
        const existing = merged.get(norm);
        if (existing) {
          existing.source = 'merged';
          existing.gazId = node.gazId;
          existing.gazPath = childPath;
          if ((child.children?.length ?? 0) > 0) existing.hasChildren = true;
        } else {
          merged.set(norm, {
            key: gazKeyFor(node.gazId, childPath),
            name: child.name,
            type: child.type,
            source: 'gazetteer',
            dbId: null,
            gazId: node.gazId,
            gazPath: childPath,
            parent: node,
            hasChildren: (child.children?.length ?? 0) > 0,
            childrenLoaded: false,
            expanded: false,
            children: [],
          });
        }
      }
    }

    node.children = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    node.childrenLoaded = true;
    node.expanded = true;
  }

  function collapseNode(node: PlaceTreeNode): void {
    node.expanded = false;
  }

  async function expandAllForFilter(): Promise<void> {
    const q = normalize(filter.value);
    if (q.length < 2) return;
    async function walk(node: PlaceTreeNode): Promise<boolean> {
      if (!node.childrenLoaded && node.hasChildren) {
        await expandNode(node);
      }
      let anyMatch = normalize(node.name).includes(q);
      for (const child of node.children) {
        const childMatch = await walk(child);
        if (childMatch) anyMatch = true;
      }
      if (anyMatch) node.expanded = true;
      return anyMatch;
    }
    for (const root of roots.value) {
      await walk(root);
    }
  }

  async function applyFilter(query: string): Promise<void> {
    filter.value = query;
    if (normalize(query).length >= 2) {
      await expandAllForFilter();
    }
  }

  /** True when the filter is active (>= 2 chars). */
  const filterActive = computed(() => normalize(filter.value).length >= 2);

  function nodeMatchesFilter(node: PlaceTreeNode): boolean {
    if (!filterActive.value) return true;
    const q = normalize(filter.value);
    if (normalize(node.name).includes(q)) return true;
    return node.children.some(c => nodeMatchesFilter(c));
  }

  /** Flat ordered list of nodes that should currently be rendered (respecting expand state and filter). */
  const visibleNodes = computed<PlaceTreeNode[]>(() => {
    const out: PlaceTreeNode[] = [];
    function walk(node: PlaceTreeNode): void {
      if (filterActive.value && !nodeMatchesFilter(node)) return;
      out.push(node);
      if (node.expanded) {
        for (const c of node.children) walk(c);
      }
    }
    for (const root of roots.value) walk(root);
    return out;
  });

  async function findPathTo(placeId: string): Promise<PlaceTreeNode[]> {
    const ancestors = (await window.api?.places.getAncestors(placeId)) as Array<{ id: string; name: string }> | undefined ?? [];
    if (ancestors.length === 0) return [];
    const path: PlaceTreeNode[] = [];
    let level = roots.value;
    let parent: PlaceTreeNode | null = null;
    for (const a of ancestors) {
      const next = level.find(n => normalize(n.name) === normalize(a.name) || n.dbId === a.id);
      if (!next) break;
      path.push(next);
      if (parent && !next.expanded) await expandNode(next);
      parent = next;
      level = next.children;
    }
    return path;
  }

  async function createChild(parent: PlaceTreeNode, name: string): Promise<{ id: string; name: string }> {
    let parentDbId = parent.dbId;
    if (!parentDbId) {
      if (!parent.gazPath) throw new Error('Cannot create child under a node with no DB id and no gazetteer path');
      const ancestors = parent.gazPath.slice(0, -1).map(n => ({ name: n }));
      const materializedParent = (await window.api?.places.findOrCreateWithChain(parent.name, ancestors)) as { id: string; name: string };
      parentDbId = materializedParent.id;
      parent.dbId = parentDbId;
      parent.source = 'merged';
    }
    const created = (await window.api?.places.create({ name, parent_place_id: parentDbId })) as { id: string; name: string };
    parent.children.push({
      key: dbKeyFor(created.id),
      name: created.name,
      type: null,
      source: 'db',
      dbId: created.id,
      gazId: null,
      gazPath: null,
      parent,
      hasChildren: false,
      childrenLoaded: true,
      expanded: false,
      children: [],
    });
    parent.children.sort((a, b) => a.name.localeCompare(b.name));
    parent.hasChildren = true;
    parent.expanded = true;
    parent.childrenLoaded = true;
    return created;
  }

  return {
    roots,
    visibleNodes,
    filter,
    filterActive,
    loadRoots,
    expandNode,
    collapseNode,
    applyFilter,
    findPathTo,
    createChild,
  };
}
```

- [ ] **Step 4: Run the composable test to verify it passes**

Run: `npx vitest run tests/components/usePlaceTree.test.ts --reporter=verbose`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/composables/usePlaceTree.ts tests/components/usePlaceTree.test.ts
git commit -m "feat(ui): add usePlaceTree composable for merged DB+gazetteer browsing"
```

---

## Task 5: `PlaceTreeNode.vue` recursive row component

**Files:**
- Create: `src/renderer/components/PlaceTreeNode.vue`

This task has no dedicated unit test — it is exercised through `PlaceTreePickerModal.vue` (Task 6) and the E2E test (Task 9). Component testing for recursive Vue components is brittle compared to driving the modal end-to-end.

- [ ] **Step 1: Create the component**

Create `src/renderer/components/PlaceTreeNode.vue`:

```vue
<template>
  <li
    role="treeitem"
    :aria-level="level"
    :aria-expanded="node.hasChildren ? node.expanded : undefined"
    :aria-selected="isSelected"
    :class="['tree-node', { selected: isSelected }]"
    v-narrate="narrationText"
  >
    <div class="row" @click="onSelect">
      <button
        v-if="node.hasChildren"
        type="button"
        class="chevron"
        :aria-label="node.expanded ? $t('places.tree.collapse') : $t('places.tree.expand')"
        @click.stop="onToggle"
      >
        {{ node.expanded ? '▾' : '▸' }}
      </button>
      <span v-else class="chevron-spacer" aria-hidden="true"></span>
      <span class="name">{{ node.name }}</span>
      <span v-if="node.type" class="type">{{ $te('placeTypes.' + node.type) ? $t('placeTypes.' + node.type) : node.type }}</span>
      <span v-if="node.source === 'gazetteer'" class="gaz-badge">{{ $t('places.tree.fromGazetteerBadge') }}</span>
      <button
        type="button"
        class="add-child"
        :aria-label="$t('places.tree.addChild')"
        :title="$t('places.tree.addChild')"
        @click.stop="onAddChildClick"
      >+</button>
    </div>
    <form v-if="creating" class="create-form" @submit.prevent="onCreateSubmit">
      <input
        ref="newNameInput"
        type="text"
        v-model="newName"
        :placeholder="$t('places.tree.newChildLabel', { parent: node.name })"
        :aria-label="$t('places.tree.newChildLabel', { parent: node.name })"
        @keydown.escape.prevent="cancelCreate"
      />
      <button type="submit" :disabled="!newName.trim() || saving">{{ $t('places.tree.save') }}</button>
      <button type="button" @click="cancelCreate">{{ $t('places.tree.cancel') }}</button>
    </form>
    <ul v-if="node.expanded && node.children.length > 0" role="group" class="children">
      <PlaceTreeNode
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :level="level + 1"
        :selected-key="selectedKey"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
        @add-child="$emit('add-child', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { PlaceTreeNode as TreeNode } from '../composables/usePlaceTree';

const props = defineProps<{
  node: TreeNode;
  level: number;
  selectedKey: string | null;
}>();
const emit = defineEmits<{
  select: [node: TreeNode];
  toggle: [node: TreeNode];
  'add-child': [payload: { parent: TreeNode; name: string }];
}>();

const creating = ref(false);
const newName = ref('');
const saving = ref(false);
const newNameInput = ref<HTMLInputElement | null>(null);

const isSelected = computed(() => props.selectedKey === props.node.key);
const narrationText = computed(() => {
  const parts = [props.node.name];
  if (props.node.type) parts.push(props.node.type);
  return parts.join(', ');
});

function onSelect() { emit('select', props.node); }
function onToggle() { emit('toggle', props.node); }
function onAddChildClick() {
  creating.value = true;
  newName.value = '';
  nextTick(() => newNameInput.value?.focus());
}
function cancelCreate() {
  creating.value = false;
  newName.value = '';
}
async function onCreateSubmit() {
  if (!newName.value.trim() || saving.value) return;
  saving.value = true;
  try {
    emit('add-child', { parent: props.node, name: newName.value.trim() });
  } finally {
    saving.value = false;
    creating.value = false;
    newName.value = '';
  }
}
</script>

<style scoped>
.tree-node { list-style: none; }
.row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; cursor: pointer;
  border-radius: var(--radius-sm);
}
.row:hover { background: var(--surface-hover); }
.tree-node.selected > .row { background: var(--accent); color: var(--accent-text); }
.chevron, .chevron-spacer {
  width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px;
}
.chevron { background: transparent; border: none; cursor: pointer; color: var(--text-secondary); }
.chevron:hover { color: var(--text-primary); }
.name { flex: 0 1 auto; }
.type { font-size: var(--font-xs); color: var(--text-muted); }
.gaz-badge {
  font-size: var(--font-xs);
  color: var(--success-text); background: var(--success-bg);
  padding: 1px 5px; border-radius: 3px;
}
.add-child {
  margin-left: auto;
  width: 22px; height: 22px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--surface-border);
  background: var(--surface-bg); color: var(--text-secondary);
  cursor: pointer; font-size: 14px; line-height: 1;
}
.add-child:hover { background: var(--surface-hover); color: var(--accent); }
.create-form {
  display: flex; gap: 6px;
  margin: 4px 0 4px 24px;
}
.create-form input {
  flex: 1; padding: 4px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm); background: var(--surface-bg); color: var(--text-primary);
}
.create-form button {
  padding: 4px 10px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg); color: var(--text-primary);
  cursor: pointer;
}
.create-form button:hover { background: var(--surface-hover); }
.children { list-style: none; padding-left: 18px; margin: 0; }
</style>
```

- [ ] **Step 2: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: no new errors related to PlaceTreeNode.vue. (Pre-existing errors in unrelated files, if any, can be ignored.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PlaceTreeNode.vue
git commit -m "feat(ui): add PlaceTreeNode recursive row component"
```

---

## Task 6: `PlaceTreePickerModal.vue`

**Files:**
- Create: `src/renderer/components/modals/PlaceTreePickerModal.vue`

- [ ] **Step 1: Create the modal**

Create `src/renderer/components/modals/PlaceTreePickerModal.vue`:

```vue
<template>
  <BaseSubPanel
    entity-type="place"
    :title="$t('places.tree.title')"
    mode="standalone"
    hide-save
    @cancel="$emit('close')"
    @close="$emit('close')"
  >
    <div class="tree-picker">
      <input
        ref="filterInputRef"
        type="text"
        class="filter-input"
        v-model="filterText"
        :placeholder="$t('places.tree.filterPlaceholder')"
        :aria-label="$t('places.tree.filterPlaceholder')"
        @input="onFilterInput"
      />
      <div v-if="loading" class="state">{{ $t('places.tree.loading') }}</div>
      <div v-else-if="roots.length === 0" class="state">{{ $t('places.tree.empty') }}</div>
      <div v-else-if="filterActive && visibleNodes.length === 0" class="state">
        {{ $t('places.tree.noResults') }}
      </div>
      <ul v-else role="tree" class="tree-root" :aria-label="$t('places.tree.title')">
        <PlaceTreeNode
          v-for="root in roots"
          :key="root.key"
          :node="root"
          :level="1"
          :selected-key="selectedKey"
          @select="onSelectNode"
          @toggle="onToggle"
          @add-child="onAddChild"
        />
      </ul>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlaceTreeNode from '../PlaceTreeNode.vue';
import { usePlaceTree, type PlaceTreeNode as TreeNode } from '../../composables/usePlaceTree';
import { usePlaceResolver } from '../../composables/usePlaceResolver';
import { useToast } from '../../composables/useToast';

interface PlaceRow { id: string; name: string; place_type: string | null; postal_code: string | null; city: string | null; parent_name?: string | null; }

const props = defineProps<{
  initialPlaceId: string | null;
  initialQuery: string;
}>();
const emit = defineEmits<{
  select: [place: PlaceRow];
  close: [];
}>();

const { t } = useI18n();
const toast = useToast();
const filterInputRef = ref<HTMLInputElement | null>(null);
const filterText = ref('');
const loading = ref(true);
const selectedKey = ref<string | null>(null);

const { ready: gazetteerReady, ensureLoaded: ensureGazetteersLoaded, getGazetteers } = usePlaceResolver();
// Destructure so reactive properties auto-unwrap in the template.
const tree = usePlaceTree({ getGazetteers });
const { roots, visibleNodes, filterActive, loadRoots, expandNode, collapseNode, applyFilter, findPathTo, createChild } = tree;

let filterDebounce: ReturnType<typeof setTimeout> | null = null;
function onFilterInput() {
  if (filterDebounce) clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => { tree.applyFilter(filterText.value); }, 150);
}

async function onToggle(node: TreeNode) {
  if (node.expanded) tree.collapseNode(node);
  else if (node.hasChildren) await tree.expandNode(node);
}

async function onSelectNode(node: TreeNode) {
  selectedKey.value = node.key;
  try {
    if (node.dbId) {
      const place = (await window.api.places.get(node.dbId)) as PlaceRow | null;
      if (place) { emit('select', place); return; }
    }
    if (node.gazPath) {
      const ancestors = node.gazPath.slice(0, -1).map(n => ({ name: n }));
      const place = (await window.api.places.findOrCreateWithChain(node.name, ancestors)) as PlaceRow;
      node.dbId = place.id;
      emit('select', place);
      return;
    }
    toast.error(t('errors.saveFailed'));
  } catch (err) {
    console.error('[PlaceTreePickerModal] select failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function onAddChild(payload: { parent: TreeNode; name: string }) {
  try {
    const created = await tree.createChild(payload.parent, payload.name);
    const place = (await window.api.places.get(created.id)) as PlaceRow;
    if (place) emit('select', place);
  } catch (err) {
    console.error('[PlaceTreePickerModal] add-child failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  if (!gazetteerReady.value) await ensureGazetteersLoaded();
  await tree.loadRoots();
  if (props.initialPlaceId) {
    const path = await tree.findPathTo(props.initialPlaceId);
    if (path.length > 0) {
      selectedKey.value = path[path.length - 1].key;
    }
  } else if (props.initialQuery && props.initialQuery.trim().length >= 2) {
    filterText.value = props.initialQuery;
    await tree.applyFilter(props.initialQuery);
  }
  loading.value = false;
  await nextTick();
  filterInputRef.value?.focus();
});
</script>

<style scoped>
.tree-picker { display: flex; flex-direction: column; gap: 8px; min-width: 480px; }
.filter-input {
  width: 100%; box-sizing: border-box;
  padding: 8px 10px;
  border: 1.5px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-size: var(--font-base);
  background: var(--surface-bg); color: var(--text-primary);
}
.filter-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}
.state {
  padding: 24px; text-align: center;
  color: var(--text-muted);
  font-size: var(--font-base);
}
.tree-root {
  list-style: none; padding: 0; margin: 0;
  max-height: 480px; overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: 4px;
}
</style>
```

- [ ] **Step 2: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: no new errors related to `PlaceTreePickerModal.vue`. Fix any reported issues before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modals/PlaceTreePickerModal.vue
git commit -m "feat(ui): add PlaceTreePickerModal with filter, tree, inline-create"
```

---

## Task 7: i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Locate the `places` block**

Run: `grep -nE "^  places: \{|tree:" src/renderer/i18n/sv.ts | head -10`

Note the line numbers for the `places: { ... }` block in both files.

- [ ] **Step 2: Add Swedish keys**

Edit `src/renderer/i18n/sv.ts`. Inside `places: { ... }`, add:

```typescript
    tree: {
      openTree: 'Bläddra platser i träd',
      title: 'Platsträd',
      filterPlaceholder: 'Filtrera platser…',
      addChild: 'Lägg till underplats',
      newChildLabel: 'Ny underplats till {parent}',
      save: 'Spara',
      cancel: 'Avbryt',
      expand: 'Expandera',
      collapse: 'Fäll ihop',
      empty: 'Inga platser än. Skapa din första genom att skriva i fältet.',
      noResults: 'Inga träffar.',
      loading: 'Laddar…',
      fromGazetteerBadge: 'gazetteer',
    },
```

- [ ] **Step 3: Add English keys**

Edit `src/renderer/i18n/en.ts`. Inside `places: { ... }`, add:

```typescript
    tree: {
      openTree: 'Browse places in tree',
      title: 'Place tree',
      filterPlaceholder: 'Filter places…',
      addChild: 'Add child place',
      newChildLabel: 'New child place under {parent}',
      save: 'Save',
      cancel: 'Cancel',
      expand: 'Expand',
      collapse: 'Collapse',
      empty: 'No places yet. Create one by typing in the input.',
      noResults: 'No matches.',
      loading: 'Loading…',
      fromGazetteerBadge: 'gazetteer',
    },
```

- [ ] **Step 4: Confirm i18n parity test still passes**

Run: `npx vitest run tests/unit/i18nParity*.test.ts --reporter=verbose 2>&1 | tail -20`

If a parity test exists and fails, fix typos in the smaller block until it passes. (If no such test exists, this step is a no-op.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n(places): add place-tree picker keys"
```

---

## Task 8: Wire tree-button into `PlacePicker`

**Files:**
- Modify: `src/renderer/components/PlacePicker.vue`

- [ ] **Step 1: Add the import and modal state**

In the `<script setup lang="ts">` block of `src/renderer/components/PlacePicker.vue`, add the import next to the others:

```typescript
import PlaceTreePickerModal from './modals/PlaceTreePickerModal.vue';
```

Add modal state near the existing refs:

```typescript
const treeModalOpen = ref(false);

function openTreeModal() { treeModalOpen.value = true; }
function onTreeSelect(place: PlaceRow) {
  treeModalOpen.value = false;
  select(place);
}
```

- [ ] **Step 2: Update the template with the button + modal mount**

In `src/renderer/components/PlacePicker.vue`, modify the root `<div class="place-picker">` block. Wrap the existing `<input>` and add a button next to it (do NOT touch the Teleport/dropdown — leave it where it is).

Replace the existing single-`<input>` line at the top of the template with:

```vue
    <div class="picker-input-row">
      <input
        ref="inputRef"
        type="text"
        v-model="query"
        :placeholder="placeholder || $t('places.searchPlaceholder')"
        role="combobox"
        :aria-expanded="showDropdown && (results.length > 0 || query.length > 1)"
        aria-autocomplete="list"
        :aria-controls="pickerId + '-listbox'"
        :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + highlightIndex : undefined"
        @input="onInput"
        @focus="showDropdown = true"
        @blur="onBlur"
        @keydown="onKeydown"
        autocomplete="off"
      />
      <button
        type="button"
        class="tree-picker-btn"
        :aria-label="$t('places.tree.openTree')"
        :title="$t('places.tree.openTree')"
        @click="openTreeModal"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
            d="M3 2h3l1 1.5h6V13H3z M3 6h10 M7 3.5V13" />
        </svg>
      </button>
    </div>
```

Add at the end of the root `<div class="place-picker">` (before its closing `</div>`):

```vue
    <PlaceTreePickerModal
      v-if="treeModalOpen"
      :initial-place-id="modelValue"
      :initial-query="query"
      @select="onTreeSelect"
      @close="treeModalOpen = false"
    />
```

- [ ] **Step 3: Add styles**

Append to the `<style scoped>` block in `src/renderer/components/PlacePicker.vue`:

```css
.picker-input-row {
  display: flex; align-items: center; gap: 4px;
  width: 100%;
}
.picker-input-row input { flex: 1; }
.tree-picker-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg); color: var(--text-secondary);
  cursor: pointer;
}
.tree-picker-btn:hover { background: var(--surface-hover); color: var(--text-primary); }
.tree-picker-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 4: Confirm existing component test still passes**

Run: `npx vitest run tests/components/PlacePicker.test.ts --reporter=verbose`
Expected: PASS — the tree button is additive and the existing autocomplete behaviour is untouched.

- [ ] **Step 5: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: no new errors related to PlacePicker.vue.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PlacePicker.vue
git commit -m "feat(ui): tree-picker button on PlacePicker, opens hierarchy modal"
```

---

## Task 9: E2E happy-path test

**Files:**
- Modify: `tests/e2e/gui-places.test.ts`

- [ ] **Step 1: Add an E2E case**

Append a new `test()` block inside the existing `gui-places.test.ts` describe. Use the next free port reserved for this file (already set in fixture). Pattern follows existing tests in the file:

```typescript
test('place tree picker creates a child under an existing parent', async () => {
  const app = await startApp(/* existing port */, 'place-tree-picker');
  try {
    // 1. Seed: create a parent place via existing place modal flow
    await app.navigate('/places');
    await app.click('[data-test="add-place"]');
    await app.fill('[data-test="place-name"]', 'Test-parent');
    await app.click('[data-test="place-save"]');

    // 2. Open an event modal that has a place picker
    await app.navigate('/persons');
    await app.click('[data-test="add-person"]');
    await app.fill('[data-test="given-name"]', 'Test');
    await app.click('[data-test="save-person"]');
    // Open the just-created person, add a birth event
    await app.click('[data-test="add-event"]');
    // Open the tree picker
    await app.click('.tree-picker-btn');
    // Filter to "Test-parent" and click it to expand, then add child
    await app.fill('.filter-input', 'Test-parent');
    await app.waitForSelector('.tree-node:has-text("Test-parent")');
    await app.click('.tree-node:has-text("Test-parent") .add-child');
    await app.fill('.create-form input', 'Testgård');
    await app.click('.create-form button[type="submit"]');

    // 3. Assert: picker now shows "Test-parent, Testgård"
    const value = await app.inputValue('[data-test="event-place"]');
    expect(value).toContain('Testgård');
    expect(value).toContain('Test-parent');
  } finally {
    await app.close();
  }
});
```

Selectors above are illustrative — read the existing tests in `gui-places.test.ts` for the exact `data-test` attributes / fallback selectors used in this codebase, and adjust to match. If the existing event-modal flow does not have a `data-test="event-place"` on the picker input, add one to `EventModal.vue` and run the existing `gui-places.test.ts` to confirm nothing else regressed.

- [ ] **Step 2: Run only this E2E test**

Run: `npx playwright test gui-places.test.ts -g "place tree picker"`
Expected: PASS. Iterate on selectors until green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/gui-places.test.ts src/renderer/components/modals/EventModal.vue
git commit -m "test(e2e): place tree picker creates child under existing parent"
```

(Drop the EventModal.vue add if no data-test attribute change was needed.)

---

## Task 10: Smoke + version bump

- [ ] **Step 1: Run the full unit + component suites**

Run: `npm test`
Expected: PASS (all ~2120+ tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Run: `npm start`
Walk through:
1. Open an event modal on any person.
2. Click the new tree-button next to the place input.
3. Verify the modal opens, filter works, expand/collapse works, `+ Add child` flow creates a place.
4. Confirm the created place appears in the picker text and in `/places`.
5. Open the modal again with the picker pre-selected — verify the chain pre-expands and the row is visible/selected.

- [ ] **Step 4: Bump minor version**

This is a feature → minor bump (per [feedback_version_bump.md](file:///Users/jonasahnstedt/.claude/projects/-Users-jonasahnstedt-git-slaktforskning/memory/feedback_version_bump.md)). Edit `package.json` `version` field, e.g. `0.176.0` → `0.177.0`.

Run: `npm install` (to update package-lock.json).

- [ ] **Step 5: Final commit**

```bash
git add package.json package-lock.json
git commit -m "feat(ui): place tree picker — browse, select, add child (v0.177.0)"
```
