# Fix: Circle chart zoom and text spacing

## Problem
1. Zooming the circle chart beyond 100% (the fill-screen level) had no visible effect on the diagram size — the chart stayed the same size while only the scrollable area grew.
2. The +/- zoom buttons did not keep the diagram centered after zooming — the center of the circle scrolled out of view.
3. In curved text mode, the given name and surname arcs were too close together compared to the surname–date gap.

## Root Cause

**Zoom has no effect past fill-screen:**
`chart-scroll` uses `display: flex; align-items: center; justify-content: center`. The SVG is a flex child with the default `flex-shrink: 1`. When the SVG's computed `width`/`height` exceeded the container size (i.e., at zoom > 1), flexbox shrank the SVG back to fit the container. The diagram appeared the same size; only the internal scroll extent grew because the browser's overflow tracking used the un-shrunk size.

**Zoom buttons lose center:**
`useChartZoom.zoomIn`/`zoomOut` changed `zoom.value` but did not reposition the scroll container. `onWheel` already did cursor-anchored repositioning for ctrl+scroll, but the buttons had no equivalent logic.

**Curved text line spacing:**
`circleLayout.ts` used offsets of ±8 for the given-name arc and ∓9 for the date arc, giving a given→surname gap of 8 and surname→date gap of 9 — nearly equal. But the date uses a smaller font, so visually the date had proportionally more space. Result: name lines felt cramped relative to the date.

## Fix

- `src/renderer/components/charts/CircleChart.vue`: added `.chart-scroll > svg { flex-shrink: 0; }` so the SVG is never shrunken by its flex parent.
- `src/renderer/utils/useChartZoom.ts`: extracted `applyZoom(factor)` that anchors the scroll to the center of the visible viewport (same math as the wheel handler), and wired `zoomIn`/`zoomOut` through it.
- `src/renderer/utils/circleLayout.ts`: increased given-name arc offset from ±8 to ±11, and date arc from ∓9 to ∓10, giving a given→surname gap of 11 vs. surname→date gap of 10.

## Files Changed
- `src/renderer/components/charts/CircleChart.vue` — `flex-shrink: 0` on SVG
- `src/renderer/utils/useChartZoom.ts` — center-anchored `applyZoom` for +/- buttons
- `src/renderer/utils/circleLayout.ts` — wider given-name arc spacing
