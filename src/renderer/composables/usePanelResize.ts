import { ref, onUnmounted } from 'vue';

const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MAX_WIDTH_RATIO = 0.75;
const DEFAULT_WIDTH = 300;
const DEFAULT_STORAGE_KEY = 'viz-panel-width';

export interface PanelResizeOptions {
  storageKey?: string;
  minWidth?: number;
  maxWidthRatio?: number;
  defaultWidth?: number;
  /** Which side of the container the panel is anchored to. Affects how
   *  drag-distance maps to width. Defaults to 'right'. */
  side?: 'left' | 'right';
}

export function clampWidth(w: number, maxWidth: number, minWidth = DEFAULT_MIN_WIDTH): number {
  return Math.min(maxWidth, Math.max(minWidth, w));
}

export function usePanelResize(options: PanelResizeOptions = {}) {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidthRatio = options.maxWidthRatio ?? DEFAULT_MAX_WIDTH_RATIO;
  const defaultWidth = options.defaultWidth ?? DEFAULT_WIDTH;
  const side = options.side ?? 'right';

  const stored = parseInt(localStorage.getItem(storageKey) ?? '', 10);
  const panelWidth = ref(isNaN(stored) ? defaultWidth : Math.max(minWidth, stored));

  let rafId: number | null = null;
  let cleanup: (() => void) | null = null;

  function startResize(e: MouseEvent, containerEl: HTMLElement) {
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = containerEl.getBoundingClientRect();
        const maxW = rect.width * maxWidthRatio;
        const raw = side === 'left'
          ? ev.clientX - rect.left
          : rect.right - ev.clientX;
        panelWidth.value = clampWidth(raw, maxW, minWidth);
      });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      cleanup = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      localStorage.setItem(storageKey, String(panelWidth.value));
    }

    cleanup = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    cleanup?.();
  });

  return { panelWidth, startResize };
}
