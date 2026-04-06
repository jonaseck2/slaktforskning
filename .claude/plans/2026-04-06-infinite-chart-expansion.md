# Infinite Chart Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pedigree and hourglass charts infinitely expandable by lazy-loading one ancestor/descendant generation per click, plus fix the pedigree collapse arrow to point right (▶).

**Architecture:** Add optional `hasMoreAncestors`/`hasMoreChildren` flags to tree data structures, populated at fetch time by checking one extra relationship query per leaf. The layout layer reads these to emit `isLoadMore: true` buttons. Component click handlers branch on `isLoadMore` to either toggle visibility (existing) or fetch+merge a new generation (new).

**Tech Stack:** TypeScript, Vue 3 Composition API, Vitest (unit tests on pure layout functions), node-sqlite3-wasm via window.api IPC.

---

## File Map

| File | Role |
|------|------|
| `src/renderer/utils/chartLayout.ts` | Types + pure layout algorithms — add `hasMoreAncestors?`, `hasMoreChildren?`, `isLoadMore?`, `maxDescendantDepth()`; fix pedigree direction; emit load-more buttons |
| `src/renderer/utils/chartData.ts` | Fetch + load functions — pre-check hasMore at leaf generation; add `loadAncestorGeneration`, `loadChildrenForNode` |
| `src/renderer/components/charts/PedigreeChart.vue` | Add `personToAhnen` computed; add async `handleCollapseButton`; update template |
| `src/renderer/components/charts/HourglassChart.vue` | Add `ancestorPersonToAhnen` computed; add async `handleCollapseButton`; update template |
| `tests/unit/chartLayout.test.ts` | Update pedigree direction tests; add load-more button tests |

---

## Task 1: Update type interfaces in chartLayout.ts

**Files:**
- Modify: `src/renderer/utils/chartLayout.ts:39-82`

- [ ] **Step 1: Add `isLoadMore?` to `CollapseButton`, `hasMoreAncestors?` to `PedigreeTree`, `hasMoreChildren?` to `DescendantNode`, and export `maxDescendantDepth`**

Replace lines 39–82 in `src/renderer/utils/chartLayout.ts` with:

```typescript
export interface CollapseButton {
  personId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  cx: number;
  cy: number;
  isExpanded: boolean;
  isLoadMore?: boolean; // true → click fetches new data; false/absent → toggles visibility
}

export interface ChartLayout {
  boxes: BoxLayout[];
  lines: Line[];
  svgWidth: number;
  svgHeight: number;
  collapseButtons: CollapseButton[];
}

/**
 * Ahnentafel-indexed ancestor tree.
 * Key 1 = focal, 2 = father, 3 = mother, 4 = pat.grandfather, …
 * `generations` includes focal (e.g. 5 = focal + 4 ancestor levels).
 * `hasMoreAncestors`: ahnentafel keys where parents exist in DB but are not loaded.
 */
export interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
  hasMoreAncestors?: Set<number>;
}

/** Recursive descendant tree node. */
export interface DescendantNode {
  person: PersonNode;
  children: DescendantNode[];
  hasMoreChildren?: boolean; // children exist in DB but not loaded (meaningful at max depth)
}

/**
 * Hourglass tree: ancestor section (ahnentafel) above focal,
 * descendant tree below, and spouses displayed to the right of focal.
 * `ancestors.generations` = focal + ancestor levels shown above.
 * `descendantGenerations` = levels below focal.
 */
export interface HourglassTree {
  ancestors: PedigreeTree;
  descendantRoot: DescendantNode;
  descendantGenerations: number;
  spouses: PersonNode[];
}

/**
 * Returns the actual maximum depth of a descendant tree (0 = focal only).
 * Used after loadChildrenForNode to update HourglassTree.descendantGenerations.
 */
export function maxDescendantDepth(node: DescendantNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map(c => maxDescendantDepth(c, depth + 1)));
}
```

- [ ] **Step 2: Run tests — all existing tests should still pass (optional fields are backward-compatible)**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|chartLayout)"
```

Expected: all chartLayout tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/chartLayout.ts
git commit -m "feat(charts): add hasMoreAncestors/hasMoreChildren/isLoadMore types + maxDescendantDepth"
```

---

## Task 2: Update `computePedigreeLayout` — direction fix + load-more buttons

**Files:**
- Modify: `src/renderer/utils/chartLayout.ts` (pruning block + collapse button block)
- Modify: `tests/unit/chartLayout.test.ts` (update 4 direction tests, add 2 load-more tests)

### Step 2a: Update tests to expect 'right' and add load-more tests

- [ ] **Step 1: Update existing direction tests from 'up' to 'right'**

In `tests/unit/chartLayout.test.ts`, replace the entire `describe('collapse — computePedigreeLayout', ...)` block (lines 184–226) with:

```typescript
describe('collapse — computePedigreeLayout', () => {
  it('returns no collapseButtons when no one has parents', () => {
    const { collapseButtons } = computePedigreeLayout(pedigree3(p('f')));
    expect(collapseButtons).toHaveLength(0);
  });

  it('focal gets a collapse button when parents exist, direction right', () => {
    const { collapseButtons } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), null]));
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('right');
    expect(btn!.isExpanded).toBe(true);
    expect(btn!.isLoadMore).toBeFalsy();
  });

  it('collapsing focal:right removes parent boxes but keeps focal', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')]);
    const { boxes } = computePedigreeLayout(tree, new Set(['f:right']));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].person.id).toBe('f');
  });

  it('collapsing parent:right removes grandparent boxes', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), null, null]);
    const { boxes } = computePedigreeLayout(tree, new Set(['p0:right']));
    expect(boxes.find(b => b.person.id === 'gp0')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'gp1')).toBeUndefined();
    expect(boxes).toHaveLength(3);
  });

  it('collapsed node still shows its own box', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')]);
    const { boxes } = computePedigreeLayout(tree, new Set(['f:right']));
    expect(boxes.some(b => b.person.id === 'f')).toBe(true);
  });

  it('button isExpanded=false when branch is collapsed', () => {
    const tree = pedigree3(p('f'), [p('p0'), null]);
    const { collapseButtons } = computePedigreeLayout(tree, new Set(['f:right']));
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn!.isExpanded).toBe(false);
  });

  it('generates load-more button (isLoadMore=true) for leaf with hasMoreAncestors', () => {
    const tree: PedigreeTree = {
      nodes: new Map([[1, p('f')], [2, p('par')]]),
      generations: 3,
      hasMoreAncestors: new Set([2]),
    };
    const { collapseButtons } = computePedigreeLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('right');
    expect(btn!.isExpanded).toBe(false);
  });

  it('does not generate load-more when parent is already loaded (collapse takes priority)', () => {
    const tree: PedigreeTree = {
      nodes: new Map([[1, p('f')], [2, p('par')], [4, p('gp')]]),
      generations: 3,
      hasMoreAncestors: new Set([2]),
    };
    const { collapseButtons } = computePedigreeLayout(tree);
    // par has a loaded parent (gp at k=4), so gets a collapse button, not load-more
    const loadMoreBtn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(loadMoreBtn).toBeUndefined();
    const collapseBtn = collapseButtons.find(b => b.personId === 'par' && !b.isLoadMore);
    expect(collapseBtn).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests — pedigree collapse tests should fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|collapse.*pedigree|right|up)"
```

Expected: 4–6 failures in `collapse — computePedigreeLayout` (direction mismatch).

### Step 2b: Implement direction fix + load-more in `computePedigreeLayout`

- [ ] **Step 3: Fix the pruning block (line ~151) — change `':up'` to `':right'`**

In `src/renderer/utils/chartLayout.ts`, in `computePedigreeLayout`, replace:

```typescript
  const prunedNodes = new Map(originalNodes);
  for (const [k, person] of originalNodes) {
    if (collapsed.has(`${person.id}:up`)) {
      removeSubtree(prunedNodes, k * 2);
      removeSubtree(prunedNodes, k * 2 + 1);
    }
  }
```

with:

```typescript
  const prunedNodes = new Map(originalNodes);
  for (const [k, person] of originalNodes) {
    if (collapsed.has(`${person.id}:right`)) {
      removeSubtree(prunedNodes, k * 2);
      removeSubtree(prunedNodes, k * 2 + 1);
    }
  }
```

- [ ] **Step 4: Fix the collapse button block — direction + add load-more branch**

In `src/renderer/utils/chartLayout.ts`, in `computePedigreeLayout`, replace:

```typescript
  // Generate collapse buttons: ↑ button on right side of each box with parents in original tree
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k === undefined) continue;
    const hasParents = originalNodes.has(k * 2) || originalNodes.has(k * 2 + 1);
    if (hasParents) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'up',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: !collapsed.has(`${box.person.id}:up`),
      });
    }
  }
```

with:

```typescript
  // Generate collapse/load-more buttons on right side of each box.
  // Ancestors expand rightward in pedigree, so direction is 'right' (▶).
  const hasMore = tree.hasMoreAncestors ?? new Set<number>();
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k === undefined) continue;
    const hasParents = originalNodes.has(k * 2) || originalNodes.has(k * 2 + 1);
    if (hasParents) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: !collapsed.has(`${box.person.id}:right`),
        isLoadMore: false,
      });
    } else if (hasMore.has(k)) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: false,
        isLoadMore: true,
      });
    }
  }
```

- [ ] **Step 5: Run tests — all pedigree collapse tests should pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×)"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/chartLayout.ts tests/unit/chartLayout.test.ts
git commit -m "feat(charts): pedigree collapse direction right + load-more buttons"
```

---

## Task 3: Update `computeHourglassLayout` — load-more buttons

**Files:**
- Modify: `src/renderer/utils/chartLayout.ts` (collapse button block in computeHourglassLayout)
- Modify: `tests/unit/chartLayout.test.ts` (add load-more tests for hourglass)

- [ ] **Step 1: Add load-more tests for hourglass to `tests/unit/chartLayout.test.ts`**

Append after the last `describe` block (before the closing of the file):

```typescript
describe('load-more buttons', () => {
  it('hourglass ancestor leaf with hasMoreAncestors gets a load-more up button', () => {
    const f = p('f');
    const par = p('par');
    const tree: HourglassTree = {
      ancestors: {
        nodes: new Map([[1, f], [2, par]]),
        generations: 3,
        hasMoreAncestors: new Set([2]),
      },
      descendantRoot: { person: f, children: [] },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('up');
    expect(btn!.isExpanded).toBe(false);
  });

  it('hourglass ancestor with loaded parents gets collapse button, not load-more', () => {
    const f = p('f');
    const par = p('par');
    const gp = p('gp');
    const tree: HourglassTree = {
      ancestors: {
        nodes: new Map([[1, f], [2, par], [4, gp]]),
        generations: 3,
        hasMoreAncestors: new Set([2]),
      },
      descendantRoot: { person: f, children: [] },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const loadMoreBtn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(loadMoreBtn).toBeUndefined();
    const collapseBtn = collapseButtons.find(b => b.personId === 'par' && !b.isLoadMore);
    expect(collapseBtn).toBeDefined();
  });

  it('hourglass descendant leaf with hasMoreChildren gets a load-more down button', () => {
    const f = p('f');
    const c = p('c');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 1 },
      descendantRoot: {
        person: f,
        children: [{ person: c, children: [], hasMoreChildren: true }],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'c' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
  });

  it('hourglass descendant leaf without hasMoreChildren gets no button', () => {
    const f = p('f');
    const c = p('c');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 1 },
      descendantRoot: {
        person: f,
        children: [{ person: c, children: [], hasMoreChildren: false }],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    expect(collapseButtons.find(b => b.personId === 'c')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — new load-more tests should fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "load-more"
```

Expected: 3–4 failures in `load-more buttons`.

- [ ] **Step 3: Update `computeHourglassLayout` collapse button block**

In `src/renderer/utils/chartLayout.ts`, replace everything from the comment `// Index all descendant nodes for button generation` through `return { boxes, lines, svgWidth, svgHeight, collapseButtons };` (the last line of the function):

```typescript
  // Index all descendant nodes for button generation
  const descNodeMap = new Map<string, DescendantNode>();
  function indexDescendants(node: DescendantNode): void {
    descNodeMap.set(node.person.id, node);
    for (const child of node.children) indexDescendants(child);
  }
  indexDescendants(descendantRoot);

  const ancestorHasMore = tree.ancestors.hasMoreAncestors ?? new Set<number>();
  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k !== undefined) {
      // Ancestor or focal box
      if (k === 1) {
        // Focal: ↓ for children, → or ← for spouses
        if (descendantRoot.children.length > 0) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: !collapsed.has(`${box.person.id}:down`),
            isLoadMore: false,
          });
        }
        if (spouses.length > 0) {
          const spouseDir = focalIsFemale ? 'left' : 'right';
          const spouseBtnCX = focalIsFemale ? box.x - 10 : box.x + BOX_W + 10;
          collapseButtons.push({
            personId: box.person.id, direction: spouseDir,
            cx: spouseBtnCX, cy: box.y + BOX_H / 2,
            isExpanded: !collapsed.has(`${box.person.id}:right`) && !collapsed.has(`${box.person.id}:left`),
            isLoadMore: false,
          });
        }
      } else {
        // Ancestor: ↑ if parents exist in original tree, or load-more if hasMoreAncestors
        const hasParents = originalAncestorNodes.has(k * 2) || originalAncestorNodes.has(k * 2 + 1);
        if (hasParents) {
          collapseButtons.push({
            personId: box.person.id, direction: 'up',
            cx: box.x + BOX_W / 2, cy: box.y - 10,
            isExpanded: !collapsed.has(`${box.person.id}:up`),
            isLoadMore: false,
          });
        } else if (ancestorHasMore.has(k)) {
          collapseButtons.push({
            personId: box.person.id, direction: 'up',
            cx: box.x + BOX_W / 2, cy: box.y - 10,
            isExpanded: false,
            isLoadMore: true,
          });
        }
      }
    } else {
      // Descendant box
      const descNode = descNodeMap.get(box.person.id);
      if (descNode) {
        if (descNode.children.length > 0) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: !collapsed.has(`${box.person.id}:down`),
            isLoadMore: false,
          });
        } else if (descNode.hasMoreChildren) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: false,
            isLoadMore: true,
          });
        }
      }
    }
  }

  return { boxes, lines, svgWidth, svgHeight, collapseButtons };
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×)"
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/chartLayout.ts tests/unit/chartLayout.test.ts
git commit -m "feat(charts): hourglass load-more buttons for ancestors and descendants"
```

---

## Task 4: Update `fetchPedigreeTree` — `hasMoreAncestors` pre-check

**Files:**
- Modify: `src/renderer/utils/chartData.ts:43-80`

- [ ] **Step 1: Replace `fetchPedigreeTree`**

In `src/renderer/utils/chartData.ts`, replace the entire `fetchPedigreeTree` function (lines 43–80):

```typescript
/**
 * Fetch an ahnentafel ancestor tree up to `generations` levels (including focal).
 * Default: 5 generations (focal + 4 ancestor levels = up to 16 great-great-grandparents).
 * At the deepest generation, also checks for parents to populate hasMoreAncestors.
 */
export async function fetchPedigreeTree(focalId: string, generations = 5): Promise<PedigreeTree> {
  const nodes = new Map<number, PersonNode>();
  const hasMoreAncestors = new Set<number>();

  async function fetchAncestors(personId: string, ahnNum: number, gen: number): Promise<void> {
    if (gen < generations) {
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId),
      ]) as [PersonNode, RawRel[]];

      nodes.set(ahnNum, node);

      let parentIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null)
        .slice(0, 2);

      // Sort parents: male (M) gets even ahnentafel (left/father slot),
      // female (F) gets odd (right/mother slot). Fetch sex for both before assigning.
      if (parentIds.length === 2) {
        const sexes = await Promise.all(
          parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
        );
        if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
          parentIds = [parentIds[1], parentIds[0]];
        }
      }

      await Promise.all(parentIds.map((pid, i) => fetchAncestors(pid, ahnNum * 2 + i, gen + 1)));
    } else {
      // Deepest generation: fetch node + check if parents exist in DB.
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId),
      ]) as [PersonNode, RawRel[]];
      nodes.set(ahnNum, node);
      const parentCount = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId && r.person1_id !== null)
        .length;
      if (parentCount > 0) hasMoreAncestors.add(ahnNum);
    }
  }

  await fetchAncestors(focalId, 1, 1);
  return { nodes, generations, hasMoreAncestors };
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all tests pass (no unit tests cover chartData directly; existing E2E tests cover integration).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/chartData.ts
git commit -m "feat(charts): fetchPedigreeTree populates hasMoreAncestors at leaf generation"
```

---

## Task 5: Update `fetchDescendantTree` — `hasMoreChildren` pre-check

**Files:**
- Modify: `src/renderer/utils/chartData.ts:85-108`

- [ ] **Step 1: Replace `fetchDescendantTree`**

In `src/renderer/utils/chartData.ts`, replace the entire `fetchDescendantTree` function (lines 85–108):

```typescript
/**
 * Fetch a descendant tree up to `maxDepth` levels below the given person.
 * At the deepest generation, also checks for children to populate hasMoreChildren.
 */
async function fetchDescendantTree(
  personId: string,
  depth: number,
  maxDepth: number,
): Promise<DescendantNode> {
  if (depth < maxDepth) {
    const [node, rawRels] = await Promise.all([
      fetchPersonNode(personId),
      window.api.relationships.getForPerson(personId),
    ]) as [PersonNode, RawRel[]];

    const childIds = rawRels
      .filter(r => r.type === 'parent_child' && r.person1_id === personId)
      .map(r => r.person2_id)
      .filter((id): id is string => id !== null);

    const children = await Promise.all(
      childIds.map(id => fetchDescendantTree(id, depth + 1, maxDepth)),
    );
    return { person: node, children, hasMoreChildren: false };
  } else {
    // Deepest generation: fetch node + check if children exist in DB.
    const [node, rawRels] = await Promise.all([
      fetchPersonNode(personId),
      window.api.relationships.getForPerson(personId),
    ]) as [PersonNode, RawRel[]];
    const hasMoreChildren = rawRels.some(
      r => r.type === 'parent_child' && r.person1_id === personId && r.person2_id !== null,
    );
    return { person: node, children: [], hasMoreChildren };
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/chartData.ts
git commit -m "feat(charts): fetchDescendantTree sets hasMoreChildren at leaf generation"
```

---

## Task 6: Add `loadAncestorGeneration` to chartData.ts

**Files:**
- Modify: `src/renderer/utils/chartData.ts` (add export after `fetchPedigreeTree`)

- [ ] **Step 1: Add `loadAncestorGeneration` export**

After the closing brace of `fetchPedigreeTree` and before `fetchDescendantTree`, insert:

```typescript
/**
 * Load one generation of ancestors for the person at the given ahnentafel key.
 * Fetches their parents, checks if THOSE parents have further ancestors,
 * and returns a new PedigreeTree object (Vue reactivity requires new reference).
 */
export async function loadAncestorGeneration(
  tree: PedigreeTree,
  ahnNum: number,
): Promise<PedigreeTree> {
  const person = tree.nodes.get(ahnNum);
  if (!person) return tree;

  // Get parent relationships for the person at ahnNum
  const rawRels = (await window.api.relationships.getForPerson(person.id)) as RawRel[];
  let parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === person.id)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null)
    .slice(0, 2);

  if (parentIds.length === 0) return tree; // nothing to load

  // Sort: male (M) → even ahnentafel (father slot), female (F) → odd (mother slot)
  if (parentIds.length === 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
    );
    if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
      parentIds = [parentIds[1], parentIds[0]];
    }
  }

  const newNodes = new Map(tree.nodes);
  const newHasMore = new Set(tree.hasMoreAncestors ?? []);
  newHasMore.delete(ahnNum); // this person's parents are now loaded

  // Fetch each parent node + check if THEY have further parents
  await Promise.all(parentIds.map(async (pid, i) => {
    const parentAhnNum = ahnNum * 2 + i;
    const [parentNode, parentRels] = await Promise.all([
      fetchPersonNode(pid),
      (window.api.relationships.getForPerson(pid) as Promise<RawRel[]>),
    ]);
    newNodes.set(parentAhnNum, parentNode);

    const gpCount = parentRels
      .filter(r => r.type === 'parent_child' && r.person2_id === pid && r.person1_id !== null)
      .length;
    if (gpCount > 0) newHasMore.add(parentAhnNum);
  }));

  // Update generations count to cover the newly added depth
  // ahnNum * 2 is at depth floor(log2(ahnNum)) + 1; generations = that depth + 1
  const newGenerations = Math.max(
    tree.generations,
    Math.floor(Math.log2(ahnNum)) + 2,
  );

  return { nodes: newNodes, generations: newGenerations, hasMoreAncestors: newHasMore };
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/chartData.ts
git commit -m "feat(charts): add loadAncestorGeneration for lazy ancestor loading"
```

---

## Task 7: Add `loadChildrenForNode` to chartData.ts

**Files:**
- Modify: `src/renderer/utils/chartData.ts` (add exports after `fetchDescendantTree`)

- [ ] **Step 1: Add `loadChildrenForNode` export**

After the closing brace of `fetchDescendantTree` and before `fetchHourglassTree`, insert:

```typescript
/**
 * Fetch and attach children for the node identified by targetPersonId, anywhere
 * in the descendant tree rooted at `root`. Returns a new root object with new
 * object references along the path to the modified node (Vue reactivity).
 * Each newly loaded child gets hasMoreChildren set by checking their relationships.
 */
export async function loadChildrenForNode(
  root: DescendantNode,
  targetPersonId: string,
): Promise<DescendantNode> {
  async function updateNode(node: DescendantNode): Promise<DescendantNode> {
    if (node.person.id === targetPersonId) {
      // Fetch this person's children
      const rawRels = (await window.api.relationships.getForPerson(node.person.id)) as RawRel[];
      const childIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person1_id === node.person.id)
        .map(r => r.person2_id)
        .filter((id): id is string => id !== null);

      const children = await Promise.all(childIds.map(async (cid) => {
        const [childNode, childRels] = await Promise.all([
          fetchPersonNode(cid),
          (window.api.relationships.getForPerson(cid) as Promise<RawRel[]>),
        ]);
        const hasMoreChildren = childRels.some(
          r => r.type === 'parent_child' && r.person1_id === cid && r.person2_id !== null,
        );
        return { person: childNode, children: [], hasMoreChildren };
      }));

      return { ...node, children, hasMoreChildren: false };
    }

    // Recurse into children, creating new object references only along changed path
    let changed = false;
    const newChildren = await Promise.all(node.children.map(async (child) => {
      const updated = await updateNode(child);
      if (updated !== child) changed = true;
      return updated;
    }));

    if (!changed) return node;
    return { ...node, children: newChildren };
  }

  return updateNode(root);
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/chartData.ts
git commit -m "feat(charts): add loadChildrenForNode for lazy descendant loading"
```

---

## Task 8: Update `PedigreeChart.vue`

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **Step 1: Update imports and add `personToAhnen` computed + `handleCollapseButton`**

Replace the entire `<script setup>` block in `src/renderer/components/charts/PedigreeChart.vue`:

```typescript
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout } from '../../utils/chartLayout';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, PedigreeTree } from '../../utils/chartLayout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const collapsed = ref(new Set<string>());

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], svgWidth: 995, svgHeight: 1024, collapseButtons: [] };
  return computePedigreeLayout(tree.value, collapsed.value);
});

// Reverse map: personId → ahnentafel key — needed by handleCollapseButton to call loadAncestorGeneration
const personToAhnen = computed(() => {
  const m = new Map<string, number>();
  for (const [k, person] of (tree.value?.nodes ?? [])) {
    m.set(person.id, k);
  }
  return m;
});

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right') {
  const key = `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId, btn.direction);
    return;
  }
  // Load-more: fetch one ancestor generation and replace tree (triggers layout recompute)
  const ahnNum = personToAhnen.value.get(btn.personId);
  if (ahnNum === undefined || !tree.value) return;
  tree.value = await loadAncestorGeneration(tree.value, ahnNum);
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-pedigree');

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#ccc'; }

function boxFill(box: BoxLayout): string {
  if (box.isFocal) return '#2c3e50';
  if (!box.person.living) return '#f8f8f8';
  return 'white';
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  collapsed.value = new Set();
  try {
    tree.value = await fetchPedigreeTree(props.personId);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>
```

- [ ] **Step 2: Update the SVG click handler in the template**

In `src/renderer/components/charts/PedigreeChart.vue`, in the `<template>`, replace:

```html
        <g
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
          class="collapse-btn"
          @click.stop="toggle(btn.personId, btn.direction)"
        >
```

with:

```html
        <g
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
          class="collapse-btn"
          @click.stop="handleCollapseButton(btn)"
        >
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/charts/PedigreeChart.vue
git commit -m "feat(charts): PedigreeChart infinite ancestor expansion via handleCollapseButton"
```

---

## Task 9: Update `HourglassChart.vue`

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **Step 1: Update imports and add `ancestorPersonToAhnen` computed + `handleCollapseButton`**

Replace the entire `<script setup>` block in `src/renderer/components/charts/HourglassChart.vue`:

```typescript
<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeHourglassLayout, maxDescendantDepth } from '../../utils/chartLayout';
import { fetchHourglassTree, loadAncestorGeneration, loadChildrenForNode } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, HourglassTree } from '../../utils/chartLayout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<HourglassTree | null>(null);
const collapsed = ref(new Set<string>());

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], svgWidth: 1400, svgHeight: 688, collapseButtons: [] };
  return computeHourglassLayout(tree.value, collapsed.value);
});

// Reverse map: personId → ahnentafel key for the ancestor section
const ancestorPersonToAhnen = computed(() => {
  const m = new Map<string, number>();
  for (const [k, person] of (tree.value?.ancestors.nodes ?? [])) {
    m.set(person.id, k);
  }
  return m;
});

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right') {
  const key = `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId, btn.direction);
    return;
  }
  if (!tree.value) return;

  if (btn.direction === 'up') {
    // Load one ancestor generation
    const ahnNum = ancestorPersonToAhnen.value.get(btn.personId);
    if (ahnNum === undefined) return;
    const newAncestors = await loadAncestorGeneration(tree.value.ancestors, ahnNum);
    tree.value = { ...tree.value, ancestors: newAncestors };
  } else if (btn.direction === 'down') {
    // Load one descendant generation
    const newRoot = await loadChildrenForNode(tree.value.descendantRoot, btn.personId);
    const newDepth = maxDescendantDepth(newRoot);
    tree.value = { ...tree.value, descendantRoot: newRoot, descendantGenerations: newDepth };
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-hourglass');

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#ccc'; }

function boxFill(box: BoxLayout): string {
  if (box.isFocal) return '#2c3e50';
  if (!box.person.living) return '#f8f8f8';
  return 'white';
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    tree.value = await fetchHourglassTree(props.personId);
    // Default: collapse ancestors beyond 2 levels (great-grandparents+).
    const defaultCollapsed = new Set<string>();
    if (tree.value) {
      for (const [k, person] of tree.value.ancestors.nodes) {
        const g = Math.floor(Math.log2(k));
        if (g >= 2) defaultCollapsed.add(`${person.id}:up`);
      }
    }
    collapsed.value = defaultCollapsed;
  } finally {
    loading.value = false;
  }
  await nextTick();
  centerOnFocal();
}

function centerOnFocal() {
  const focal = layout.value.boxes.find(b => b.isFocal);
  if (!focal || !scrollRef.value) return;
  const focalCenterX = (focal.x + focal.w / 2) * zoom.value;
  const viewportW = (scrollRef.value as HTMLElement).clientWidth;
  (scrollRef.value as HTMLElement).scrollLeft = Math.max(0, focalCenterX - viewportW / 2);
}

watch(() => props.personId, load);
onMounted(load);
</script>
```

- [ ] **Step 2: Update the SVG click handler in the template**

In `src/renderer/components/charts/HourglassChart.vue`, in the `<template>`, replace:

```html
        <g
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
          class="collapse-btn"
          @click.stop="toggle(btn.personId, btn.direction)"
        >
```

with:

```html
        <g
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
          class="collapse-btn"
          @click.stop="handleCollapseButton(btn)"
        >
```

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/charts/HourglassChart.vue
git commit -m "feat(charts): HourglassChart infinite ancestor + descendant expansion"
```

---

## Task 10: Update docs, roadmap, version bump + final commit

**Files:**
- Modify: `package.json` (version bump)
- Modify: `.claude/PLAN.md` (add milestone)

- [ ] **Step 1: Run full test suite one final time**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Bump version in package.json**

Read `package.json`, find the `"version"` field, and increment the minor version (e.g. `0.25.0` → `0.26.0`).

- [ ] **Step 3: Add milestone to `.claude/PLAN.md`**

In `.claude/PLAN.md`, add a row to the Implementation Status table after the v0.25.0 row:

```
| v0.26.0 | Infinite chart expansion: lazy load-more per branch, pedigree arrow ▶ fix | [plan](.claude/plans/2026-04-06-infinite-chart-expansion.md) |
```

- [ ] **Step 4: Final commit**

```bash
git add package.json .claude/PLAN.md .claude/plans/2026-04-06-infinite-chart-expansion.md
git commit -m "feat(charts): v0.26.0 infinite pedigree/hourglass expansion + pedigree arrow fix"
```