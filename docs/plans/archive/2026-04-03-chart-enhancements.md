# Feature: Chart enhancements — depth, zoom/scroll, spouses

## Changes

### Pedigree depth: 3 → 5 generations
Refactored `PedigreeTree` from explicit tuple arrays (focal/parents/grandparents) to ahnentafel
`Map<number, PersonNode>` + `generations: number`. Key 1=focal, 2=father, 3=mother, 4–7=gp, etc.
`computePedigreeLayout` now uses general slot-math that works for any depth.
`fetchPedigreeTree` in `chartData.ts` fetches recursively up to `generations=5`.

### Hourglass depth: 2 above/2 below → 4 ancestor levels + 3 descendant levels
`HourglassTree` refactored to `{ ancestors: PedigreeTree; descendantRoot: DescendantNode; descendantGenerations; spouses }`.
`fetchHourglassTree` fetches `ancestors(4)` and `descendants(3)` in parallel.

### Scroll + zoom for all three charts
Replaced `width="100%"` SVG with explicit `:width="svgWidth * zoom"` so the SVG overflows its
container when zoomed in. Container uses `overflow: auto` for native scrolling.
Ctrl+scroll / two-finger pinch zooms centred at the cursor (`nextTick` scroll re-anchor).
Zoom buttons (+/−/↺) floated bottom-right. Zoom range: 0.2×–5×.
Shared composable extracted to `useChartZoom.ts`.

### Zoom persistence across navigation
`<router-view :key="$route.fullPath" />` causes full remount on every navigation, resetting zoom.
Fixed by persisting zoom to `localStorage` keyed per chart (`viz-zoom-pedigree`,
`viz-zoom-hourglass`, `viz-zoom-timeline`). `resetZoom()` resets to `defaultZoom=1`, not saved value.

### Spouses in hourglass view
`fetchHourglassTree` fetches couple relationships and resolves spouse `PersonNode`s.
Spouses are placed to the right of focal at the same row, connected by a horizontal line.
`svgWidth = max(baseSvgWidth, spouseRightEdge)` so ancestors/descendants stay centred while
spouses extend rightward without clipping.

## Files Changed
- `src/renderer/utils/chartLayout.ts` — ahnentafel PedigreeTree, DescendantNode, HourglassTree with spouses; general N-gen layout math; spouse placement
- `src/renderer/utils/chartData.ts` — recursive fetchPedigreeTree/fetchDescendantTree/fetchHourglassTree with spouse resolution
- `src/renderer/utils/useChartZoom.ts` — localStorage persistence via storageKey param
- `src/renderer/components/charts/PedigreeChart.vue` — scroll/zoom wiring, zoom storage key
- `src/renderer/components/charts/HourglassChart.vue` — scroll/zoom wiring, zoom storage key
- `src/renderer/components/charts/TimelineChart.vue` — scroll/zoom wiring, zoom storage key
- `tests/unit/chartLayout.test.ts` — rewritten for new API; spouse placement tests added
