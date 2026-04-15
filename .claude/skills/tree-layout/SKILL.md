---
name: tree-layout
description: Layout algorithm patterns for tree charts (pedigree, hourglass, descendant). Use when building or modifying any chart layout that positions boxes in a tree structure.
---

# Tree Layout Skill

## The Pipeline

Every tree chart layout follows this pipeline:

1. **Clone** - deep-clone input tree (Vue computed re-runs on same ref)
2. **Inject** - add outline placeholders for the selected person (`injectOutlines`)
3. **Collapse** - prune collapsed branches (preserve placeholders)
4. **Measure** - compute bounding footprint for every person
5. **Place** - position all boxes using measurements
6. **Connect** - draw connector lines between placed boxes
7. **Finalize** - SVG dimensions, shift, collapse buttons, extract placeholders

## Placeholder Handling — Critical Rule

**Recursive spacing and placement functions MUST filter out `isPlaceholder` nodes.** Only Pass 4 (collision avoidance) handles placeholders. This was the root cause of the grandparent clipping bug (v0.78.4).

Functions that must skip placeholders:
- `maxAncestorDepth` / `maxDescDepth` — skip placeholder parents/children (prevents phantom rows)
- `ancestorWidth` — skip placeholder parents in recursion (prevents subtree inflation)
- `ancestorRelCX` — skip placeholder parents in recursion
- `descExtents` — skip placeholder children in recursion
- `placeAncestors` / `placeDescendants` — only recurse into real parents/children

**Exception:** `computeFootprint` DOES include placeholder spouse width. This reserves room in `ancestorWidth` so the outline fits between adjacent ancestors. The room reservation flows through spacing but the outline itself is placed by Pass 4.

## Measurement: Footprint

Every person has a bounding footprint - the total horizontal space they need including their real spouses and outline placeholders.

```typescript
interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}
```

Two variants:
- **`computeFootprint(node)`** — includes real spouses + placeholder spouse. Used by `ancestorWidth` and `descExtents` for room reservation.
- **`ancestorFootprint(node)`** — real spouses only, no placeholder. Available for cases needing stable centering.

Spouse direction:
- Real spouses: left for F, right for M/U
- Placeholder spouse: opposite side (away from real spouses)

## Spacing

Recursive spacing functions consume footprints:
- `ancestorWidth(node)` = max(sum of **real** parent subtree widths, node footprint width)
- `ancestorRelCX(node)` = clamp(parentMidCX, max(fp.left, halfParent), min(w-fp.right, w-halfParent))
- `descExtents(node)` = [max(fp.left, childSpan/2 + first.left), max(fp.right, childSpan/2 + last.right)]
- Focal row: walk outward accumulating directional footprint (toward-focal + away-from-focal)

**halfParent constraint:** `ancestorRelCX` constrains the center so that the parent span fits within the subtree slot. Without this, asymmetric placeholder widths cause parents to overshoot their allocated space.

## Placement

Four passes:
1. **Ancestors** (upward recursion) - places boxes + real spouses. **Skips placeholder parents.**
2. **Descendants** (downward recursion) - places boxes + real spouses. **Skips placeholder children.**
3. **Focal row** - focal box + manual spouse/sibling placement
4. **Outlines** - collision avoidance for ALL unplaced placeholders (spouse, parent, child)

Pass 4 checks `placedIds` — any node not yet in the boxes array is placed with collision avoidance.

## Collision Avoidance

```
function placeOutlineGroup(nodes, ownerCX, ownerY, direction):
  1. Compute targetY one row away from owner
  2. Try centered group at ownerCX
  3. If collides with any placed box, scan candidate positions (after/before each row box)
  4. Pick the closest non-colliding position to ownerCX
  5. Place boxes + fork connectors
```

Spouse outlines use `findClearX` — starts at ideal position, scans outward in the direction determined by the selected person's sex.

## Line Routing

Lines drawn AFTER all boxes are placed:
1. **Parent-child**: vertical fork (node -> forkY -> horizontal span -> vertical drops)
2. **Spouse**: horizontal line between facing edges
3. **Outline**: same geometry, tracked in `outlineLines[]` array, rendered dashed

## Invariants

1. No box overlaps any other box
2. No line passes through any box
3. Every outline is connected to its owner
4. Outlines are as close to their owner as possible
5. **Selecting a person never adds phantom generation rows**
6. **Placeholder nodes never participate in recursive spacing/placement**

## Files

- `src/renderer/utils/chart-layout/hourglass.ts` - hourglass layout
- `src/renderer/utils/chart-layout/hourglass-tree.ts` - TreePerson builders + `injectOutlines()`
- `src/renderer/utils/chart-layout/pedigree.ts` - pedigree layout
- `src/renderer/utils/chart-layout/descendant.ts` - descendant layout
- `src/renderer/utils/chart-layout/types.ts` - TreePerson, BoxLayout, ChartLayout, etc.
- `src/renderer/utils/chart-layout/constants.ts` - BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD
