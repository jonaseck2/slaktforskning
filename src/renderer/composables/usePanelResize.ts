import { ref, onUnmounted } from 'vue';

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 300;
const STORAGE_KEY = 'viz-panel-width';

export function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

export function usePanelResize() {
  const stored = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10);
  const panelWidth = ref(clampWidth(isNaN(stored) ? DEFAULT_WIDTH : stored));

  let rafId: number | null = null;

  function startResize(e: MouseEvent, containerEl: HTMLElement) {
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const right = containerEl.getBoundingClientRect().right;
        panelWidth.value = clampWidth(right - ev.clientX);
      });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      localStorage.setItem(STORAGE_KEY, String(panelWidth.value));
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return { panelWidth, startResize };
}
