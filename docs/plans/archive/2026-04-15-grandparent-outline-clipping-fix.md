# Fix: Grandparent selection clipping ancestor tree

## Problem
Selecting any grandparent in the hourglass chart shifted the entire ancestor tree.
Left grandparents shifted tree left (not enough room), right grandparents shifted right
(too much room). The placeholder spouse outline inflated spacing calculations, changing
focalCX and all dependent positions.

## Root Cause
`injectOutlines()` adds placeholder parents, children, and spouse to the selected person.
These placeholders were treated as real nodes by:

1. **`maxAncestorDepth` / `maxDescDepth`** — counted placeholder parents as extra generations,
   adding phantom rows
2. **`ancestorWidth` / `ancestorRelCX`** — recursed into placeholder parents, inflating subtree
   width and shifting centering
3. **`descExtents`** — recursed into placeholder children, inflating descendant spacing
4. **`placeAncestors` / `placeDescendants`** — placed placeholder nodes inline instead of
   deferring to Pass 4 collision avoidance

The asymmetric width from the placeholder spouse (`computeFootprint`) propagated through
`ancestorRelCX` → `focalAncRelCX` → `focalCX`, shifting the entire chart.

## Fix
All recursive spacing and placement functions now filter out placeholder nodes
(`isPlaceholder` flag). Placeholders are handled exclusively by Pass 4 (collision avoidance).

- **`maxAncestorDepth` / `maxDescDepth`**: skip placeholder parents/children
- **`ancestorWidth`**: uses `computeFootprint` (includes placeholder spouse width for room
  reservation) but skips placeholder parents in recursion
- **`ancestorRelCX`**: uses `computeFootprint` for the node's own extent, skips placeholder
  parents, constrains center so parent span fits within subtree slot
  (`halfParent` constraint added)
- **`descExtents`**: skips placeholder children
- **`placeAncestors` / `placeDescendants`**: filter to real parents/children only
- **Focal parent/child blocks**: same filtering applied

Added `ancestorFootprint()` (real spouses only, no placeholder spouse) — available for
future use but not currently needed since `computeFootprint` is used in ancestor spacing
to reserve outline room.

## Files Changed
- `src/renderer/utils/chart-layout/hourglass.ts` — all spacing/placement functions updated
- `tests/unit/chartLayout.test.ts` — added `ancestorFootprint` tests and grandparent
  selection tests (no extra rows, no overlaps, outline placed)
