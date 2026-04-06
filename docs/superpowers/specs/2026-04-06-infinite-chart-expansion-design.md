# Infinite Chart Expansion — Design Spec

**Date:** 2026-04-06
**Feature:** Infinitely expandable pedigree and hourglass charts, plus pedigree arrow direction fix.

---

## Problem

Both charts have hard-coded generation limits:
- **Pedigree:** 5 generations (focal + 4 ancestor levels, ahnentafel keys 1–31)
- **Hourglass:** 4 ancestor levels + 3 descendant levels

Collapse/expand buttons toggle already-loaded data. At the deepest loaded generation, there is no button to fetch further ancestors or descendants — the tree simply ends, even when more data exists in the database.

Additionally, the pedigree chart's collapse button arrow points ▲ (up), but ancestors are laid out to the **right** — the arrow should point ▶.

---

## Goals

1. **Infinite ancestor expansion** — any leaf node in either chart can be expanded one generation deeper, as many times as desired.
2. **Infinite descendant expansion** — any deepest descendant in the hourglass can be expanded one generation deeper.
3. **Per-branch** — expanding one leaf only loads that person's parents/children, not all leaves at that depth.
4. **One generation per click** — each click loads exactly the immediate parents or children of the clicked node.
5. **No wasted clicks** — load-more buttons appear only where data actually exists in the DB.
6. **Pedigree arrow fix** — collapse button direction changes from `'up'` to `'right'` (▶).

---

## Non-Goals

- Persisting expanded state across sessions.
- Loading more than one generation per click.
- Showing a per-branch loading spinner (full-tree spinner on initial load only).
- Changes to the circle chart or timeline.

---

## Architecture

### Data structures (`chartLayout.ts`)

**Add to `PedigreeTree`:**
```typescript
interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
  hasMoreAncestors: Set<number>; // ahnentafel keys where parents exist in DB but are not loaded
}
```

**Add to `DescendantNode`:**
```typescript
interface DescendantNode {
  person: PersonNode;
  children: DescendantNode[];
  hasMoreChildren: boolean; // children exist in DB but are not loaded (only meaningful at max depth)
}
```

**Add to `CollapseButton`:**
```typescript
interface CollapseButton {
  personId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  cx: number;
  cy: number;
  isExpanded: boolean;
  isLoadMore: boolean; // true → clicking fetches new data; false → clicking toggles visibility of loaded data
}
```

---

### Data layer (`chartData.ts`)

#### Changes to `fetchPedigreeTree`

At the deepest generation (`gen >= generations`), after fetching the person node, also fetch their relationships to check for parents. Any leaf with parent relationship(s) gets its ahnentafel key added to `hasMoreAncestors`.

```typescript
// Pseudocode addition at the leaf branch:
const rels = await window.api.relationships.getForPerson(personId);
const parentIds = rels.filter(r => r.type === 'parent_child' && r.person2_id === personId)
  .map(r => r.person1_id).filter(Boolean);
if (parentIds.length > 0) hasMoreAncestors.add(ahnNum);
```

#### Changes to `fetchDescendantTree`

At `depth >= maxDepth`, after fetching the person node, check whether they have children. Set `hasMoreChildren: true` if children exist.

```typescript
// Pseudocode addition at the leaf branch:
const rels = await window.api.relationships.getForPerson(personId);
const childIds = rels.filter(r => r.type === 'parent_child' && r.person1_id === personId)
  .map(r => r.person2_id).filter(Boolean);
return { person: node, children: [], hasMoreChildren: childIds.length > 0 };
```

#### New `loadAncestorGeneration(tree, ahnNum)`

Fetches the parents of the person at `ahnNum`, adds them to `tree.nodes`, checks each new parent for their parents (to set `hasMoreAncestors`), removes `ahnNum` from `hasMoreAncestors`. Returns a new tree object (required for Vue reactivity).

```typescript
async function loadAncestorGeneration(
  tree: PedigreeTree,
  ahnNum: number
): Promise<PedigreeTree>
```

- Fetches person at `ahnNum` (already in tree) → looks up their parent relationship IDs
- Calls `fetchPersonNode` for each parent (up to 2)
- For each new parent, fetches their relationships → sets `hasMoreAncestors` for the parent's ahnentafel key if they too have parents
- Returns `{ ...tree, nodes: new Map(tree.nodes), hasMoreAncestors: new Set(tree.hasMoreAncestors) }` with new entries merged in
- Also updates `generations` if the new nodes exceed the current recorded depth

#### New `loadChildrenForNode(descendantRoot, targetPersonId)`

Walks the descendant tree to find the node with `person.id === targetPersonId`, fetches its children, attaches them (each with `hasMoreChildren` pre-checked), returns the updated descendant root (new object for reactivity).

```typescript
async function loadChildrenForNode(
  root: DescendantNode,
  targetPersonId: string
): Promise<DescendantNode>
```

- Recursively finds target node by `person.id`
- Fetches parent_child relationships where `person1_id === targetPersonId`
- For each child: calls `fetchPersonNode`, checks if THAT child has children → sets `hasMoreChildren`
- Replaces the target node's `children` and sets `hasMoreChildren: false` on it
- Returns a new root object (new object references along the path to the modified node — required for Vue reactivity; sibling branches can be shared)

#### New `maxDescendantDepth(root)`

```typescript
function maxDescendantDepth(node: DescendantNode, depth = 0): number
```

Recursively computes the actual max depth of the descendant tree. Used after `loadChildrenForNode` to update `HourglassTree.descendantGenerations`.

**Why this is needed:** `computeHourglassLayout` uses `descendantGenerations: M` as a hard depth cap for both `subtreeExtents` and `placeDescendants`. Without updating `M` after a load-more click, newly loaded children at depth M+1 would be silently skipped. After each `loadChildrenForNode` call, `HourglassChart.vue` sets `tree.value.descendantGenerations = maxDescendantDepth(newRoot)` before replacing `tree.value`.

---

### Layout layer (`chartLayout.ts`)

#### `computePedigreeLayout` changes

**Arrow direction fix:** Replace all `'up'` with `'right'` for pedigree collapse buttons. This covers:
1. The pruning check: `collapsed.has(`${person.id}:up`)` → `collapsed.has(`${person.id}:right`)`
2. The button: `direction: 'up'` → `direction: 'right'`
3. The `isExpanded` check: `!collapsed.has(`${person.id}:up`)` → `!collapsed.has(`${person.id}:right`)`

**Load-more buttons:** For each leaf node (no children in `prunedNodes`) where `tree.hasMoreAncestors.has(k)`:
```typescript
collapseButtons.push({
  personId: person.id,
  direction: 'right',
  cx: box.x + BOX_W + 10,
  cy: box.y + BOX_H / 2,
  isExpanded: false,
  isLoadMore: true,
});
```

Note: existing collapse buttons already have `isLoadMore: false` (add default).

#### `computeHourglassLayout` changes

**Ancestor load-more buttons:** For leaf ancestor nodes where `tree.ancestors.hasMoreAncestors.has(k)`, add a load-more button with `direction: 'up'` (hourglass uses vertical ancestor layout).

**Descendant load-more buttons:** For descendant leaf nodes where `descNode.hasMoreChildren === true`:
```typescript
collapseButtons.push({
  personId: node.person.id,
  direction: 'down',
  cx: box.x + BOX_W / 2,
  cy: box.y + BOX_H + 10,
  isExpanded: false,
  isLoadMore: true,
});
```

---

### Component layer

#### `PedigreeChart.vue`

Replace the simple `toggle()` with an async function that branches on `isLoadMore`:

```typescript
async function handleCollapseButton(btn: CollapseButton) {
  if (btn.isLoadMore) {
    const ahnNum = personToAhnen.get(btn.personId);
    if (ahnNum === undefined) return;
    tree.value = await loadAncestorGeneration(tree.value!, ahnNum);
    // Auto-expand: remove from collapsed so new nodes are visible
    const next = new Set(collapsed.value);
    next.delete(`${btn.personId}:right`);
    collapsed.value = next;
  } else {
    toggle(btn.personId, btn.direction);
  }
}
```

The SVG click handler calls `handleCollapseButton(btn)` instead of `toggle(btn.personId, btn.direction)`.

The component needs a `personToAhnen` map (already computable from `tree.value.nodes`) accessible at click time — either as a computed or derived inside the handler.

#### `HourglassChart.vue`

Same pattern. Two load paths:
- `btn.direction === 'up'` → `loadAncestorGeneration(tree.value!.ancestors, ahnNum)` → update `tree.value.ancestors`
- `btn.direction === 'down'` → `loadChildrenForNode(tree.value!.descendantRoot, btn.personId)` → update `tree.value.descendantRoot` and `tree.value.descendantGenerations = maxDescendantDepth(newRoot)`

After loading, update `tree.value` with a new object to trigger the `layout` computed.

---

## Reactivity pattern

Both components hold `tree = ref<XTree | null>(null)`. Since `Map` and recursive objects don't trigger Vue reactivity on mutation, every load operation must replace `tree.value` with a new object:

```typescript
// Pedigree:
tree.value = { ...tree.value!, nodes: newNodes, hasMoreAncestors: newHasMore };

// Hourglass ancestors:
tree.value = { ...tree.value!, ancestors: { ...tree.value!.ancestors, nodes: newNodes, hasMoreAncestors: newHasMore } };

// Hourglass descendants:
tree.value = { ...tree.value!, descendantRoot: newRoot };
```

The `layout` computed re-runs on each such replacement.

---

## IPC call budget

| Action | Extra IPC calls (over current) |
|--------|-------------------------------|
| Initial pedigree load (5 gen, 16 leaves) | +16 relationship checks |
| Initial hourglass load (8 ancestor leaves + 8 desc leaves) | +16 relationship checks |
| One "load more" click (pedigree ancestor) | 2 person fetches + 2 relationship checks |
| One "load more" click (hourglass descendant) | N person fetches + N relationship checks (N = number of children) |

Relationship checks are lightweight (single indexed query). The 16-call overhead on initial pedigree load is acceptable.

---

## Files changed

| File | Change |
|------|--------|
| `src/renderer/utils/chartLayout.ts` | Add `hasMoreAncestors`, `hasMoreChildren`, `isLoadMore` fields; pedigree direction fix; load-more button generation |
| `src/renderer/utils/chartData.ts` | `fetchPedigreeTree` + `fetchDescendantTree` pre-checks; new `loadAncestorGeneration`; new `loadChildrenForNode` |
| `src/renderer/components/charts/PedigreeChart.vue` | Async `handleCollapseButton`; `personToAhnen` computed |
| `src/renderer/components/charts/HourglassChart.vue` | Async `handleCollapseButton`; two load paths |

No schema changes. No IPC changes. No MCP changes.

---

## Testing

- Unit tests in `tests/unit/` cover `chartLayout.ts` (pure function). Add cases: pedigree with `hasMoreAncestors` shows load-more buttons; pedigree direction is `'right'`; hourglass descendant leaf with `hasMoreChildren` shows load-more button.
- `chartData.ts` is tested via integration — existing patterns in the E2E test cover the data layer. No new unit tests needed for fetch functions.
