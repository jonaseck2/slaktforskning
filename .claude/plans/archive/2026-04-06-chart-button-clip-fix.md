# Fix: Chart expansion buttons clipped at scroll boundary

## Problem
In PedigreeChart, the rightmost column's ▶ expand buttons were clipped on the right
side when the chart needed horizontal scrolling. In HourglassChart, the ▲ load-more
buttons on the topmost ancestor row were clipped at the top of the scroll area.

## Root Cause

**Pedigree:** `svgWidth` was computed as `PAD + G*BOX_W + (G-1)*H_GAP + PAD`, where
`PAD = 10`. The rightmost column's button cx = `box.right + 10 = svgWidth` — the
button center sat exactly at the SVG right edge. With circle radius 8 and stroke-width
1.5, the button's visual right edge extended `8.75px` beyond the SVG, clipping it.
At higher zoom levels the clipping scaled with the zoom factor.

`src/renderer/utils/chartLayout.ts:175`

**Hourglass:** `ancestorRowY(A) = PAD = 10` placed the topmost row at y=10. The ▲
button for that row is at `cy = box.y - 10 = 0`, which extends to `y = -8` — outside
the SVG entirely.

`src/renderer/utils/chartLayout.ts:429-431`

## Fix
- **Pedigree:** Added `+10` to `svgWidth` formula, giving `box.right + 20` total right
  margin (button center at `+10`, radius `8`, stroke `0.75` → need `≥18.75`; `+20`
  provides a clean margin even at high zoom).
- **Hourglass:** Introduced `ancestorTopPad = PAD + 8 = 18` as the top offset for all
  ancestor and focal rows, shifting the entire layout down by 8px so the topmost ▲
  button fits within the SVG.

## Files Changed
- `src/renderer/utils/chartLayout.ts` — two formula changes in `computePedigreeLayout` and `computeHourglassLayout`