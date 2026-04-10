# Plan: Per-Node Descendant Collapse in Hourglass

## Goal

Every descendant node in the hourglass view should get a ↓ button to collapse
its own subtree — not just the focal person. Currently only `focalId:down`
collapses descendants; children, grandchildren, etc. have no collapse control.

---

## What changes

### Existing behaviour (v0.6.6)

| Button | Who has it | Collapses |
|--------|-----------|-----------|
| ↑ | Any ancestor with parents | Their ancestor subtree |
| ↓ | Focal only | ALL descendants |
| → | Focal (when spouses exist) | Spouses |

### Target behaviour

| Button | Who has it | Collapses |
|--------|-----------|-----------|
| ↑ | Any ancestor with parents | Their ancestor subtree |
| ↓ | **Any node** (focal or non-focal) with children | That node's subtree |
| → | Focal (when spouses exist) | Spouses |

---

## Implementation

### Step 1 — Make `leafCount` collapse-aware

`leafCount` is used to compute layout widths before nodes are placed. It must
treat a collapsed non-focal node as a leaf so the surrounding space is
reclaimed:

```typescript
function leafCount(node: DescendantNode, depth: number): number {
  if (depth >= M || node.children.length === 0) return 1;
  // Non-focal node whose children are hidden: count as leaf
  if (depth > 0 && collapsed.has(`${node.person.id}:down`)) return 1;
  return node.children.reduce((sum, c) => sum + leafCount(c, depth + 1), 0);
}
```

`depth > 0` guard ensures focal's collapse is still handled by the existing
`effectiveDescRoot` path (no double-counting).

### Step 2 — Skip recursion in `placeDescendants` for collapsed non-focal nodes

```typescript
if (depth < M && node.children.length > 0) {
  // For non-focal nodes, respect per-node :down collapse
  const childrenCollapsed = depth > 0 && collapsed.has(`${node.person.id}:down`);
  if (!childrenCollapsed) {
    // draw fork lines and recurse into children (existing code)
  }
}
```

### Step 3 — Generate ↓ buttons for all descendant nodes with children

Currently, button generation in the "for box in boxes" loop only adds `:down`
for `k === 1` (focal). Extend it to also add a ↓ button for any descendant
box that has children in the **original** `descendantRoot` tree.

Build a Map of descendant personId → DescendantNode from the original tree:

```typescript
const descNodeMap = new Map<string, DescendantNode>();
function indexDescendants(node: DescendantNode) {
  descNodeMap.set(node.person.id, node);
  for (const child of node.children) indexDescendants(child);
}
indexDescendants(descendantRoot);
```

Then in the button-generation loop, for boxes NOT in `personToAhnen` (i.e.
descendant boxes placed by `placeDescendants`):

```typescript
for (const box of boxes) {
  const k = personToAhnen.get(box.person.id);
  if (k !== undefined) {
    // ancestor / focal buttons (existing logic)
  } else {
    // descendant box
    const descNode = descNodeMap.get(box.person.id);
    if (descNode && descNode.children.length > 0) {
      collapseButtons.push({
        personId: box.person.id, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
        isExpanded: !collapsed.has(`${box.person.id}:down`),
      });
    }
  }
}
```

---

## Unit tests

Add to `tests/unit/chartLayout.test.ts`:

- `collapsing child:down hides grandchildren but keeps child box`
- `collapseButtons includes down button for non-focal child with children`
- `leafCount shrinks when a non-focal child is collapsed` (layout width assertion)

---

## Files to change

- `src/renderer/utils/chartLayout.ts` — Steps 1–3 above
- `tests/unit/chartLayout.test.ts` — new tests

No Vue component changes needed — the template already renders all
`collapseButtons` and the `toggle` function handles any direction.
