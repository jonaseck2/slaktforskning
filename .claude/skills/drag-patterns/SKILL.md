---
name: drag-patterns
description: Hard-won patterns for implementing drag interactions (move / resize / pan) in Vue components — especially inside CSS-transformed containers like the image-tagger overlay, the chart pan/zoom canvas, the resize-handle column splitter, and the panel resizer. Use whenever wiring `mousedown` / `mousemove` / `mouseup` (or pointer-equivalents) for anything the user has to drag. Covers window-level listeners, separating listener cleanup from state, pointer-events kill during drag, screen-pixel math, percentage positioning for overlays, async-reload races, and image-dimension guards.
---

# Drag / mouse handling patterns

These patterns come from the image-tagger overlay (resize tag rectangles inside a CSS-scaled image), the resizable-columns work, and the panel-width drag. Every one was earned the hard way; treat them as defaults, not optional.

## 1. Window listeners for drag — never element-level

Never rely on element-level `mousemove` / `mouseup` for drag — the mouse leaves the element during fast movement and the drag dies mid-gesture. Always use `window.addEventListener` for the duration of the drag.

**Why:** element boundaries don't track the cursor during fast drags. Especially problematic inside CSS-transformed containers where pointer-events on child elements interfere — the cursor can exit the element body in under one animation frame.

**How to apply:** on `mousedown`, attach window-level `mousemove` + `mouseup` listeners. On `mouseup`, remove them. Keep a cleanup function so you can `removeEventListener` with the exact same handler reference.

## 2. Separate listener cleanup from state cleanup

`clearWindowListeners()` must NEVER reset reactive state (like `dragMode`). Keep listener cleanup and state cleanup as separate functions.

**Why:** `startDrag` typically does `dragMode.value = 'move'` then calls `attachWindowListeners()`, which internally calls `clearWindowListeners()` to guard against double-attach. If `clearWindowListeners` resets `dragMode`, the state is nullified the moment after being set, and the drag handlers see `dragMode === null` and bail.

**How to apply:** `clearWindowListeners()` only does `removeEventListener`. A separate `resetDragState()` clears the reactive refs. Call them together only at natural boundaries (component unmount, explicit cancel button).

## 3. Disable ALL pointer-events during drag via a CSS class

During a drag, add a `.dragging` class to the container and write:

```css
.container.dragging,
.container.dragging * {
  pointer-events: none !important;
}
```

**Why:** during a resize contraction (or any non-trivial movement), the mouse crosses over the element body, child elements, opposite-edge resize handles, even sibling elements. Any of these with `pointer-events` can intercept `mousedown` and start a new conflicting drag — leading to "drag suddenly snaps to the other corner" bugs. The `!important` plus `*` selector ensure nothing intercepts.

**How to apply:** gate the class on the `dragMode` ref (`:class="{ dragging: dragMode }"`). Window-level listeners handle the actual movement, so no element needs `pointer-events` during the drag.

## 4. Use screen pixels for drag math; convert on save only

During drag, compute positions using raw `e.clientX / e.clientY` deltas (screen pixels). Cache the display dimensions at drag start. Only convert to fractional / percentage / DB coords on `mouseup` when saving.

**Why:** if the source content is displayed at 1/4 natural size (e.g. a 4000px image shown in a 1000px frame), converting through natural dimensions amplifies 1 screen pixel of mouse movement to 4 content pixels, causing visible stepping. Screen pixels give 1:1 mouse tracking.

**How to apply:**

```ts
function startDrag(e: MouseEvent) {
  dragOrigin = { x: e.clientX, y: e.clientY };
  startRect = { ...currentRect };  // in screen pixels
  // cache display dimensions
  displayWidth = overlayEl.clientWidth;
  displayHeight = overlayEl.clientHeight;
}

function onDrag(e: MouseEvent) {
  const dx = e.clientX - dragOrigin.x;
  const dy = e.clientY - dragOrigin.y;
  dragLiveRect = {
    x: startRect.x + dx,
    y: startRect.y + dy,
    // ...
  };
}

function finishDrag() {
  // Convert to fractions ONLY here
  const fractionalX = dragLiveRect.x / displayWidth;
  const fractionalY = dragLiveRect.y / displayHeight;
  saveToDb({ x: fractionalX, y: fractionalY });
}
```

## 5. Percentage positioning for overlays inside transformed containers

Position overlay elements with `left: 30%` not `left: 1200px`. The overlay has `position: absolute; inset: 0` matching its container's display size.

**Why:** pixel positioning uses natural content dimensions, but the container displays at a different size. Percentages are relative to the actual display size, so they work at any zoom level — and they survive the user resizing the window mid-session without a re-render.

## 6. Guard against stuck state from async reloads

After a drag completes, the DB save and downstream `useEntityData` reload are async. Keep visual state (`dragLiveRect`) alive until the underlying `regions` / `entities` prop actually updates (via a `watch` on the prop). But **guard the watch with `if (!dragMode.value)`** so it doesn't kill an in-progress drag.

**Why:** without the guard, an unrelated reload — e.g. creating a new tag via draw mode while a different tag is being moved — can wipe the live drag state mid-gesture. The watch fires on any prop change, including ones triggered by other interactions.

```ts
watch(() => props.regions, () => {
  if (!dragMode.value) {
    dragLiveRect.value = null;  // safe: no drag in progress
  }
  // else: keep dragLiveRect; the prop change is from someone else
});
```

## 7. Race condition: guard overlay rendering on image dimensions

Add `v-if="imgNaturalWidth > 0"` (or equivalent) on any overlay component whose math depends on the image's natural dimensions. The image's `@load` event sets dimensions asynchronously — without the guard, the overlay renders with `imageWidth = 0` and all coordinate math produces zeroes (everything collapses to the top-left corner).

## Where these patterns ship

- `src/renderer/components/media/RegionOverlay.vue` — image-tagger resize/move handles
- `src/renderer/components/chart/PanZoomContainer.vue` — chart pan/zoom canvas
- `src/renderer/components/layout/ResizableColumn.vue` — column splitter handle
- Any panel resizer that drags a divider

If you build a new drag interaction, diff against the closest existing one — these files have already been hardened through several rounds of "fast drag exits the element" / "drag dies on reload" / "overlay snaps to wrong corner" bug-fixes.
