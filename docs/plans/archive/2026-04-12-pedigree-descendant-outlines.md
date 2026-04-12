# Pedigree & Descendant Chart Outline Support

## Goal
Extend the TreePerson outline architecture (built for hourglass in v0.71.0) to the pedigree and descendant charts, enabling add-person outlines for all three chart types.

## Approach: Shared data model, independent layouts

All three charts share:
- **TreePerson** data model (`hourglass-tree.ts`)
- **Converter functions**: `buildPedigreeTreePerson(PedigreeTree)`, `buildDescendantTreePerson(DescendantNode)`, `buildHourglassTree(HourglassTree)`
- **`injectOutlines(root, selectedPersonId)`** — unconditionally adds father + mother + child + spouse outlines
- **Placeholder extraction** — filter boxes by `PLACEHOLDER_PREFIX`, move to `placeholders[]` with dashed connector lines

Each chart keeps its own layout algorithm and orientation.

## Pedigree Chart Changes

### Layout (`pedigree.ts`)
- Rewrote to operate on TreePerson graph instead of raw ahnentafel Map
- Supports N parents per node (recursive, not binary)
- Compact vertical layout preserved: leaf nodes get sequential slots, internal nodes center over parents
- **Spouse leaf slot reservation**: `assignLeafSlots()` reserves an extra slot for the selected person's spouse outline, pushing subsequent nodes down to create natural vertical space
- **Post-layout pass**: places spouse outlines (V_GAP below selected) and child outlines (to the left, cross-column overlap check via `findClearYRect`)
- Collapse filtering: prunes collapsed parents but preserves placeholder nodes

### Component (`PedigreeChart.vue`)
- Ghost box template supports all 4 roles (was father/mother only)
- `placeholderLabel()` helper for i18n role labels
- `startAddFromPlaceholder()` handles all roles via `AddRelatedPersonModal`
- Placeholder key uses `role + childPersonId` (removed ahnentafel `key` dependency)

## Descendant Chart Changes

### Layout (`descendant.ts`)
- Added `selectedPersonId` parameter
- Converts DescendantNode → TreePerson via `buildDescendantTreePerson()`
- Injects outlines, then layouts with subtree extents (unchanged algorithm)
- Post-layout pass: spouse outlines beside selected (sex-dependent), parent outlines above
- SVG dimensions recalculated to accommodate outlines (viewBoxMinY for parent outlines above focal)

### Component (`DescendantChart.vue`)
- Added `selectedPersonId` prop
- Ghost box rendering with dashed lines (same pattern as hourglass/pedigree)
- Add-popover shows all 4 roles (was child-only)
- `startAddFromPlaceholder()` passes sex/surname to `AddRelatedPersonModal`

## Key Challenges

### Pedigree spouse overlap (5 iterations to resolve)
1. **v0.72.0**: Initial implementation — spouse outline placed at `selBox.y + BOX_H + V_GAP`, overlapped with ancestors in same generation column
2. **v0.72.1**: Tried placing below all boxes in column — pushed spouse far from selected person
3. **v0.72.2**: Added `findClearY` with same-column check — still overlapped cross-column
4. **v0.72.3**: Changed to full rectangle intersection — spouse pushed to bottom of tree
5. **v0.72.4-5**: Tried right-shift, direct placement — connector corridor overlap or wrong position
6. **v0.72.6**: Final solution — reserve leaf slot during `assignLeafSlots()` to push other boxes down, but place spouse at tight V_GAP spacing below selected person

The key insight: the layout must know about the spouse outline **during slot assignment** to create space, but the outline's visual position should be tight (V_GAP, not ROW_H) below the selected person.

## Files Changed
- `src/renderer/utils/chart-layout/hourglass-tree.ts` — added `buildPedigreeTreePerson()`, `buildDescendantTreePerson()`
- `src/renderer/utils/chart-layout/pedigree.ts` — full rewrite to TreePerson with leaf slot reservation
- `src/renderer/utils/chart-layout/descendant.ts` — added selectedPersonId, TreePerson conversion, outline extraction
- `src/renderer/utils/chart-layout/index.ts` — exported new converter functions
- `src/renderer/components/charts/PedigreeChart.vue` — all-role ghost boxes and placeholder handling
- `src/renderer/components/charts/DescendantChart.vue` — added outline rendering, all-role popover
- `src/renderer/views/VisualizationView.vue` — passes selectedPersonId to descendant chart
