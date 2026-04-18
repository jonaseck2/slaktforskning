# Chart Visual Overhaul — Finish the Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the chart visual overhaul that shipped in v0.111.0 — photos must actually load, connectors must actually curve, and per-box heights must be dynamic so wrapped names + birth/death lines fit inside the box.

**Architecture:** The infrastructure from v0.111.0 is in place but never wired up:
- `measure.ts::measureBoxHeight()` exists — three layouts still hardcode `BOX_H`.
- `connectors.ts::curvedElbow()` exists — three layouts still push straight `Line[]` segments.
- `ChartLayout.paths: string[]` exists in types — always returned empty.
- `photoUrl` holds the raw `file_ref` filesystem path — SVG `<image href>` can't load it from the renderer origin, so every photo renders as the browser's broken-image glyph.

This plan wires those three pieces in, per chart (pedigree → descendant → hourglass), with TDD for the layout logic and manual/visual checks for the Vue templates. Photos become data URLs (cached across the session) via `window.api.media.readAsDataUrl` — the same API used by `PersonMediaSection.vue`.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, SVG, Canvas `measureText` (for name wrap measurement), Vitest.

**Spec:** [docs/superpowers/specs/2026-04-18-chart-visual-overhaul-design.md](../superpowers/specs/2026-04-18-chart-visual-overhaul-design.md)

**Brainstorm mocks:** [.superpowers/brainstorm/56955-1776537664/content/full-tree-v2.html](../../.superpowers/brainstorm/56955-1776537664/content/full-tree-v2.html)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/utils/chartData.ts` | Modify | Resolve `photoUrl` to a data URL via `media.readAsDataUrl`, cached by media ID |
| `src/renderer/utils/chart-layout/pedigree.ts` | Modify | Per-box dynamic `h` from `measureBoxHeight`; cumulative-Y leaf packing; curved connector paths via `curvedElbow`; populate `paths[]`, keep `lines: []` |
| `src/renderer/utils/chart-layout/descendant.ts` | Modify | Per-box `h`; per-row-max generation spacing; curved paths |
| `src/renderer/utils/chart-layout/hourglass.ts` | Modify | Per-box `h`; per-row-max generation spacing (both ancestor rows going up and descendant rows going down); curved paths |
| `src/renderer/utils/chart-layout/constants.ts` | Modify | Remove the `BOX_H = MIN_BOX_H` shim at the very end, after all callers are converted |
| `src/renderer/components/charts/PedigreeChart.vue` | Modify | Render `<path v-for d>` connectors, use `box.h` everywhere, add `<defs><filter id="chart-shadow">`, wrap box group in `filter="url(#chart-shadow)"` |
| `src/renderer/components/charts/DescendantChart.vue` | Modify | Same template changes |
| `src/renderer/components/charts/HourglassChart.vue` | Modify | Same template changes |
| `src/renderer/components/charts/ChartTooltip.vue` | Modify | Show `birthPlace` / `deathPlace` alongside dates |
| `tests/unit/chartLayout.test.ts` | Modify | Update pedigree/hourglass/descendant tests: assert `boxes[i].h` is dynamic; assert `layout.paths.length > 0` and every path starts with `M `; drop assertions on fixed `BOX_H` |
| `tests/unit/chartData.test.ts` | Create | Unit test `fetchPersonNode` photo-URL caching (mocks `window.api`) |
| `package.json` | Modify | Version bump |
| `docs/PLAN.md` | Modify | Roadmap entry |

**Out of scope:** Circle, Fan, Timeline charts (they shipped working in earlier milestones and do not share the box-rendering template).

---

## Task 1: Resolve `photoUrl` to a data URL with caching

**Files:**
- Modify: `src/renderer/utils/chartData.ts`
- Create: `tests/unit/chartData.test.ts`

**Why:** The pedigree currently renders `<image href="/Users/jonas/.../file.jpg">`. The Electron renderer cannot load `file://` assets from its `app://` origin, so every photo renders as the broken-image glyph. The rest of the app uses `window.api.media.readAsDataUrl(mediaId)` to turn a media id into a `data:image/...;base64,...` URL, which SVG can render. We do the same here, caching per session so that a person appearing in multiple charts only pays the IPC cost once.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chartData.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchPersonNode, _resetPhotoCacheForTests } from '../../src/renderer/utils/chartData';

type MockApi = {
  persons: { get: ReturnType<typeof vi.fn>; getNames: ReturnType<typeof vi.fn> };
  events: { forPerson: ReturnType<typeof vi.fn> };
  media: {
    forEntity: ReturnType<typeof vi.fn>;
    readAsDataUrl: ReturnType<typeof vi.fn>;
  };
  places: { get: ReturnType<typeof vi.fn> };
  relationships: { getForPerson: ReturnType<typeof vi.fn> };
};

function installMockApi(): MockApi {
  const api: MockApi = {
    persons: {
      get: vi.fn().mockResolvedValue({ id: 'p1', sex: 'M', living: false }),
      getNames: vi.fn().mockResolvedValue([
        { given_name: 'Test', surname: 'Person', preferred_name: null, nickname: null, sort_order: 0 },
      ]),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    media: {
      forEntity: vi.fn().mockResolvedValue([
        { id: 'm1', file_ref: '/tmp/photo.jpg', sort_order: 0 },
      ]),
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'),
    },
    places: { get: vi.fn().mockResolvedValue(null) },
    relationships: { getForPerson: vi.fn().mockResolvedValue([]) },
  };
  // @ts-expect-error — assigning mock api to window for the module under test
  globalThis.window = { api };
  return api;
}

describe('fetchPersonNode — photoUrl', () => {
  beforeEach(() => {
    _resetPhotoCacheForTests();
  });

  it('resolves photoUrl to a data URL via media.readAsDataUrl', async () => {
    const api = installMockApi();
    const node = await fetchPersonNode('p1');
    expect(api.media.readAsDataUrl).toHaveBeenCalledWith('m1');
    expect(node.photoUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('returns null photoUrl when the person has no linked media', async () => {
    const api = installMockApi();
    api.media.forEntity.mockResolvedValue([]);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
    expect(api.media.readAsDataUrl).not.toHaveBeenCalled();
  });

  it('caches the data URL per media id across calls', async () => {
    const api = installMockApi();
    await fetchPersonNode('p1');
    await fetchPersonNode('p1');
    expect(api.media.readAsDataUrl).toHaveBeenCalledTimes(1);
  });

  it('returns null photoUrl and leaves cache untouched when readAsDataUrl returns null', async () => {
    const api = installMockApi();
    api.media.readAsDataUrl.mockResolvedValueOnce(null);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/unit/chartData.test.ts
```

Expected: FAIL — `_resetPhotoCacheForTests` is not exported from `chartData.ts`, and `photoUrl` is still the raw `file_ref`.

- [ ] **Step 3: Modify `src/renderer/utils/chartData.ts`**

Replace the top of the file (lines 1-63) with:

```typescript
// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry, DescendantNode, TreePerson } from './chart-layout';

type RawPerson  = { id: string; sex: string; living: boolean };
type RawName    = { given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; sort_order: number };
type RawEvent   = { event_type: string; date_value: string | null; place_id?: string | null };
type RawRel     = { type: string; person1_id: string | null; person2_id: string | null };
type RawMedia   = { id: string; file_ref?: string | null; sort_order: number };
type RawPlace   = { id: string; name: string };

// Session cache: media id → resolved data URL (or null if the app reported no file).
// Keyed by media id so the same photo shared across persons only pays the IPC cost once.
const photoDataUrlCache = new Map<string, string | null>();

/** Test hook — reset the module-level photo cache between test cases. */
export function _resetPhotoCacheForTests(): void {
  photoDataUrlCache.clear();
}

async function resolvePhotoDataUrl(mediaId: string): Promise<string | null> {
  if (photoDataUrlCache.has(mediaId)) return photoDataUrlCache.get(mediaId) ?? null;
  const url = (await window.api.media.readAsDataUrl(mediaId)) as string | null;
  const resolved = url ?? null;
  // Only cache non-null — a transient null (e.g. file missing) shouldn't poison the cache permanently.
  if (resolved !== null) photoDataUrlCache.set(mediaId, resolved);
  return resolved;
}

export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events, mediaLinks] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
    window.api.media.forEntity('person', id),
  ]) as [RawPerson | null, RawName[], RawEvent[], RawMedia[]];

  if (!person) throw new Error(`Person not found: ${id}`);
  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null, nickname: null };

  const birthEvent = events.find(e => e.event_type === 'birth');
  const deathEvent = events.find(e => e.event_type === 'death');

  let birthPlace: string | null = null;
  let deathPlace: string | null = null;

  if (birthEvent?.place_id) {
    try {
      const place = (await window.api.places.get(birthEvent.place_id)) as RawPlace | null;
      birthPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }
  if (deathEvent?.place_id) {
    try {
      const place = (await window.api.places.get(deathEvent.place_id)) as RawPlace | null;
      deathPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }

  // Profile photo: first media link sorted by sort_order, resolved to a data URL.
  const sortedMedia = [...mediaLinks].sort((a, b) => a.sort_order - b.sort_order);
  const profileMediaId = sortedMedia[0]?.id ?? null;
  const photoUrl = profileMediaId ? await resolvePhotoDataUrl(profileMediaId) : null;

  return {
    id,
    givenName: primary.given_name,
    surname: primary.surname,
    preferredName: primary.preferred_name ?? null,
    nickname: primary.nickname ?? null,
    sex: person.sex as 'M' | 'F' | 'U',
    living: Boolean(person.living),
    birthDate: birthEvent?.date_value ?? null,
    deathDate: deathEvent?.date_value ?? null,
    birthPlace,
    deathPlace,
    photoUrl,
  };
}
```

Leave the rest of `chartData.ts` (the pedigree/hourglass/descendant/timeline fetchers below line 63) untouched.

- [ ] **Step 4: Run the test until it passes**

```bash
npx vitest run tests/unit/chartData.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Run the full test suite to catch regressions**

```bash
npm test -- --run
```

Expected: all existing tests still pass (no chart test asserts on `photoUrl` contents today).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/chartData.ts tests/unit/chartData.test.ts
git commit -m "fix(charts): resolve chart photos to data URLs via media.readAsDataUrl"
```

---

## Task 2: Pedigree layout — dynamic heights + curved connector paths

**Files:**
- Modify: `src/renderer/utils/chart-layout/pedigree.ts`
- Modify: `tests/unit/chartLayout.test.ts`

**Why:** Today every pedigree box is `h: BOX_H` (58 px), so a 2-line wrapped name pushes birth/death lines below the rounded bottom. And every connector is three straight `Line[]` segments — no curve radius. We replace both in one pass because the Y math has to know the real heights before it can emit curved paths that land on the correct edges.

**Strategy:**
1. Pre-measure `h` for every `TreePerson` via `measureBoxHeight(node.person)` into a `heightOf: Map<string, number>`.
2. Leaf Y coordinates: walk leaves in traversal order and lay them out with a cumulative `cursorY`, each leaf taking `h + V_GAP` of vertical space (replaces the `slot * ROW_H` calculation).
3. Internal `cy` still averages parent centers — unchanged.
4. Connectors: for each parent, emit `curvedElbow(childRightX, childCY, parentLeftX, parentCY, 'right')` as a single path. Drop the horizontal-from-child / vertical-fork / horizontal-to-parent trio.
5. The post-layout outline pass (spouse below selected, children to the left) also emits curved paths, using `'down'` for the spouse drop and `'right'` for the child branch.

- [ ] **Step 1: Update the layout tests first**

Open `tests/unit/chartLayout.test.ts`. Locate the pedigree test block (search for `describe('computePedigreeLayout'` or similar). Add a new `describe` block at the end of the pedigree section:

```typescript
describe('computePedigreeLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight (multi-line name grows the box)', () => {
    // Person with a very long name should wrap to multiple lines and grow past MIN_BOX_H.
    const focal: PersonNode = {
      id: 'f',
      givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd',
      surname: 'Eeeeeeeeeee Ffffffffff',
      preferredName: null, nickname: null,
      sex: 'M', living: true,
      birthDate: '1985', deathDate: null,
      birthPlace: 'Some Very Long Place Name', deathPlace: null,
      photoUrl: null,
    };
    const tree: PedigreeTree = {
      nodes: new Map([[1, focal]]),
      generations: 1,
    };
    const layout = computePedigreeLayout(tree);
    expect(layout.boxes).toHaveLength(1);
    expect(layout.boxes[0].h).toBeGreaterThan(MIN_BOX_H);
  });

  it('single-row person has h === MIN_BOX_H', () => {
    const focal: PersonNode = {
      id: 'f', givenName: 'Jo', surname: 'Doe',
      preferredName: null, nickname: null,
      sex: 'M', living: true,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const tree: PedigreeTree = { nodes: new Map([[1, focal]]), generations: 1 };
    const layout = computePedigreeLayout(tree);
    expect(layout.boxes[0].h).toBe(MIN_BOX_H);
  });

  it('emits curved SVG paths instead of straight lines', () => {
    const focal: PersonNode = {
      id: 'f', givenName: 'C', surname: 'Child',
      preferredName: null, nickname: null,
      sex: 'U', living: true,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const dad: PersonNode = { ...focal, id: 'd', givenName: 'D', surname: 'Dad', sex: 'M' };
    const mom: PersonNode = { ...focal, id: 'm', givenName: 'M', surname: 'Mom', sex: 'F' };
    const tree: PedigreeTree = {
      nodes: new Map([[1, focal], [2, dad], [3, mom]]),
      generations: 2,
    };
    const layout = computePedigreeLayout(tree);
    expect(layout.paths.length).toBeGreaterThanOrEqual(2); // one per parent
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) {
      expect(d).toMatch(/^M /); // SVG path starts with MoveTo
      expect(d).toContain('Q ');  // and contains a Q curve
    }
  });

  it('sibling rows stack without overlap using each box\'s own h', () => {
    // Two siblings with different names (different heights). Their boxes should not overlap vertically.
    const focal: PersonNode = {
      id: 'f', givenName: 'Short', surname: 'Name', preferredName: null, nickname: null,
      sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const longDad: PersonNode = {
      id: 'd', sex: 'M', living: false,
      givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd Eeeeeeee', surname: 'Ffffffff Gggggggg',
      preferredName: null, nickname: null,
      birthDate: '1940', deathDate: '2010', birthPlace: 'Very Very Long Place', deathPlace: 'Another Place',
      photoUrl: null,
    };
    const mom: PersonNode = { ...focal, id: 'm', givenName: 'M', surname: 'Mom', sex: 'F' };
    const tree: PedigreeTree = {
      nodes: new Map([[1, focal], [2, longDad], [3, mom]]),
      generations: 2,
    };
    const layout = computePedigreeLayout(tree);
    // Sort by Y and assert each box starts at or after the previous box's bottom.
    const sorted = [...layout.boxes].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      // Only check boxes in the same X column — siblings stacked vertically at the same generation.
      if (sorted[i].x === sorted[i - 1].x) {
        expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].h);
      }
    }
  });
});
```

Make sure the test file imports `MIN_BOX_H` and `PersonNode` / `PedigreeTree`; add them to the existing import block if missing.

- [ ] **Step 2: Run the new tests and watch them fail**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "dynamic heights and curved paths"
```

Expected: FAIL — layouts still push `BOX_H` and empty `paths`.

- [ ] **Step 3: Rewrite `pedigree.ts`**

Replace the entire file with:

```typescript
// Pedigree chart layout algorithm — operates on TreePerson graph.
// Focal at left, ancestors expand rightward. Supports N parents per node.

import type { PedigreeTree, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, MIN_BOX_H, V_GAP, H_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
import { buildPedigreeTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

/**
 * Lay out a pedigree chart (focal at left, ancestors going right).
 * Uses TreePerson graph — supports N parents per person.
 */
export function computePedigreeLayout(
  tree: PedigreeTree,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  // ── 1. Build TreePerson graph ───────────────────────────────────────────────
  const root = buildPedigreeTreePerson(tree);
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

  // ── 2. Collapse filtering ──────────────────────────────────────────────────
  const originalParentCount = new Map<string, number>();
  const hasMoreUp = new Map<string, boolean>();

  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    originalParentCount.set(node.person.id, node.parents.length);
    hasMoreUp.set(node.person.id, !!node.hasMoreAncestors);

    if (collapsed.has(`${node.person.id}:right`)) {
      node.parents = node.parents.filter(p => p.isPlaceholder);
    }

    for (const p of node.parents) recordAndPrune(p, visited);
  }
  recordAndPrune(root);

  // ── 3. Pre-measure heights for every node ─────────────────────────────────
  const heightOf = new Map<string, number>();
  function measureAll(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    // Placeholder outlines use MIN_BOX_H — their content is a plain "+ Add" label.
    const h = node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person);
    heightOf.set(node.person.id, h);
    for (const p of node.parents) measureAll(p, visited);
    for (const s of node.spouses) measureAll(s, visited);
    for (const c of node.children) measureAll(c, visited);
  }
  measureAll(root);

  const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;

  // ── 4. Geometry ────────────────────────────────────────────────────────────

  // Max ancestor depth from focal
  function maxDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.parents.length === 0) return 0;
    return 1 + Math.max(...node.parents.map(p => maxDepth(p, visited)));
  }

  const G = maxDepth(root) + 1;
  const genXOf = (g: number) => PAD + g * (BOX_W + H_GAP);

  // Leaf layout: walk leaves in traversal order and assign each a Y based on a
  // running cursor, taking that leaf's own height plus V_GAP. This replaces the
  // old slot*ROW_H scheme which assumed a fixed height.
  const leafCY = new Map<string, number>(); // leaf person id → center Y
  let cursorY = PAD;

  function assignLeafYs(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (node.parents.length === 0) {
      const h = hOf(node);
      leafCY.set(node.person.id, cursorY + h / 2);
      cursorY += h + V_GAP;
      if (selectedPersonId && node.person.id === selectedPersonId) {
        for (const sp of node.spouses) {
          if (sp.isPlaceholder) {
            const sh = hOf(sp);
            leafCY.set(sp.person.id, cursorY + sh / 2);
            cursorY += sh + V_GAP;
          }
        }
      }
      return;
    }
    for (const p of node.parents) assignLeafYs(p, visited);
    if (selectedPersonId && node.person.id === selectedPersonId) {
      for (const sp of node.spouses) {
        if (sp.isPlaceholder) {
          const sh = hOf(sp);
          leafCY.set(sp.person.id, cursorY + sh / 2);
          cursorY += sh + V_GAP;
        }
      }
    }
  }
  assignLeafYs(root);

  const totalLeafExtent = Math.max(cursorY - V_GAP, MIN_BOX_H);

  const cyCache = new Map<string, number>();
  function centerYOf(node: TreePerson): number {
    if (cyCache.has(node.person.id)) return cyCache.get(node.person.id)!;
    let cy: number;
    const leafY = leafCY.get(node.person.id);
    if (leafY !== undefined) {
      cy = leafY;
    } else {
      const parentCYs = node.parents.map(p => centerYOf(p));
      cy = parentCYs.length > 0
        ? parentCYs.reduce((a, b) => a + b, 0) / parentCYs.length
        : PAD + hOf(node) / 2;
    }
    cyCache.set(node.person.id, cy);
    return cy;
  }

  // Compute depth (generation) of each node
  const depthMap = new Map<string, number>();
  function nodeDepth(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    depthMap.set(node.person.id, depth);
    for (const p of node.parents) nodeDepth(p, depth + 1, visited);
  }
  nodeDepth(root, 0);

  // ── 5. Place boxes and curved paths ────────────────────────────────────────
  const boxes: BoxLayout[] = [];
  const paths: string[] = [];

  function placeNodes(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    const g = depthMap.get(node.person.id) ?? 0;
    const cy = centerYOf(node);
    const h = hOf(node);

    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: genXOf(g),
      y: cy - h / 2,
      w: BOX_W, h,
    });

    const childRightX = genXOf(g) + BOX_W;
    const parentLeftX = genXOf(g + 1);
    for (const p of node.parents) {
      const pcy = centerYOf(p);
      paths.push(curvedElbow(childRightX, cy, parentLeftX, pcy, 'right'));
    }

    for (const p of node.parents) placeNodes(p, visited);
  }
  placeNodes(root);

  // ── 6. Unplaced outline nodes for the selected person ──────────────────────
  const placeholderPaths: string[] = [];

  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));

    if (selBox) {
      const selNode = findPersonInTree(root, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selCY = selBox.y + selBox.h / 2;

        // Full-rectangle overlap check against existing boxes
        function findClearYRect(x: number, startY: number, direction: 1 | -1, boxH: number): number {
          let y = startY;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w && x + BOX_W > b.x &&
            y < b.y + b.h + V_GAP && y + boxH + V_GAP > b.y
          );
          while (overlaps()) {
            y += direction * (boxH + V_GAP);
          }
          return y;
        }

        // Spouse outline directly below selected, dashed vertical path
        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        if (unplacedSpouses.length > 0) {
          const selDepth = depthMap.get(selectedPersonId) ?? 0;
          let spTop = selBox.y + selBox.h + V_GAP;
          for (const sp of unplacedSpouses) {
            const sh = hOf(sp);
            boxes.push({
              person: sp.person,
              isFocal: false,
              x: genXOf(selDepth), y: spTop,
              w: BOX_W, h: sh,
            });
            // Dashed vertical connector from bottom of selected to top of spouse
            placeholderPaths.push(
              curvedElbow(selCX, selBox.y + selBox.h, selCX, spTop, 'down'),
            );
            spTop += sh + V_GAP;
          }
        }

        // Child outlines to the left of the selected person
        const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
        if (unplacedChildren.length > 0) {
          const childX = selBox.x - BOX_W - H_GAP;
          let nextY = findClearYRect(childX, selBox.y, 1, MIN_BOX_H);
          for (const ch of unplacedChildren) {
            const chH = hOf(ch);
            const childY = nextY;
            const childCY = childY + chH / 2;
            boxes.push({
              person: ch.person,
              isFocal: false,
              x: childX, y: childY,
              w: BOX_W, h: chH,
            });
            placeholderPaths.push(
              curvedElbow(selBox.x, selCY, childX + BOX_W, childCY, 'right'),
            );
            nextY = childY + chH + V_GAP;
          }
        }
      }
    }
  }

  // ── 7. SVG dimensions ──────────────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : MIN_BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;

  const svgWidth = Math.max(PAD + G * BOX_W + (G - 1) * H_GAP + PAD + 20, maxBoxRight + PAD);
  const svgHeight = Math.max(PAD + totalLeafExtent + PAD, maxBoxBottom + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const finalHeight = viewBoxMinY < 0 ? svgHeight + (-viewBoxMinY) : svgHeight;

  // ── 8. Collapse buttons ────────────────────────────────────────────────────
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const pid = box.person.id;
    if (pid.startsWith(PLACEHOLDER_PREFIX)) continue;

    const origParents = originalParentCount.get(pid) ?? 0;
    const moreUp = hasMoreUp.get(pid) ?? false;

    if (origParents > 0) {
      collapseButtons.push({
        personId: pid, direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + box.h / 2,
        isExpanded: !collapsed.has(`${pid}:right`),
        isLoadMore: false,
      });
    } else if (moreUp) {
      collapseButtons.push({
        personId: pid, direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + box.h / 2,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── 9. Extract placeholders ────────────────────────────────────────────────
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = []; // kept for type compat, unused

  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!box.person.id.startsWith(PLACEHOLDER_PREFIX)) continue;
    const pid = box.person.id;
    let role: 'father' | 'mother' | 'child' | 'spouse';
    let childPersonId: string;
    if (pid.startsWith(PLACEHOLDER_PREFIX + 'father_')) {
      role = 'father';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'father_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'mother_')) {
      role = 'mother';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'mother_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'spouse_')) {
      role = 'spouse';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'spouse_').length);
    } else {
      role = 'child';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'child_').length);
    }
    placeholders.push({ type: 'placeholder', role, childPersonId, x: box.x, y: box.y });
    boxes.splice(i, 1);
  }

  // Paths are returned un-split; the Vue template renders solid vs dashed based on
  // the placeholder list. Because placeholder connectors were built separately into
  // `placeholderPaths`, we can split here:
  // - `paths` = solid (between real boxes)
  // - `placeholderLines` stays empty — use `placeholderPaths` via the new `paths` array by prefixing below.
  //
  // To keep the ChartLayout signature stable we concatenate, with a convention:
  // solid paths first, dashed placeholder paths appended. The component distinguishes
  // by index: `paths[0..(paths.length - placeholderPathCount - 1)]` solid. We don't
  // ship that complexity — instead, tag the dashed ones with a sentinel prefix.
  // Simpler: emit all in `paths` and a parallel count via a new field would be a
  // breaking type change. Convention: prefix dashed paths with "D:" so the Vue
  // component can branch on `d.startsWith("D:") ? dashed : solid`.
  for (const d of placeholderPaths) {
    paths.push('D:' + d);
  }

  return {
    boxes,
    lines: [],
    paths,
    svgWidth,
    svgHeight: finalHeight,
    viewBoxMinY,
    collapseButtons,
    placeholders,
    placeholderLines,
  };
}

/** Find a TreePerson by ID in the graph (cycle-safe). */
function findPersonInTree(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  return null;
}
```

Note on the `"D:"` prefix convention: the pedigree Vue component (Task 3) will split `layout.paths` into solid and dashed when rendering. This keeps the existing `ChartLayout` type unchanged so descendant and hourglass can adopt the same convention incrementally.

- [ ] **Step 4: Run the layout tests**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "computePedigreeLayout"
```

Expected: all pedigree tests pass, including the four new ones.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/chart-layout/pedigree.ts tests/unit/chartLayout.test.ts
git commit -m "fix(charts): pedigree dynamic heights + curved connector paths"
```

---

## Task 3: PedigreeChart.vue — render paths, dynamic height, drop shadow

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

**Why:** The layout now emits `paths` and per-box `h`; the component still renders `<line v-for="ln in layout.lines">` and hardcodes `BOX_H` in the placeholder `<rect>` plus the Y-offset helpers for name/date text. We also add the drop shadow the spec calls for (§1 "Additional styling") as a single `<defs><filter>` applied to the `<g>` wrapping each box.

- [ ] **Step 1: Replace the connector block**

In `src/renderer/components/charts/PedigreeChart.vue`, find the block at lines 15-20 (the `<line v-for="(ln, i) in layout.lines">`) and replace it with:

```vue
<path
  v-for="(d, i) in solidPaths"
  :key="'p' + i"
  :d="d"
  fill="none"
  :stroke="chartTokens.line"
  stroke-width="1.5"
  vector-effect="non-scaling-stroke"
/>
```

Then find the placeholder-lines block (around lines 157-163 — `<line v-for="(ln, i) in layout.placeholderLines">`) and replace it with:

```vue
<path
  v-for="(d, i) in dashedPaths"
  :key="'dp' + i"
  :d="d"
  fill="none"
  :stroke="chartTokens.placeholderStroke"
  stroke-width="1"
  stroke-dasharray="4 3"
  vector-effect="non-scaling-stroke"
/>
```

- [ ] **Step 2: Add the path-split computeds**

In the `<script setup>`, after `const layout = computed(…)` (around line 314), add:

```typescript
const solidPaths = computed(() =>
  layout.value.paths.filter(d => !d.startsWith('D:')),
);
const dashedPaths = computed(() =>
  layout.value.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)),
);
```

- [ ] **Step 3: Replace every `BOX_H` in the template with `box.h`**

Update these lines in the box `<g v-for="box in layout.boxes">` block:

- Line ~48-50, portrait bg rect: already uses `BOX_PAD_Y` for y offset — keep unchanged.
- Line ~117: `:cy="box.y + box.h - 9"` (was `box.y + BOX_H - 9`)
- Line ~125: `:y="box.y + box.h - 9"` (was `box.y + BOX_H - 9`)

And in the placeholder `<rect>` block:

- Line ~176: `:height="MIN_BOX_H"` (was `:height="BOX_H"`)
- Line ~181 and ~185: `:y="ph.y + MIN_BOX_H / 2 - 6"` and `:y="ph.y + MIN_BOX_H / 2 + 12"` (were `BOX_H / 2`)

Update the imports on line 231 to export `MIN_BOX_H` instead of `BOX_H`:

```typescript
import { computePedigreeLayout, BOX_W, MIN_BOX_H, H_GAP, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, BOX_PAD_Y, PORTRAIT_GAP, TEXT_AREA_W } from '../../utils/chart-layout';
```

And fix the `generationOf` helper at line 267:

```typescript
function generationOf(box: BoxLayout): number {
  return Math.round((box.x - PAD) / (BOX_W + H_GAP));
}
```

(No change needed — it already uses `BOX_W` not `BOX_H`.)

- [ ] **Step 4: Add drop-shadow filter**

Inside the `<svg>` element, as the first child (right after the opening `<svg ...>`), add:

```vue
<defs>
  <filter id="chart-shadow" x="-3%" y="-6%" width="106%" height="116%">
    <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.06" />
  </filter>
</defs>
```

Then on the person-box group wrapper (line 23-37, the `<g ...>` that wraps each box), add `filter="url(#chart-shadow)"`:

```vue
<g
  v-for="box in layout.boxes"
  :key="box.person.id"
  :data-testid="'person-box-' + box.person.id"
  filter="url(#chart-shadow)"
  :class="['person-box', { clickable: !readonly, focused: focusedBoxId === box.person.id }]"
  ...
>
```

- [ ] **Step 5: Launch the app and verify visually**

```bash
npm start
```

In another window, check the app via MCP (navigate to `/visualisering/<personId>`) or directly in the running window:

- Multi-line names fit inside their boxes (no birth/death line overflowing the rounded bottom edge).
- Connectors between parent/child boxes curve with rounded corners (12 px radius).
- Every box has a subtle drop shadow.
- Placeholder boxes ("+ Add father/mother/child/spouse") render at `MIN_BOX_H` with dashed strokes.
- Photos load — the broken-image glyph is gone. Fallback initials still show for persons without a photo.

Compare with [full-tree-v2.html](../../.superpowers/brainstorm/56955-1776537664/content/full-tree-v2.html).

- [ ] **Step 6: Run full test suite**

```bash
npm run lint
npm test -- --run
```

Expected: 0 lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/charts/PedigreeChart.vue
git commit -m "fix(charts): pedigree renders curved paths, dynamic heights, drop shadow"
```

---

## Task 4: Descendant layout — dynamic heights + curved paths

**Files:**
- Modify: `src/renderer/utils/chart-layout/descendant.ts`
- Modify: `tests/unit/chartLayout.test.ts`

**Why:** Descendant charts are column/generation-based going down. Same goal as pedigree: per-box `h` so text fits, curved paths per parent-child edge instead of three straight segments. Unlike pedigree (leaves along Y), descendants stack by generation depth — so rows are spaced by *max height in that generation*, not a per-node cumulative sum.

- [ ] **Step 1: Add failing tests**

Add to `tests/unit/chartLayout.test.ts` near the existing `computeDescendantLayout` block:

```typescript
describe('computeDescendantLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight', () => {
    const root: DescendantNode = {
      person: {
        id: 'f',
        givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee',
        surname: 'Fffff Ggggg',
        preferredName: null, nickname: null,
        sex: 'M', living: true,
        birthDate: '1940', deathDate: '2010',
        birthPlace: 'Very Long Place', deathPlace: 'Another Place',
        photoUrl: null,
      },
      children: [],
    };
    const layout = computeDescendantLayout(root, 1);
    expect(layout.boxes[0].h).toBeGreaterThan(MIN_BOX_H);
  });

  it('spaces generation rows by the max height in each row', () => {
    const tall: PersonNode = {
      id: 'c1', sex: 'M', living: true,
      givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee', surname: 'Fffff Ggggg',
      preferredName: null, nickname: null,
      birthDate: '1980', deathDate: null,
      birthPlace: 'Very Long Place', deathPlace: null, photoUrl: null,
    };
    const short: PersonNode = { ...tall, id: 'c2', givenName: 'S', surname: 'S', birthDate: null, birthPlace: null };
    const root: DescendantNode = {
      person: { ...short, id: 'f' },
      children: [
        { person: tall, children: [] },
        { person: short, children: [] },
      ],
    };
    const layout = computeDescendantLayout(root, 2);
    // Both children should have the same Y (same row) and row 2's Y should be at or
    // below row 1 bottom + GEN_GAP (using tall's actual height).
    const children = layout.boxes.filter(b => b.person.id !== 'f');
    expect(children[0].y).toBe(children[1].y);
    const focal = layout.boxes.find(b => b.person.id === 'f')!;
    expect(children[0].y).toBeGreaterThanOrEqual(focal.y + focal.h);
  });

  it('emits curved SVG paths instead of lines', () => {
    const root: DescendantNode = {
      person: {
        id: 'f', sex: 'U', living: true,
        givenName: 'F', surname: 'F',
        preferredName: null, nickname: null,
        birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
      },
      children: [
        {
          person: {
            id: 'c', sex: 'U', living: true,
            givenName: 'C', surname: 'C',
            preferredName: null, nickname: null,
            birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
          },
          children: [],
        },
      ],
    };
    const layout = computeDescendantLayout(root, 2);
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) expect(d).toMatch(/^M |^D:M /);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "computeDescendantLayout — dynamic"
```

Expected: FAIL.

- [ ] **Step 3: Rewrite `descendant.ts`**

Key changes to apply:

1. Import `MIN_BOX_H`, `measureBoxHeight`, `curvedElbow`; drop `BOX_H`.
2. Pre-measure heights into a `Map<string, number>` (same pattern as pedigree).
3. `rowY(depth)` becomes array-based: precompute `rowTopY: number[]` where `rowTopY[0] = PAD` and `rowTopY[d] = rowTopY[d-1] + maxH[d-1] + GEN_GAP`, with `maxH[d] = Math.max(MIN_BOX_H, ...heights of all boxes that land at depth d)`. Compute by doing a pre-pass traversal to collect depths.
4. `place()` pushes each box with `h: hOf(node)` and `y: rowTopY[depth]`.
5. Replace every `lines.push({ x1, y1, x2, y2 })` with `paths.push(curvedElbow(...))` — for the parent-to-midpoint segment and per-child drops, use a single `curvedElbow(parentCX, parentBottomY, childCX, childTopY, 'down')` per child.
6. Placeholder outline connectors go into `paths` prefixed with `'D:'`.
7. Return `{ boxes, lines: [], paths, ... }`.

Replace the file body (preserving the top-of-file header comment and imports block updates). Starting from the file's top:

```typescript
// Standalone descendant chart layout algorithm — operates on TreePerson graph.
// Focal at top, descendants fan out downward. Supports outline injection.

import type { DescendantNode, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, MIN_BOX_H, V_GAP, GEN_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
import { buildDescendantTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

export function computeDescendantLayout(
  root: DescendantNode,
  maxGenerations: number,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  const tp = buildDescendantTreePerson(root);
  if (selectedPersonId) injectOutlines(tp, selectedPersonId);

  // ── Pre-measure heights ──────────────────────────────────────────────────
  const heightOf = new Map<string, number>();
  function measureAll(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    heightOf.set(node.person.id, node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person));
    for (const c of node.children) measureAll(c, visited);
    for (const p of node.parents) measureAll(p, visited);
    for (const s of node.spouses) measureAll(s, visited);
  }
  measureAll(tp);
  const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;

  // ── Outline extents (unchanged logic, BOX_W-based) ───────────────────────
  const extraRightExtent = new Map<string, number>();
  const extraLeftExtent = new Map<string, number>();
  if (selectedPersonId) {
    const target = findPersonInTree(tp, selectedPersonId);
    if (target) {
      const spouseCount = target.spouses.filter(s => s.isPlaceholder).length;
      if (spouseCount > 0) {
        const extra = spouseCount * (BOX_W + V_GAP);
        if (target.person.sex === 'F') extraLeftExtent.set(selectedPersonId, extra);
        else extraRightExtent.set(selectedPersonId, extra);
      }
      const parentCount = target.parents.filter(p => p.isPlaceholder).length;
      if (parentCount > 0) {
        const treeParent = findParentOf(tp, selectedPersonId);
        if (treeParent) extraRightExtent.set(treeParent.person.id, parentCount * (BOX_W + V_GAP));
      }
    }
  }

  // ── Collapse filtering ───────────────────────────────────────────────────
  const originalChildCount = new Map<string, number>();
  const hasMoreDown = new Map<string, boolean>();
  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    originalChildCount.set(node.person.id, node.children.length);
    hasMoreDown.set(node.person.id, !!node.hasMoreChildren);
    if (collapsed.has(`${node.person.id}:down`)) {
      node.children = node.children.filter(c => c.isPlaceholder);
    }
    for (const c of node.children) recordAndPrune(c, visited);
  }
  recordAndPrune(tp);

  // ── Compute per-row max height via a depth-traversal pre-pass ────────────
  const rowMaxH: number[] = [];
  function recordDepths(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (depth > maxGenerations) return;
    const h = hOf(node);
    rowMaxH[depth] = Math.max(rowMaxH[depth] ?? MIN_BOX_H, h);
    if (collapsed.has(`${node.person.id}:down`)) return;
    for (const c of node.children) recordDepths(c, depth + 1, visited);
  }
  recordDepths(tp, 0);
  for (let i = 0; i <= maxGenerations; i++) if (rowMaxH[i] == null) rowMaxH[i] = MIN_BOX_H;

  const rowTopY: number[] = [PAD];
  for (let d = 1; d <= maxGenerations; d++) {
    rowTopY[d] = rowTopY[d - 1] + rowMaxH[d - 1] + GEN_GAP;
  }

  const boxes: BoxLayout[] = [];
  const paths: string[] = [];
  const collapseButtons: CollapseButton[] = [];

  // Subtree extents unchanged (horizontal only, uses BOX_W)
  function subtreeExtents(node: TreePerson, depth: number): [number, number] {
    const half = BOX_W / 2;
    const extraR = extraRightExtent.get(node.person.id) ?? 0;
    const extraL = extraLeftExtent.get(node.person.id) ?? 0;
    if (depth >= maxGenerations || node.children.length === 0) return [half + extraL, half + extraR];
    if (collapsed.has(`${node.person.id}:down`)) return [half + extraL, half + extraR];
    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt = Math.max(half, totalSpan / 2 + childExts[0][0]) + extraL;
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]) + extraR;
    return [leftExt, rightExt];
  }

  function place(node: TreePerson, depth: number, cx: number): void {
    const h = hOf(node);
    const y = rowTopY[depth];
    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: cx - BOX_W / 2,
      y,
      w: BOX_W, h,
    });

    const pid = node.person.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(`${pid}:down`);

    if (!pid.startsWith(PLACEHOLDER_PREFIX)) {
      const origChildren = originalChildCount.get(pid) ?? 0;
      const moreDown = hasMoreDown.get(pid) ?? false;
      if (origChildren > 0) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: y + h + 10,
          isExpanded: !isCollapsed, isLoadMore: false,
        });
      } else if (moreDown) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: y + h + 10,
          isExpanded: false, isLoadMore: true,
        });
      }
    }

    if (depth < maxGenerations && hasChildren && !isCollapsed) {
      const n = node.children.length;
      const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
      const offsets: number[] = [0];
      for (let i = 1; i < n; i++) {
        offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
      }
      const totalSpan = offsets[n - 1];
      const leftmostCX = cx - totalSpan / 2;
      const childCXs = offsets.map(o => leftmostCX + o);

      // One curved path per child
      for (let ci = 0; ci < n; ci++) {
        paths.push(curvedElbow(cx, y + h, childCXs[ci], rowTopY[depth + 1], 'down'));
        place(node.children[ci], depth + 1, childCXs[ci]);
      }
    }
  }

  const [leftExt, rightExt] = subtreeExtents(tp, 0);
  const rootCX = PAD + leftExt;
  place(tp, 0, rootCX);

  // ── Unplaced outlines for selected person ────────────────────────────────
  const placeholderPaths: string[] = [];

  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));
    if (selBox) {
      const selNode = findPersonInTree(tp, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selCY = selBox.y + selBox.h / 2;
        const selIsFemale = selNode.person.sex === 'F';

        function findClearXRect(startX: number, y: number, direction: 1 | -1, boxH: number): number {
          let x = startX;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w + V_GAP && x + BOX_W + V_GAP > b.x &&
            y < b.y + b.h && y + boxH > b.y
          );
          while (overlaps()) x += direction * (BOX_W + V_GAP);
          return x;
        }

        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        for (let i = 0; i < unplacedSpouses.length; i++) {
          const sp = unplacedSpouses[i];
          const sh = hOf(sp);
          let spX = selIsFemale
            ? selBox.x - BOX_W - V_GAP - i * (BOX_W + V_GAP)
            : selBox.x + BOX_W + V_GAP + i * (BOX_W + V_GAP);
          spX = findClearXRect(spX, selBox.y, selIsFemale ? -1 : 1, sh);
          const spCX = spX + BOX_W / 2;
          boxes.push({ person: sp.person, isFocal: false, x: spX, y: selBox.y, w: BOX_W, h: sh });
          const spCY = selBox.y + sh / 2;
          // Horizontal curve selected ↔ spouse (dashed)
          const fromX = selIsFemale ? spX + BOX_W : selBox.x + BOX_W;
          const toX = selIsFemale ? selBox.x : spX;
          placeholderPaths.push(
            curvedElbow(fromX, selIsFemale ? spCY : selCY, toX, selIsFemale ? selCY : spCY, 'right'),
          );
        }

        const unplacedParents = selNode.parents.filter(p => !placedIds.has(p.person.id));
        if (unplacedParents.length > 0) {
          const parentRowMax = Math.max(...unplacedParents.map(p => hOf(p)), MIN_BOX_H);
          const parentY = selBox.y - parentRowMax - GEN_GAP;

          const n = unplacedParents.length;
          const groupW = n * BOX_W + (n - 1) * V_GAP;
          const idealGroupX = selCX - groupW / 2;

          function groupOverlaps(gx: number): boolean {
            for (let i = 0; i < n; i++) {
              const bx = gx + i * (BOX_W + V_GAP);
              if (boxes.some(b =>
                bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
                parentY < b.y + b.h && parentY + parentRowMax > b.y
              )) return true;
            }
            return false;
          }

          let groupX = idealGroupX;
          if (groupOverlaps(groupX)) {
            const rowBoxes = boxes
              .filter(b => parentY < b.y + b.h && parentY + parentRowMax > b.y)
              .sort((a, b) => a.x - b.x);
            const candidates: number[] = [idealGroupX];
            for (const b of rowBoxes) {
              candidates.push(b.x + b.w + V_GAP);
              candidates.push(b.x - groupW - V_GAP);
            }
            let bestX: number | null = null;
            let bestDist = Infinity;
            for (const cx of candidates) {
              if (!groupOverlaps(cx)) {
                const dist = Math.abs((cx + groupW / 2) - selCX);
                if (dist < bestDist) { bestDist = dist; bestX = cx; }
              }
            }
            if (bestX !== null) groupX = bestX;
          }

          for (let i = 0; i < n; i++) {
            const px = groupX + i * (BOX_W + V_GAP);
            const ph = hOf(unplacedParents[i]);
            boxes.push({ person: unplacedParents[i].person, isFocal: false, x: px, y: parentY, w: BOX_W, h: ph });
            const parentCX = px + BOX_W / 2;
            placeholderPaths.push(curvedElbow(parentCX, parentY + ph, selCX, selBox.y, 'down'));
          }
        }
      }
    }
  }

  // ── SVG dimensions ───────────────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : MIN_BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;

  const svgWidth = Math.max(rootCX + rightExt + PAD, maxBoxRight + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const svgHeight = (maxBoxBottom + 20 + PAD) + (viewBoxMinY < 0 ? -viewBoxMinY : 0);

  // ── Extract placeholders ─────────────────────────────────────────────────
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];

  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!box.person.id.startsWith(PLACEHOLDER_PREFIX)) continue;
    const pid = box.person.id;
    let role: 'father' | 'mother' | 'child' | 'spouse';
    let childPersonId: string;
    if (pid.startsWith(PLACEHOLDER_PREFIX + 'father_')) {
      role = 'father'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'father_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'mother_')) {
      role = 'mother'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'mother_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'spouse_')) {
      role = 'spouse'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'spouse_').length);
    } else {
      role = 'child'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'child_').length);
    }
    placeholders.push({ type: 'placeholder', role, childPersonId, x: box.x, y: box.y });
    boxes.splice(i, 1);
  }

  for (const d of placeholderPaths) paths.push('D:' + d);

  return { boxes, lines: [], paths, svgWidth, svgHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines };
}

function findParentOf(root: TreePerson, childId: string, visited = new Set<string>()): TreePerson | null {
  if (visited.has(root.person.id)) return null;
  visited.add(root.person.id);
  for (const c of root.children) {
    if (c.person.id === childId) return root;
    const found = findParentOf(c, childId, visited);
    if (found) return found;
  }
  return null;
}

function findPersonInTree(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  return null;
}
```

- [ ] **Step 4: Tests pass**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "computeDescendantLayout"
```

Expected: all descendant tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/chart-layout/descendant.ts tests/unit/chartLayout.test.ts
git commit -m "fix(charts): descendant dynamic heights + curved connector paths"
```

---

## Task 5: DescendantChart.vue — render paths, dynamic height, drop shadow

**Files:**
- Modify: `src/renderer/components/charts/DescendantChart.vue`

**Why:** Same three changes as Task 3 (pedigree): replace `<line>` with `<path>` using the split-by-`D:`-prefix convention, replace every `BOX_H` with `box.h`, add the drop shadow filter.

- [ ] **Step 1: Apply the same template changes as Task 3**

Mirror the Pedigree changes in `DescendantChart.vue`:

1. Replace `<line v-for="(ln, i) in layout.lines">` with the `<path v-for="(d, i) in solidPaths">` block (same markup as Task 3 Step 1).
2. Replace `<line v-for="(ln, i) in layout.placeholderLines">` with the dashed `<path v-for="(d, i) in dashedPaths">` block.
3. Add `solidPaths` / `dashedPaths` computeds in `<script setup>`.
4. Replace every `BOX_H` in the template with `box.h` (grep the file for `BOX_H`). Update the `MIN_BOX_H` in placeholder rects.
5. Update the top-of-file import to bring in `MIN_BOX_H` instead of `BOX_H`.
6. Add `<defs><filter id="chart-shadow">…</filter></defs>` right inside `<svg>` and `filter="url(#chart-shadow)"` on the box `<g>` wrapper.

- [ ] **Step 2: Launch and check visually**

```bash
npm start
```

Navigate to the descendant chart. Verify:
- Dynamic heights fit long names.
- Child-to-parent connectors curve.
- Drop shadow visible.
- No broken images for persons with linked media.

- [ ] **Step 3: Lint + tests**

```bash
npm run lint
npm test -- --run
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/charts/DescendantChart.vue
git commit -m "fix(charts): descendant renders curved paths, dynamic heights, drop shadow"
```

---

## Task 6: Hourglass layout — dynamic heights + curved paths

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`
- Modify: `tests/unit/chartLayout.test.ts`

**Why:** Hourglass is the biggest of the three layout files (~830 lines) because it combines ancestor rows going up with descendant rows going down, plus spouses and siblings on the focal row. Strategy: same as descendant — per-row-max heights, then arrays for ancestor and descendant row Y. Every `BOX_H` becomes per-box `hOf(node)`. Every `lines.push(...)` that represents a connector becomes `paths.push(curvedElbow(...))`.

- [ ] **Step 1: Write the failing tests**

Add to the hourglass section of `tests/unit/chartLayout.test.ts`:

```typescript
describe('computeHourglassLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight', () => {
    const focal: PersonNode = {
      id: 'f',
      givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee',
      surname: 'Fffff Ggggg',
      preferredName: null, nickname: null, sex: 'M', living: true,
      birthDate: '1940', deathDate: '2010',
      birthPlace: 'Very Long Place', deathPlace: null, photoUrl: null,
    };
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: { person: focal, children: [] },
      descendantGenerations: 0,
      spouses: [],
    };
    const layout = computeHourglassLayout(tree);
    expect(layout.boxes[0].h).toBeGreaterThan(MIN_BOX_H);
  });

  it('emits curved SVG paths instead of lines', () => {
    const focal: PersonNode = {
      id: 'f', sex: 'M', living: true,
      givenName: 'F', surname: 'F',
      preferredName: null, nickname: null,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const dad: PersonNode = { ...focal, id: 'd' };
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal], [2, dad]]), generations: 2 },
      descendantRoot: { person: focal, children: [] },
      descendantGenerations: 0,
      spouses: [],
    };
    const layout = computeHourglassLayout(tree);
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) expect(d).toMatch(/^M |^D:M /);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "computeHourglassLayout — dynamic"
```

- [ ] **Step 3: Rewrite `hourglass.ts`**

This is the bulk of the work. The file is too long to inline in this plan; apply these mechanical transformations to the existing code:

1. **Imports:** add `MIN_BOX_H, measureBoxHeight, curvedElbow`; keep the rest; drop the `BOX_H` import.

```typescript
import { BOX_W, MIN_BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
```

2. **Pre-measure heights** right after `buildHourglassTree(...)` and `injectOutlines(...)` — before any geometry:

```typescript
const heightOf = new Map<string, number>();
function measureAll(node: TreePerson, visited = new Set<string>()): void {
  if (visited.has(node.person.id)) return;
  visited.add(node.person.id);
  heightOf.set(node.person.id, node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person));
  for (const p of node.parents) measureAll(p, visited);
  for (const c of node.children) measureAll(c, visited);
  for (const s of node.spouses) measureAll(s, visited);
}
measureAll(root);
const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;
```

3. **Per-row max heights and cumulative Y arrays.** Replace `focalRowY`, `ancestorRowY(depth)`, `descRowY(depth)` with array lookups. Add after `maxAncestorDepth`/`maxDescDepth` computation:

```typescript
const A = maxAncestorDepth(root);
const D = maxDescDepth(root);

// Walk the tree to collect per-depth max heights.
const ancRowMaxH: number[] = new Array(A + 1).fill(MIN_BOX_H);
const descRowMaxH: number[] = new Array(D + 1).fill(MIN_BOX_H);

function collectAncestorHeights(node: TreePerson, depth: number, visited = new Set<string>()): void {
  if (visited.has(node.person.id)) return;
  visited.add(node.person.id);
  ancRowMaxH[depth] = Math.max(ancRowMaxH[depth], hOf(node));
  for (const p of node.parents) if (!p.isPlaceholder) collectAncestorHeights(p, depth + 1, visited);
}
function collectDescHeights(node: TreePerson, depth: number, visited = new Set<string>()): void {
  if (visited.has(node.person.id)) return;
  visited.add(node.person.id);
  if (depth > 0) descRowMaxH[depth] = Math.max(descRowMaxH[depth], hOf(node));
  for (const c of node.children) if (!c.isPlaceholder) collectDescHeights(c, depth + 1, visited);
}
collectAncestorHeights(root, 0);
collectDescHeights(root, 0);

const focalRowH = Math.max(ancRowMaxH[0], descRowMaxH[0], MIN_BOX_H);

// Top-Y of each ancestor row (going up from focal). Focal row top = ancestorTopPad + sum of (anc row h + GEN_GAP) for depths 1..A.
const ancestorTopPad = PAD + 8;
const ancestorRowTopY: number[] = new Array(A + 1);
// Compute focalRowY first:
let aboveSum = 0;
for (let d = 1; d <= A; d++) aboveSum += ancRowMaxH[d] + GEN_GAP;
const focalRowY = ancestorTopPad + aboveSum;
ancestorRowTopY[0] = focalRowY;
for (let d = 1; d <= A; d++) {
  ancestorRowTopY[d] = ancestorRowTopY[d - 1] - GEN_GAP - ancRowMaxH[d];
}

const descendantRowTopY: number[] = new Array(D + 1);
descendantRowTopY[0] = focalRowY;
for (let d = 1; d <= D; d++) {
  descendantRowTopY[d] = descendantRowTopY[d - 1] + (d === 1 ? focalRowH : descRowMaxH[d - 1]) + GEN_GAP;
}

const ancestorRowY = (depth: number) => ancestorRowTopY[depth];
const descRowY = (depth: number) => descendantRowTopY[depth];
```

4. **Box pushes** — every `boxes.push({ ..., w: BOX_W, h: BOX_H })` becomes `h: hOf(node)` (or `h: MIN_BOX_H` for the rare anonymous placeholder insertion where no TreePerson is on hand — usually `hOf` works since we measured all nodes in the tree). Every `box.y + BOX_H` becomes `box.y + box.h`. Every `BOX_H / 2` becomes `box.h / 2` (when you have the box) or `focalRowH / 2` for focal-row calculations.

5. **Lines → paths.** Every `lines.push(...)` that represents a visible connector (not an outline-stretch helper) becomes `paths.push(curvedElbow(fromX, fromY, toX, toY, direction))`:

- Parent → child fork from ancestor section (`direction: 'down'` if fork flows downward to the focal/intermediate node, check the existing sign of `forkY - nodeY`).
- Focal → spouse (horizontal) — `curvedElbow(fromX, fromY, toX, toY, 'right')` with same Y means a straight line returned by `curvedElbow`.
- Focal → child fork → child (`direction: 'down'`).

For outline/placeholder connectors, keep them in a `placeholderPaths: string[]` and append with `'D:' +` prefix at the end, same as pedigree/descendant.

6. **Final return**

```typescript
for (const d of placeholderPaths) paths.push('D:' + d);
return { boxes, lines: [], paths, svgWidth, svgHeight, viewBoxMinY: 0, collapseButtons, placeholders, placeholderLines: [] };
```

7. **svgHeight.** Replace `svgHeight = Math.max(deepestDescRow + BOX_H + 20 + PAD, maxBoxBottom + 20 + PAD)` with:

```typescript
const svgHeight = Math.max(descendantRowTopY[D] + descRowMaxH[D] + 20 + PAD, maxBoxBottom + 20 + PAD);
```

(Because `descendantRowTopY[D]` is row top and `descRowMaxH[D]` is the row's box height.)

8. **Outline Pass 4 / collision avoidance.** Every `+ BOX_H` becomes `+ boxH` where `boxH` is the outline node's measured `hOf(...)`. Every overlap check `y < b.y + b.h && y + BOX_H > b.y` becomes `y < b.y + b.h && y + outlineH > b.y` where `outlineH = hOf(outlineNode)` or `MIN_BOX_H` if unknown.

- [ ] **Step 4: Tests pass**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t "computeHourglassLayout"
```

Expected: all hourglass tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/chart-layout/hourglass.ts tests/unit/chartLayout.test.ts
git commit -m "fix(charts): hourglass dynamic heights + curved connector paths"
```

---

## Task 7: HourglassChart.vue — render paths, dynamic height, drop shadow

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

**Why:** Mirrors Task 3 (pedigree) and Task 5 (descendant). Same three edits.

- [ ] **Step 1: Apply the Task 3 template changes to HourglassChart.vue**

1. Replace `<line v-for="(ln, i) in layout.lines">` block with the `<path v-for="(d, i) in solidPaths">` block.
2. Replace `<line v-for="(ln, i) in layout.placeholderLines">` with the dashed `<path v-for="(d, i) in dashedPaths">` block.
3. Add `solidPaths` / `dashedPaths` computeds.
4. Replace every `BOX_H` in the template with `box.h`. Update placeholder `<rect :height="MIN_BOX_H">`.
5. Update imports to bring in `MIN_BOX_H` instead of `BOX_H`.
6. Add `<defs><filter id="chart-shadow">…</filter></defs>` and `filter="url(#chart-shadow)"` on the box `<g>`.

- [ ] **Step 2: Launch + visual check**

```bash
npm start
```

Navigate to `/visualisering/<personId>` → Timglas tab. Verify:
- Ancestor rows above focal fit long names.
- Descendant rows below focal fit long names.
- All connectors curve.
- Drop shadow visible.
- Photos load.

- [ ] **Step 3: Lint + tests + commit**

```bash
npm run lint
npm test -- --run
git add src/renderer/components/charts/HourglassChart.vue
git commit -m "fix(charts): hourglass renders curved paths, dynamic heights, drop shadow"
```

---

## Task 8: Cleanup — remove `BOX_H` shim; tooltip place; placeholder constants

**Files:**
- Modify: `src/renderer/utils/chart-layout/constants.ts`
- Modify: `src/renderer/utils/chart-layout/index.ts`
- Modify: `src/renderer/components/charts/ChartTooltip.vue`
- Modify: tests if any still reference `BOX_H`

**Why:** With all three layouts and three Vue components converted, the `BOX_H = MIN_BOX_H` deprecated alias has no callers and can go. The spec §9 also calls for the tooltip to show birth/death place alongside the date; since `PersonNode.birthPlace/deathPlace` are already fetched, that's a three-line template addition.

- [ ] **Step 1: Grep for remaining `BOX_H` references**

```bash
grep -rn "BOX_H" src/renderer/ tests/
```

Expected: zero matches (or only matches inside comments/strings). If any code reference remains, fix it to use `MIN_BOX_H` or a per-box `h`.

- [ ] **Step 2: Remove the shim from `constants.ts`**

Delete lines 5-6 of `src/renderer/utils/chart-layout/constants.ts`:

```typescript
/** @deprecated Use MIN_BOX_H — box height is now dynamic per node. */
export const BOX_H = MIN_BOX_H;
```

Also delete line 11 if it still references the shim:

```typescript
export const ROW_H = MIN_BOX_H + V_GAP;  // delete if still present
```

Update `src/renderer/utils/chart-layout/index.ts` if it re-exports `BOX_H` — remove that export.

- [ ] **Step 3: Tooltip shows places**

Open `src/renderer/components/charts/ChartTooltip.vue`. Find the birth/death date rendering block. Extend each to include the place:

```vue
<div v-if="person.birthDate || person.birthPlace">
  * {{ [person.birthDate, person.birthPlace].filter(Boolean).join(' ') }}
</div>
<div v-if="person.deathDate || person.deathPlace">
  † {{ [person.deathDate, person.deathPlace].filter(Boolean).join(' ') }}
</div>
```

Match the existing indentation and i18n conventions in the file (the exact surrounding markup varies; don't introduce new root elements).

- [ ] **Step 4: Lint + full tests + visual check**

```bash
npm run lint
npm test -- --run
npm start
```

- Tooltip now shows "* 1938 Malmö" / "† 2014 Lund" format.
- All three charts still render.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/chart-layout/constants.ts src/renderer/utils/chart-layout/index.ts src/renderer/components/charts/ChartTooltip.vue
git commit -m "chore(charts): drop BOX_H shim; tooltip shows birth/death places"
```

---

## Task 9: Version bump + roadmap entry

**Files:**
- Modify: `package.json`
- Modify: `docs/PLAN.md`

**Why:** Per CLAUDE.md conventions: substantive visible behavior change = minor bump. The v0.111.0 entry in PLAN.md currently claims "box redesign for pedigree/hourglass/descendant" which was misleading (infrastructure only). Add a new v0.112.0 entry that accurately describes the delivered behavior.

- [ ] **Step 1: Bump version**

Edit `package.json`. Change the `"version"` field from `"0.111.2"` (or whatever the current patch is) to `"0.112.0"`.

- [ ] **Step 2: Roadmap**

Open `docs/PLAN.md`. Find the Done section around line 195. Add a new row directly above v0.111.0:

```markdown
| v0.112.0 | Finish chart visual overhaul: photos render (data URLs), curved elbow connectors, dynamic box heights so long names + places fit | [archive](plans/archive/2026-04-18-chart-visual-overhaul-fixes.md) |
```

- [ ] **Step 3: Archive this plan**

```bash
git mv docs/plans/2026-04-18-chart-visual-overhaul-fixes.md docs/plans/archive/
```

- [ ] **Step 4: Final lint + test run**

```bash
npm run lint
npm test -- --run
npx playwright test tests/e2e/app.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/PLAN.md docs/plans/archive/2026-04-18-chart-visual-overhaul-fixes.md
git commit -m "feat: finish chart visual overhaul (v0.112.0)"
```

---

## Verification matrix — run before declaring done

| Issue reported | How to verify |
|----------------|---------------|
| Images broken | Open Visualization > Stamtavla for a person whose first media is a photo. Portrait area shows the actual image, not the broken-image glyph. |
| Connectors not rounded | Zoom into any generation junction. The elbow between child and parent has a visible curve (~12 px radius), not a sharp right angle. |
| Text doesn't fit | Pick a person with a long name (e.g. "Alfrida Frida Maria Carlsson, gift Persson" in the live DB). Box grows vertically; birth/death lines stay inside the rounded bottom edge. |
| Drop shadow | Boxes have a faint shadow offset downward by ~1 px. |
| All three charts | Repeat for Pedigree (Stamtavla), Descendant (Efterkommande), Hourglass (Timglas). |

Compare the final Pedigree rendering side-by-side with [full-tree-v2.html](../../.superpowers/brainstorm/56955-1776537664/content/full-tree-v2.html).

---

## Notes for the implementing agent

- **Always read the file first.** Each `pedigree.ts` / `descendant.ts` / `hourglass.ts` has outline-placement code that is tuned to specific scenarios (female focal, placeholder insertion, collision avoidance). Don't remove any `if` branches — change only the height and connector-path emissions.
- **Don't remove `lines: Line[]` from the returned `ChartLayout`.** The type still requires it; return an empty array `lines: []`.
- **The `D:` prefix convention is a local implementation detail.** Don't touch `types.ts`. Each chart component parses it.
- **SQLite / node-sqlite3-wasm:** not relevant here — pure renderer code.
- **Screenshots from MCP:** the dev MCP server exposes `chart_screenshot_person` but it's `not yet implemented`. Use `ui_screenshot` after navigating + zooming.
- **If a layout test fails because a `PersonNode` is missing new fields (`birthPlace`, `deathPlace`, `photoUrl`), fix the test fixture — don't add null-coalescing in the layout.** These fields are required on `PersonNode` (non-optional).
