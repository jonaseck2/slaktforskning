import { ref, computed } from 'vue';

const ZOOM_STEP = 1.25;
const MAX_ZOOM = 5;

export function useImageZoom() {
  const zoom = ref(1);
  const panX = ref(0);
  const panY = ref(0);
  const minZoom = ref(1);

  const isFitMode = computed(() => zoom.value === 1 && panX.value === 0 && panY.value === 0);
  const zoomPercent = computed(() => Math.round(zoom.value * 100) + '%');

  function setMinZoom(val: number) {
    minZoom.value = val;
  }

  function zoomIn() {
    zoom.value = Math.min(zoom.value * ZOOM_STEP, MAX_ZOOM);
  }

  function zoomOut() {
    zoom.value = Math.max(zoom.value / ZOOM_STEP, minZoom.value);
  }

  function fitToContainer() {
    zoom.value = 1;
    panX.value = 0;
    panY.value = 0;
  }

  function setPan(x: number, y: number) {
    panX.value = x;
    panY.value = y;
  }

  function onWheel(e: WheelEvent, containerRect: DOMRect) {
    e.preventDefault();
    const oldZoom = zoom.value;
    const newZoom = e.deltaY < 0
      ? Math.min(oldZoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(oldZoom / ZOOM_STEP, minZoom.value);

    if (newZoom === oldZoom) return;

    const cx = e.clientX - containerRect.left;
    const cy = e.clientY - containerRect.top;
    const scale = newZoom / oldZoom;
    panX.value = cx - scale * (cx - panX.value);
    panY.value = cy - scale * (cy - panY.value);
    zoom.value = newZoom;
  }

  return {
    zoom, panX, panY, minZoom,
    isFitMode, zoomPercent,
    setMinZoom, zoomIn, zoomOut, fitToContainer, setPan, onWheel,
  };
}
