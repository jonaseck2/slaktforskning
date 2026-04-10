# Fix: Pedigree chart wastes vertical space when ancestors are collapsed

## Problem
The pedigree chart's SVG height was calculated as `PAD + totalLeaves * ROW_H - V_GAP + PAD`,
where `totalLeaves = 2^(G-1)` — the maximum number of leaf slots in a full tree. When
ancestors are collapsed (or simply absent in the DB) many of those slots are empty, leaving
large whitespace gaps in the chart vertically.

## Root Cause
`computePedigreeLayout` always reserved `totalLeaves` vertical slots regardless of how many
persons are actually visible. The `centerYOf` function assigned pixel positions based on
virtual slot numbers in the full tree, so even absent persons took up vertical space.

## Fix
Replaced the fixed-slot layout with a compact leaf-first approach:

1. Determine which visible nodes are actual leaves (no children in the pruned tree).
2. Sort leaves by their virtual position in the full tree to preserve genealogical
   top-to-bottom order (father's family above mother's family).
3. Assign sequential slot indices to leaves — no gaps.
4. Internal nodes (focal and parents) get `centerYOf` = average of their visible children.
5. `svgHeight` is computed from the actual number of visible leaves, not the theoretical max.

This preserves the correct parent-above-child ordering while eliminating all empty rows.

## Files Changed
- `src/renderer/utils/chartLayout.ts` — `computePedigreeLayout`: replaced fixed
  `totalLeaves * ROW_H` height and slot-based `centerYOf` with compact leaf assignment
  and child-averaging for internal nodes.
