# Hourglass Layout Rework

## Problem

The hourglass chart layout has three zones (ancestors above, focal row, descendants below) that each expand in different directions. When a person is selected, 4 outline placeholders (father, mother, spouse, child) are injected. These outlines can extend into neighboring zones, causing overlaps.

Previous attempts failed because spacing and placement were interleaved — outlines placed during recursive passes clipped existing boxes, and post-layout collision avoidance placed outlines far from their owner.

## Invariants

1. No box (real or outline) may overlap any other box.
2. No line may pass through any box.
3. Every outline must be connected to its owner via lines.
4. Outlines should be placed as close to their owner as possible.

## Architecture

### Input

`computeHourglassLayout` takes a `TreePerson` directly. The Vue component stores `TreePerson` and the layout function receives it as-is.

Data fetching (`fetchHourglassTreePerson`) builds the TreePerson graph with:
- N parents per person (no ahnentafel limit)
- Real spouses for every ancestor and descendant (excluding persons already in the tree)
- Siblings with their spouses
- `coParentId` annotations on focal's direct children

Future follow-up: align pedigree and descendant charts to also accept TreePerson directly.

### Pipeline

```
1. Clone       — deep-clone input (Vue computed re-runs on same ref)
2. Inject      — injectOutlines(clone, selectedPersonId) adds 4 placeholders
3. Collapse    — prune collapsed branches (preserve placeholders)
4. Measure     — compute bounding footprint for every person
5. Place       — position all real boxes using measurements (4 passes)
6. Connect     — draw all connector lines between placed boxes
7. Finalize    — SVG dimensions, shift, collapse buttons, extract placeholders
```

### Step 4: Measurement

Every person has a **bounding footprint** — the total horizontal space they need including their real spouses and outline placeholders.

```typescript
interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}
```

A person's footprint is:
- **Base:** `BOX_W / 2` in each direction
- **Real spouses:** extend to one side (left for females, right for males). Each spouse adds `BOX_W + V_GAP`.
- **Spouse outlines (placeholder):** same as real spouses — they're in the `spouses[]` array after `injectOutlines`.
- **Parent/child outlines:** centered group may be wider than BOX_W. Extends both directions: `groupWidth / 2`.

For recursive spacing:
- **`ancestorWidth(node)`**: `max(sum of parent subtree widths, node footprint width)`. The footprint includes real spouses and any outline widths.
- **`descExtents(node)`**: `[max(half, childSpan/2 + first.left) + footprint.left, max(half, childSpan/2 + last.right) + footprint.right]`. The footprint adds spouse/outline extent on the correct side.
- **Focal spouse/sibling extent**: walk outward from focal, accumulating each node's toward-focal extent + gap + away-from-focal extent. Uses directional footprint, not symmetric width.

Key rule: footprints are computed ONCE from the tree structure before any placement.

### Step 5: Placement (4 passes)

**Pass 1 — Ancestors:** `placeAncestors(node, nodeCX, depth)` recurses upward.
- Places node box at `nodeCX`
- Places real spouses beside it (within the measured footprint)
- Positions parents above, spaced by their subtree widths
- Does NOT place cross-direction outlines (child placeholders on ancestors)

**Pass 2 — Descendants:** `placeDescendants(node, nodeCX, depth)` recurses downward.
- Places node box at `nodeCX`
- Places real spouses beside it
- Positions children below, spaced by their subtree extents
- Does NOT place cross-direction outlines (parent placeholders on descendants)

**Pass 3 — Focal row:** Manual placement of:
- Focal box at `focalCX` (determined by max of ancestor/descendant/spouse/sibling extents)
- Focal's real spouses using directional footprint offsets
- Siblings using directional footprint offsets

**Pass 4 — Outlines:** Place the selected person's 4 outline placeholders.
- Find the selected person's placed box.
- **Same-direction outlines** (parent outlines on ancestors, child outlines on descendants): place centered on owner, one row away. Space was reserved in measurement.
- **Cross-direction outlines** (child outlines on ancestors, parent outlines on descendants): place with collision avoidance — try centered first, shift to nearest non-overlapping position.
- **Focal-row outlines** (all outlines for spouses/siblings): collision avoidance.
- **Spouse outlines**: place beside owner with collision avoidance.

Collision avoidance: try ideal position, if it overlaps any placed box, scan candidate positions (after/before each existing box on that row), pick the closest to owner.

### Step 6: Line routing

Lines drawn AFTER all boxes are placed. Three types:

1. **Parent-child connectors**: vertical fork. Node bottom → fork Y → horizontal span → vertical drops to each parent/child top.
2. **Spouse connectors**: horizontal line between facing edges at mid-Y.
3. **Outline connectors**: same fork/horizontal geometry as above, but marked for dashed rendering via placeholder center detection.

Lines cannot clip boxes because:
- Same-zone lines run through GEN_GAP space between rows (no boxes there)
- Cross-direction outline lines also run through GEN_GAP (collision avoidance ensures the outline box doesn't overlap other boxes on its target row)

### Step 7: Finalize

1. If any box has negative X, shift all boxes and lines right.
2. Compute SVG width/height from actual box positions.
3. Generate collapse buttons for all non-placeholder boxes.
4. Extract placeholder boxes from `boxes[]` into `placeholders[]`, convert touching lines to `placeholderLines[]`.

## Files

| File | Action |
|------|--------|
| `src/renderer/utils/chart-layout/hourglass.ts` | **Rewrite** |
| `src/renderer/utils/chartData.ts` | Keep (fetchHourglassTreePerson already written) |
| `src/renderer/components/charts/HourglassChart.vue` | Keep (TreePerson-based) |
| `src/renderer/utils/chart-layout/index.ts` | Keep current exports |
| `tests/unit/chartLayout.test.ts` | Keep TreePerson-based tests, add outline overlap tests |
| `src/renderer/utils/chart-layout/hourglass-tree.ts` | No changes |

## Testing

- All existing 78 chart layout tests must pass (no behavior change for non-outline cases).
- New tests: select each person type (focal, ancestor, descendant, spouse, sibling) and verify `assertNoOverlaps` including placeholders.
- MCP visual verification: select every person in the tree, screenshot, confirm no clipping.

## Follow-ups (separate plans)

1. **Align pedigree/descendant to TreePerson input** — both charts currently take their raw data types (PedigreeTree, DescendantNode) and convert internally. Align them to accept TreePerson directly, matching the hourglass pattern.
2. **Extract tree layout skill** — create a reusable skill for tree graphing that encodes the measurement → placement → connection pipeline.
