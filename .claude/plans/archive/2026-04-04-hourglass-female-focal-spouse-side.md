# Fix: Hourglass chart always places spouse to the right of focal

## Problem
Selecting a female person as the focal in the hourglass chart caused the male spouse
to appear to her RIGHT, making the visual read "female left, male right" — opposite of
the "male left, female right" convention used everywhere else in the chart.

## Root Cause
`computeHourglassLayout` in `src/renderer/utils/chartLayout.ts` always placed spouses
to the RIGHT of the focal person via a fixed formula:
```typescript
const spouseCXOf = (i) => focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);
```
When the focal person is male his wife goes right ✓. When the focal is female her husband
goes right ✗. The `:right` collapse key, marriage line, and collapse button also all
assumed the spouse is to the right.

## Fix
Added `spouseOnLeft = focalPerson?.sex === 'F' && effectiveSpouses.length > 0`.

When `spouseOnLeft`:
- `spouseCXOf` subtracts instead of adds → spouse goes LEFT
- `coupleJunctionX = focalCX - spouseOffset` (junction between focal and left spouse)
- `descLeftFromFocal` / `descRightFromFocal` and `focalCX` / `rightNeeded` accounting updated
- Marriage line spans from left-spouse edge to focal right edge
- Collapse button placed to the LEFT of focal with `direction: 'left'` arrow
- `effectiveSpouses` checks both `:right` and `:left` collapsed keys

## Files Changed
- `src/renderer/utils/chartLayout.ts` — `computeHourglassLayout`: added `spouseOnLeft`
  flag and updated spouseCXOf, coupleJunctionX, focalCX, rightNeeded, marriage line,
  collapse button direction/position, effectiveSpouses key check
