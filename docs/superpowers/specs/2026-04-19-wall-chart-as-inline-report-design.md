# Wall Chart as Inline Report — Design

**Date:** 2026-04-19
**Status:** Approved, ready for implementation plan

## Problem

The wall chart feature has a unique configuration interface that doesn't match the rest of the app:

1. It has a **button in `VisualizationView`** (the family tree page) that opens a modal — this conflates "interactive tree" with "export artefact."
2. It has a **tab in `ReportsView`** that, instead of rendering inline like every other report tab, opens the same modal.

Wall charts are functionally exports (large-format, multi-page, intended for printing/saving). They belong with the other report exports and should follow the same UX pattern.

## Goal

- Remove the wall chart button from `VisualizationView.vue` entirely.
- In `ReportsView.vue`, make the wall chart tab render inline using the same layout as every other report tab:
  - Configuration options in the `tab-header > controls` row above the preview.
  - Paper-shaped preview rendering directly in the page (no modal), scaled to fit via the existing `ZoomControls`.
  - Export buttons in the `print-actions` slot.
- Delete `WallChartModal.vue`.

## Non-goals

- Changing wall chart generation logic (`src/api/wall-charts.ts`) — out of scope.
- Changing the SVG/Tiled-PDF export mechanics — they keep working as today.
- Adding new wall chart options or removing existing ones.
- Changing other report tabs.

## Architecture

### Components

| Component | Role |
|-----------|------|
| `ReportsView.vue` | Owns `wallOptions` reactive, the controls row, the export buttons, and the paper-sized preview wrapper. |
| `WallChartReport.vue` *(new)* | Sibling of `CircleChartReport`, `PedigreeChartReport`, etc. Takes `personId` + all 11 wall chart options as props. Internally fetches the tree, debounces regeneration, renders the SVG, and emits `tilesChanged`. |
| `WallChartModal.vue` *(deleted)* | All logic moved into `WallChartReport.vue` + `ReportsView.vue`. |
| `VisualizationView.vue` | Wall chart button + modal instance + import + ref are removed. No other changes. |

### Data flow

```
ReportsView (owns wallOptions reactive, paper dims, fitZoom)
    │
    ├── tab-header > controls   ← 11 option inputs bound to wallOptions
    ├── tab-header > print-actions   ← Export SVG / Export Tiled PDF buttons
    └── preview-area
         └── .print-preview (width: paperWidthMm, zoom: effectiveZoom)
              └── WallChartReport (props: personId + wallOptions)
                   ├── watch(props, regenerate, { deep: true }) — 400ms debounce
                   ├── fetchWallChartAncestorTree / fetchWallChartDescendantTree
                   ├── generatePedigreeWallChart / generateDescendantWallChart
                   └── <div v-html="svgContent" />
                          + emit('tilesChanged', tileInfo)
```

### Configuration options (11)

All bound to a single `reactive` `wallOptions` object in `ReportsView.vue`:

| Option | Type | Notes |
|--------|------|-------|
| `chartType` | `'pedigree' \| 'descendant'` | Drives generation min/max |
| `paperSize` | `'A4' \| 'A3' \| 'A2' \| 'A1' \| 'A0' \| 'custom'` | Drives preview dimensions |
| `customWidth` | `number` (mm) | Shown only when `paperSize === 'custom'` |
| `customHeight` | `number` (mm) | Shown only when `paperSize === 'custom'` |
| `orientation` | `'portrait' \| 'landscape'` | Swaps preview width/height |
| `generations` | `number` | Range slider; min/max depends on `chartType` (3–12 / 2–8) |
| `showDates` | `boolean` | Checkbox |
| `showPlaces` | `boolean` | Checkbox |
| `showPhotos` | `boolean` | Checkbox |
| `fontSize` | `'small' \| 'medium' \| 'large'` | Select |
| `colorMode` | `'themed' \| 'bw' \| 'sex-colored'` | Select |
| `title` | `string` | Text input |

Defaults match the current `WallChartModal.vue`.

### Preview sizing

The other report tabs use a fixed `width: 210mm` (A4 portrait) preview wrapper and rely on a `ResizeObserver` to compute `fitZoom = clientWidth / NATURAL_WIDTH` (where `NATURAL_WIDTH = 794` ≈ A4 in pixels at 96 dpi).

For the wall chart tab, both the paper width and the natural pixel width become **computed values** derived from `wallOptions.paperSize` + `orientation` + (optionally) `customWidth`/`customHeight`:

```ts
const paperDims = computed(() => getPaperDimensions(wallOptions));   // { width, height } in mm
const paperWidthMm  = computed(() => `${paperDims.value.width}mm`);
const paperHeightMm = computed(() => `${paperDims.value.height}mm`);
const naturalWidthPx = computed(() => Math.round(paperDims.value.width * 3.7795275591));
```

The existing `fitZoom` ResizeObserver math is unchanged — it just reads the new `naturalWidthPx` instead of the constant `794` when the active tab is `wallChart`. (Refactor `NATURAL_WIDTH` from a const to a per-tab computed; A4 is the default for tabs that don't override.)

When the user picks A0 landscape (1189×841 mm), the preview wrapper resizes to 1189mm × 841mm, the ResizeObserver picks up the new natural width, and `fitZoom` scales it down to fit the container. ZoomControls' "+ / – / fit" buttons keep working.

### Tile-info hint

`WallChartReport` computes `tileInfo` (count, rows, cols) from `computeTileViewBoxes()` and emits it via `tilesChanged`. `ReportsView` displays it as a small text under `ZoomControls` when present:

```
"3 tiles needed (2 cols × 2 rows)"
```

i18n key already exists: `wallChart.tilesNeeded`.

### Export buttons

The `print-actions` slot in the wallChart tab's `tab-header` shows two buttons (replacing the standard `Print` + `Export PDF` of other tabs):

- **Export SVG** → calls `window.api.wallChart.saveSvg(svgContent)`
- **Export Tiled PDF** → calls `computeTileViewBoxes()` + `generateTileSvg()` + `window.api.wallChart.saveTiledPdf(pages)`

Export handlers live in `ReportsView.vue`, matching how `printCurrent` / `exportPdf` already live there. `WallChartReport` emits `svgGenerated(svgContent)` after each successful regeneration; `ReportsView` caches the latest SVG in a `currentSvg` ref. `paperDims` is already a `computed` in `ReportsView` (needed for the preview wrapper), so it's reused for `computeTileViewBoxes`.

## File changes

| File | Change |
|------|--------|
| `src/renderer/views/ReportsView.vue` | Replace the modal-trigger wallChart tab body with inline structure (controls row + paper-sized preview + export buttons). Add `wallOptions` reactive, `paperDims` computed, `currentSvg` ref, export handlers. Make `NATURAL_WIDTH` per-tab (computed from `paperDims` for wallChart; constant 794 elsewhere). |
| `src/renderer/views/VisualizationView.vue` | Remove: line 36–38 button, line 124–129 `<WallChartModal>`, line 153 import, line 188 `showWallChartModal` ref. |
| `src/renderer/components/reports/WallChartReport.vue` *(new)* | Props: `personId` + 11 wall chart options. Watches props with 400ms debounce, calls fetch + generate, emits `svgGenerated` and `tilesChanged`. Renders SVG via `v-html`. |
| `src/renderer/components/reports/WallChartModal.vue` | **Delete.** |
| `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` | Keep all `wallChart.*` keys (still used by the inline UI). For the "no person selected" empty state, use `reports.selectPersonFirst` (matches the other report tabs); the modal-specific `wallChart.noPreview` key is no longer referenced and can be removed. |

## Testing

- Existing unit tests for `src/api/wall-charts.ts` (chart generation, paper dims, tiling) are unaffected.
- New manual E2E pass: navigate to `/reports?tab=wallChart`, change every option, verify preview updates with a 400ms debounce, verify Export SVG and Export Tiled PDF still produce correct files, verify A0 landscape renders without breaking layout.
- Verify `VisualizationView` no longer references `WallChartModal` (TypeScript compilation will catch leftover references).

## Open questions / risks

- **Preview cost at high generations:** A 12-generation pedigree wall chart on A0 generates a large SVG (potentially MB-scale). Today the modal hides this behind a click; the inline tab will render it whenever a person is selected and the user is on the wallChart tab. If this becomes a perf issue we can add a "Generate preview" button — but YAGNI for v1; the 400ms debounce should be sufficient for normal interactive use.
- **Controls row wrap:** With 11 options, the controls row will wrap to 2–3 lines on narrow windows. This is an accepted trade-off; the existing `flex-wrap: wrap` handles it cleanly.

## Out of scope (future work)

- A "preset" system (Save these wall chart settings as "Bengt's family A2 portrait")
- Per-tab persistence of the user's wall chart options across sessions
- Tile boundary overlay drawn on the preview
