# Media Viewer & Face Tagging

## Summary

Replace the modal lightbox with an inline image viewer in the left sheet of MediaView. Add a bottom filmstrip for navigation, zoom/pan controls, and face tag drawing on the image canvas. The right MediaPanel stays open for editing throughout.

## Entry / Exit

- **Enter viewer mode**: expand button (⛶) on gallery card, or double-click a card
- **Exit viewer mode**: close button (✕) in the viewer toolbar — returns to gallery grid
- Keyboard: `Escape` closes viewer mode
- The right MediaPanel stays open and synced — switching images in the filmstrip updates the panel

## Layout (Left Sheet — Viewer Mode)

Three stacked zones replace the gallery grid:

### 1. Toolbar (top, fixed height ~36px)

- Filename (truncated with ellipsis)
- Counter: `3 / 24`
- Zoom controls: `−` / percentage / `+` / `Fit` button
- Close button: `✕`

### 2. Image Canvas (flex: 1, fills remaining space)

- **Zoom**: scroll wheel zooms centered on cursor
- **Pan**: click-drag moves the image when zoomed in
- **Fit mode**: image scaled to fit the container (default on open)
- **Navigation**: left/right arrow buttons (subtle, appear on hover), arrow keys
- Face tag overlays rendered as positioned `<div>` elements over the image (not `<canvas>`) — dashed border, name label below, color-coded (blue = identified, amber = unidentified)

### 3. Filmstrip (bottom, fixed height ~64px)

- Horizontal scrollable strip of 48×48 thumbnails
- Uses the same `filteredItems` as the gallery grid (respects search filter)
- Selected item has accent border highlight
- Click a thumbnail → switch to that image (updates viewer + panel)
- Auto-scrolls to keep selected item visible

## Face Tagging

### Data Model (existing)

`media_regions` table already exists with `x, y, width, height` as 0.0–1.0 fractions, `person_id` (nullable), and `label`. No schema changes needed.

### Drawing Workflow

1. Click `+ Draw` button in the Face Tags section of MediaPanel
2. Cursor changes to crosshair over the image canvas
3. Click-drag to draw a rectangle — visual feedback during drag (dashed blue outline)
4. On mouse-up: a PersonPicker popover appears near the drawn region
5. Select a person → region saved with `person_id`, shown as blue overlay with name
6. Skip / click away → region saved without `person_id`, shown as amber "?" overlay
7. Draw mode stays active for batch tagging — click `Done` or `Escape` to exit

### Region Display

- Regions rendered as absolutely-positioned `<div>` overlays on the image container
- Position/size calculated from fractional coordinates × displayed image dimensions
- Recalculated on zoom/pan changes
- Hover a region on image → highlights corresponding row in panel's Face Tags list
- Click a region row in panel → scrolls/highlights region on image (subtle pulse animation)

### Region Editing

- Click an existing region overlay on the image → selects it in panel
- Delete via ✕ button in the panel's Face Tags list
- Reassign person via clicking the person name/avatar in the panel row → PersonPicker
- No resize/move of existing regions in v1 (keep it simple)

## Components

### New: `MediaViewer.vue`

Replaces the gallery grid when viewer mode is active. Lives in `src/renderer/components/`.

**Props**: `mediaItems: MediaItem[]`, `initialIndex: number`
**Emits**: `close`, `update:currentIndex`

Contains:
- Toolbar with zoom controls and close button
- Image container with zoom/pan (CSS transform based)
- Face tag overlay layer
- Bottom filmstrip

### New: `FaceTagOverlay.vue`

Renders face tag regions over the image. Handles draw mode.

**Props**: `regions: MediaRegion[]`, `imageRect: DOMRect`, `drawMode: boolean`, `zoom: number`, `panX: number`, `panY: number`
**Emits**: `regionDrawn({ x, y, width, height })`, `regionClicked(regionId)`

### Modified: `MediaView.vue`

- Add `viewerMode` ref (boolean) and `viewerIndex` ref
- When `viewerMode` is true, render `<MediaViewer>` instead of gallery grid
- Expand button and double-click set `viewerMode = true` + `viewerIndex`
- MediaViewer close emits `viewerMode = false`
- Remove `<MediaLightbox>` usage entirely (replaced by viewer)

### Modified: `MediaPanel.vue`

- Face Tags section: add `+ Draw` button that emits `startDrawMode`
- Face tag rows: clickable to highlight on image, ✕ to delete, click person to reassign
- New emit: `startDrawMode`, `highlightRegion(regionId)`

### Modified: `MediaView.vue` (coordination)

- Passes `drawMode` state between MediaPanel and MediaViewer
- When MediaPanel emits `startDrawMode`, sets a shared ref that MediaViewer reads
- When MediaViewer emits `regionDrawn`, creates the region via API and refreshes panel

## Zoom/Pan Implementation

CSS transform-based (no canvas):
- `transform: scale(zoom) translate(panX, panY)` on the image element
- `transform-origin: 0 0` for predictable math
- Scroll wheel: adjust zoom level, keep cursor position stable
- Drag: adjust panX/panY when zoomed > fit
- Fit button: reset to container-fit scale, center
- Min zoom: fit-to-container, max zoom: 500%

Face tag overlays must track the same transform — position them relative to the image's natural dimensions, then the shared CSS transform handles the rest.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Exit viewer mode (or exit draw mode if active) |
| `←` / `→` | Previous / next image |
| `+` / `-` | Zoom in / out |
| `0` | Fit to container |

## What This Replaces

- `MediaLightbox.vue` becomes unused — the inline viewer replaces it entirely
- The modal overlay pattern is gone; everything happens inline in the left sheet
- The gallery grid hides when viewer is active, shows when viewer is closed

## Out of Scope (v1)

- AI-assisted face detection (future enhancement)
- Resize/move existing face tag regions
- Face tag suggestions based on other tagged photos
- Crop/rotate/edit image tools
