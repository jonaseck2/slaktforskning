// src/renderer/utils/useChartZoom.ts
// Shared zoom/pan composable for chart components.
// - Regular scroll: native browser scroll (panning)
// - Mouse drag: drag-to-pan (updates scrollLeft/scrollTop)
// - Ctrl+scroll or two-finger pinch (macOS): zoom centred at cursor
// - zoom persisted to localStorage so navigation doesn't reset it
import { ref, watch, nextTick } from 'vue';

export function useChartZoom(defaultZoom = 1, storageKey?: string) {
  const saved = storageKey ? parseFloat(localStorage.getItem(storageKey) ?? '') : NaN;
  const zoom = ref(Number.isFinite(saved) ? saved : defaultZoom);
  const scrollRef = ref<HTMLDivElement | null>(null);

  if (storageKey) {
    watch(zoom, (v) => localStorage.setItem(storageKey, String(v)));
  }

  function onWheel(e: WheelEvent) {
    // Only intercept Ctrl+wheel (also catches macOS trackpad pinch)
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const scroller = scrollRef.value;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    // Mouse position within the scroll viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    // Logical SVG coordinate currently under the cursor
    const logicalX = (scroller.scrollLeft + mouseX) / zoom.value;
    const logicalY = (scroller.scrollTop + mouseY) / zoom.value;

    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.2, Math.min(5, zoom.value * factor));
    zoom.value = newZoom;

    // Re-anchor scroll so the same logical point stays under the cursor
    nextTick(() => {
      if (!scrollRef.value) return;
      scrollRef.value.scrollLeft = logicalX * newZoom - mouseX;
      scrollRef.value.scrollTop  = logicalY * newZoom - mouseY;
    });
  }

  function applyZoom(factor: number) {
    const scroller = scrollRef.value;
    if (!scroller) {
      zoom.value = Math.max(0.2, Math.min(5, zoom.value * factor));
      return;
    }
    const { clientWidth, clientHeight, scrollLeft, scrollTop } = scroller;
    // Anchor to center of visible area
    const cx = clientWidth / 2;
    const cy = clientHeight / 2;
    const logicalX = (scrollLeft + cx) / zoom.value;
    const logicalY = (scrollTop  + cy) / zoom.value;
    const newZoom = Math.max(0.2, Math.min(5, zoom.value * factor));
    zoom.value = newZoom;
    nextTick(() => {
      if (!scrollRef.value) return;
      scrollRef.value.scrollLeft = logicalX * newZoom - cx;
      scrollRef.value.scrollTop  = logicalY * newZoom - cy;
    });
  }

  function zoomIn()    { applyZoom(1.25); }
  function zoomOut()   { applyZoom(1 / 1.25); }
  function resetZoom() { zoom.value = defaultZoom; }

  // --- Drag-to-pan ---
  // isPanning only becomes true once the mouse has moved, so a plain click
  // never changes the cursor to "grabbing" (which felt like a lock to users).
  const isPanning = ref(false);
  const panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0, pending: false };

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const scroller = scrollRef.value;
    if (!scroller) return;
    panStart.x = e.clientX;
    panStart.y = e.clientY;
    panStart.scrollLeft = scroller.scrollLeft;
    panStart.scrollTop  = scroller.scrollTop;
    panStart.pending = true;
    e.preventDefault(); // prevent text-selection drag
  }

  function onMouseMove(e: MouseEvent) {
    if (!panStart.pending) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    // Activate panning only after a real drag (not a micro-jitter from a click)
    if (!isPanning.value && Math.hypot(dx, dy) < 4) return;
    isPanning.value = true;
    const scroller = scrollRef.value;
    if (!scroller) return;
    scroller.scrollLeft = panStart.scrollLeft - dx;
    scroller.scrollTop  = panStart.scrollTop  - dy;
  }

  function onMouseUp() {
    isPanning.value = false;
    panStart.pending = false;
  }

  return { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp };
}
