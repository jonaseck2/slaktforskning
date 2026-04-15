---
name: tree-layout
description: Layout algorithm patterns for tree charts (pedigree, hourglass, descendant). Use when building or modifying any chart layout that positions boxes in a tree structure.
---

# Tree Layout Skill

## The Pipeline

Every tree chart layout follows this pipeline:

1. **Clone** - deep-clone input tree (Vue computed re-runs on same ref)
2. **Inject** - add outline placeholders for the selected person
3. **Collapse** - prune collapsed branches (preserve placeholders)
4. **Measure** - compute bounding footprint for every person
5. **Place** - position all boxes using measurements
6. **Connect** - draw connector lines between placed boxes
7. **Finalize** - SVG dimensions, shift, collapse buttons, extract placeholders

## Measurement: Footprint

Every person has a bounding footprint - the total horizontal space they need including their real spouses and outline placeholders.

```typescript
interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}
```

Computation:
- Base: BOX_W / 2 each side
- Spouses: extend to one side (left for females, right for males). Each spouse adds BOX_W + V_GAP.
- Parent/child outlines: centered group, extends max(groupWidth/2) each side.
- Take the max of all contributions per side.

## Spacing

Recursive spacing functions consume footprints:
- `ancestorWidth(node)` = max(sum of parent subtree widths, node footprint width)
- `descExtents(node)` = [max(fp.left, childSpan/2 + first.left), max(fp.right, childSpan/2 + last.right)]
- Focal row: walk outward accumulating directional footprint (toward-focal + away-from-focal)

## Placement

Four passes:
1. **Ancestors** (upward recursion) - places boxes + real spouses
2. **Descendants** (downward recursion) - places boxes + real spouses
3. **Focal row** - focal box + manual spouse/sibling placement
4. **Outlines** - collision avoidance for cross-direction and focal-row outlines

Same-direction outlines (parent placeholders on ancestors, child placeholders on descendants) are placed by the recursive passes naturally since they're in the parents[]/children[] arrays.

Cross-direction outlines use collision avoidance: try centered on owner, shift to nearest clear position if overlapping.

## Collision Avoidance

```
function placeOutlineGroup(nodes, ownerCX, ownerY, direction):
  1. Compute targetY one row away from owner
  2. Try centered group at ownerCX
  3. If collides with any placed box, scan candidate positions (after/before each row box)
  4. Pick the closest non-colliding position to ownerCX
  5. Place boxes + fork connectors
```

## Line Routing

Lines drawn AFTER all boxes are placed:
1. **Parent-child**: vertical fork (node -> forkY -> horizontal span -> vertical drops)
2. **Spouse**: horizontal line between facing edges
3. **Outline**: same geometry, converted to dashed via placeholder center detection

## Invariants

1. No box overlaps any other box
2. No line passes through any box
3. Every outline is connected to its owner
4. Outlines are as close to their owner as possible

## Files

- `src/renderer/utils/chart-layout/hourglass.ts` - hourglass layout
- `src/renderer/utils/chart-layout/pedigree.ts` - pedigree layout
- `src/renderer/utils/chart-layout/descendant.ts` - descendant layout
- `src/renderer/utils/chart-layout/types.ts` - TreePerson, BoxLayout, ChartLayout, etc.
- `src/renderer/utils/chart-layout/constants.ts` - BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD
