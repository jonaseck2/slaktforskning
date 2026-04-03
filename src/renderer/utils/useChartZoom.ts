// src/renderer/utils/useChartZoom.ts
// Shared zoom/pan composable for chart components.
// - Regular scroll: native browser scroll (panning)
// - Ctrl+scroll or two-finger pinch (macOS): zoom centered at cursor
import { ref, nextTick } from 'vue';

export function useChartZoom(defaultZoom = 1) {
  const zoom = ref(defaultZoom);
  const scrollRef = ref<HTMLDivElement | null>(null);

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

  function zoomIn()    { zoom.value = Math.min(5, zoom.value * 1.25); }
  function zoomOut()   { zoom.value = Math.max(0.2, zoom.value / 1.25); }
  function resetZoom() { zoom.value = 1; }

  return { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom };
}
