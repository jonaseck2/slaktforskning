# Fix: Hourglass chart descendant overlap

## Problem
Sibling nodes at depth 1+ were overlapping when one sibling had an expanded subtree.
For example, Lena's grandchildren (depth 2) would visually overlap with her siblings'
boxes at depth 1, because children were spaced only 1 slot apart regardless of subtree width.

## Root Cause
`placeDescendants` in `src/renderer/utils/chartLayout.ts` spread children evenly at
`BOX_W + V_GAP` (175px) per slot, centered below the parent. The companion
`compactExtents` function used the same 1-slot assumption to pre-compute bounding boxes
for `focalCX` placement. Neither function accounted for the actual horizontal extent of
each child's subtree.

When a child had N grandchildren centered under it, those grandchildren extended
`(N-1)/2 * 175` pixels outward from the child's center — potentially overlapping the
adjacent sibling box or its descendants.

## Fix
Replaced `compactExtents` with `subtreeExtents(node, depth) → [leftExt, rightExt]`,
which recursively computes the true bounding box of each subtree using proper packing:
- Spacing between adjacent child centers = `rightExt[i] + V_GAP + leftExt[i+1]`
- Children group centered below parent
- Leaf nodes return `[BOX_W/2, BOX_W/2]`

`placeDescendants` was rewritten to use the same logic: compute child extents, derive
center positions, then recurse. Signature changed from `(node, depth, leftX)` to
`(node, depth, nodeCX)` — now takes the center directly.

Added `centerOnFocal()` in `HourglassChart.vue` that auto-scrolls to center the focal
person horizontally on initial load. This compensates for the wider chart (descendants
with large subtrees push focalCX to the right, so the default scroll-to-0 would show
mostly descendant space rather than the focal).

## Files Changed
- `src/renderer/utils/chartLayout.ts` — replaced `compactExtents` + rewrote `placeDescendants`
- `src/renderer/components/charts/HourglassChart.vue` — added `centerOnFocal()`, `nextTick` import
