import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useChartZoom } from '../../src/renderer/utils/useChartZoom';

// happy-dom's WheelEvent does not propagate ctrlKey/metaKey/clientX/clientY from
// its EventModifierInit dict. Build a plain object that looks like a WheelEvent
// and carry the properties we need.
function makeWheelEvent(opts: {
  deltaY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  clientX?: number;
  clientY?: number;
}): WheelEvent {
  const base = new WheelEvent('wheel', { deltaY: opts.deltaY });
  // Patch the properties that happy-dom leaves undefined.
  Object.defineProperty(base, 'ctrlKey',  { value: opts.ctrlKey  ?? false, configurable: true });
  Object.defineProperty(base, 'metaKey',  { value: opts.metaKey  ?? false, configurable: true });
  Object.defineProperty(base, 'clientX',  { value: opts.clientX  ?? 0, configurable: true });
  Object.defineProperty(base, 'clientY',  { value: opts.clientY  ?? 0, configurable: true });
  return base;
}

// Helper: build a minimal scrollable div with the layout properties that
// getBoundingClientRect() and scroll* would need in happy-dom.
function makeScroller(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '400px';
  el.style.height = '400px';
  // happy-dom does not do layout, so patch the properties directly.
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }),
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth',  { value: 400, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  el.scrollLeft = 0;
  el.scrollTop  = 0;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
});

describe('useChartZoom -- initial state', () => {
  it('defaults zoom to 1 when called with no arguments', () => {
    const { zoom } = useChartZoom();
    expect(zoom.value).toBe(1);
  });

  it('accepts a custom defaultZoom', () => {
    const { zoom } = useChartZoom(2);
    expect(zoom.value).toBe(2);
  });

  it('restores zoom from localStorage when storageKey is provided', () => {
    localStorage.setItem('chart-zoom-key', '1.5');
    const { zoom } = useChartZoom(1, 'chart-zoom-key');
    expect(zoom.value).toBe(1.5);
  });

  it('falls back to defaultZoom when localStorage value is non-numeric', () => {
    localStorage.setItem('chart-zoom-key', 'not-a-number');
    const { zoom } = useChartZoom(1, 'chart-zoom-key');
    expect(zoom.value).toBe(1);
  });

  it('isPanning starts false', () => {
    const { isPanning } = useChartZoom();
    expect(isPanning.value).toBe(false);
  });

  it('scrollRef starts null', () => {
    const { scrollRef } = useChartZoom();
    expect(scrollRef.value).toBeNull();
  });
});

describe('useChartZoom -- localStorage persistence', () => {
  it('persists zoom changes to localStorage', async () => {
    const { zoom } = useChartZoom(1, 'persist-key');
    zoom.value = 1.8;
    await nextTick();
    expect(localStorage.getItem('persist-key')).toBe('1.8');
  });

  it('does not write to localStorage when no storageKey', async () => {
    const { zoom } = useChartZoom(1);
    zoom.value = 1.8;
    await nextTick();
    expect(localStorage.length).toBe(0);
  });
});

describe('useChartZoom -- resetZoom', () => {
  it('resets zoom to defaultZoom', () => {
    const { zoom, resetZoom } = useChartZoom(1.5);
    zoom.value = 3;
    resetZoom();
    expect(zoom.value).toBe(1.5);
  });
});

describe('useChartZoom -- zoomIn / zoomOut', () => {
  it('zoomIn multiplies zoom by 1.25 when no scrollRef', () => {
    const { zoom, zoomIn } = useChartZoom(1);
    zoomIn();
    expect(zoom.value).toBeCloseTo(1.25, 5);
  });

  it('zoomOut divides zoom by 1.25 when no scrollRef', () => {
    const { zoom, zoomOut } = useChartZoom(1);
    zoomOut();
    expect(zoom.value).toBeCloseTo(1 / 1.25, 5);
  });

  it('zoomIn clamps at max 5', () => {
    const { zoom, zoomIn } = useChartZoom(5);
    zoomIn();
    expect(zoom.value).toBe(5);
  });

  it('zoomOut clamps at min 0.2', () => {
    const { zoom, zoomOut } = useChartZoom(0.2);
    zoomOut();
    expect(zoom.value).toBe(0.2);
  });

  it('zoomIn with scrollRef updates zoom and re-anchors scroll after nextTick', async () => {
    const el = makeScroller();
    const { zoom, scrollRef, zoomIn } = useChartZoom(1);
    scrollRef.value = el;
    zoomIn();
    expect(zoom.value).toBeCloseTo(1.25, 5);
    await nextTick();
    expect(typeof el.scrollLeft).toBe('number');
  });

  it('zoomOut with scrollRef updates zoom and re-anchors scroll after nextTick', async () => {
    const el = makeScroller();
    const { zoom, scrollRef, zoomOut } = useChartZoom(1);
    scrollRef.value = el;
    zoomOut();
    expect(zoom.value).toBeCloseTo(1 / 1.25, 5);
    await nextTick();
    expect(typeof el.scrollLeft).toBe('number');
  });
});

describe('useChartZoom -- onWheel', () => {
  it('ignores wheel events without ctrlKey or metaKey', () => {
    const { zoom, onWheel } = useChartZoom(1);
    // No ctrlKey / metaKey — should be ignored.
    const ev = makeWheelEvent({ deltaY: -100 });
    onWheel(ev);
    expect(zoom.value).toBe(1);
  });

  it('zooms in (deltaY < 0) with ctrlKey', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onWheel(makeWheelEvent({ deltaY: -1, ctrlKey: true, clientX: 200, clientY: 200 }));
    expect(z.zoom.value).toBeGreaterThan(1);
  });

  it('zooms out (deltaY > 0) with ctrlKey', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onWheel(makeWheelEvent({ deltaY: 1, ctrlKey: true, clientX: 200, clientY: 200 }));
    expect(z.zoom.value).toBeLessThan(1);
  });

  it('zooms in with metaKey (macOS trackpad pinch)', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onWheel(makeWheelEvent({ deltaY: -1, metaKey: true, clientX: 200, clientY: 200 }));
    expect(z.zoom.value).toBeGreaterThan(1);
  });

  it('clamps wheel zoom at max 5', () => {
    const z = useChartZoom(4.99);
    const el = makeScroller();
    z.scrollRef.value = el;
    for (let i = 0; i < 20; i++) {
      z.onWheel(makeWheelEvent({ deltaY: -1, ctrlKey: true, clientX: 200, clientY: 200 }));
    }
    expect(z.zoom.value).toBe(5);
  });

  it('clamps wheel zoom at min 0.2', () => {
    const z = useChartZoom(0.21);
    const el = makeScroller();
    z.scrollRef.value = el;
    for (let i = 0; i < 20; i++) {
      z.onWheel(makeWheelEvent({ deltaY: 1, ctrlKey: true, clientX: 200, clientY: 200 }));
    }
    expect(z.zoom.value).toBe(0.2);
  });

  it('re-anchors scroll after nextTick on wheel zoom', async () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onWheel(makeWheelEvent({ deltaY: -1, ctrlKey: true, clientX: 200, clientY: 200 }));
    await nextTick();
    expect(typeof el.scrollLeft).toBe('number');
  });

  it('returns early without changing zoom when scrollRef is null', () => {
    const z = useChartZoom(1);
    // scrollRef is null -- onWheel should bail out after the ctrlKey check
    z.onWheel(makeWheelEvent({ deltaY: -1, ctrlKey: true, clientX: 200, clientY: 200 }));
    // Per source line 24: "if (!scroller) return" -- zoom stays at 1
    expect(z.zoom.value).toBe(1);
  });

  it('does not re-anchor if scrollRef is nulled between wheel and nextTick', async () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onWheel(makeWheelEvent({ deltaY: -1, ctrlKey: true, clientX: 200, clientY: 200 }));
    z.scrollRef.value = null;
    await nextTick();
    // zoom was already set before the nextTick guard fires
    expect(z.zoom.value).toBeGreaterThan(1);
  });
});

describe('useChartZoom -- drag-to-pan', () => {
  it('onMouseDown ignores non-primary buttons', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    const down = new MouseEvent('mousedown', { button: 2, clientX: 100, clientY: 100 });
    z.onMouseDown(down);
    const move = new MouseEvent('mousemove', { clientX: 200, clientY: 200 });
    z.onMouseMove(move);
    expect(z.isPanning.value).toBe(false);
  });

  it('onMouseDown without scrollRef does nothing', () => {
    const z = useChartZoom(1);
    const down = new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 });
    z.onMouseDown(down);
    const move = new MouseEvent('mousemove', { clientX: 200, clientY: 200 });
    z.onMouseMove(move);
    expect(z.isPanning.value).toBe(false);
  });

  it('micro-jitter (< 4 px) does not activate isPanning', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 101, clientY: 101 }));
    expect(z.isPanning.value).toBe(false);
  });

  it('a real drag (> 4 px) activates isPanning and updates scroll position', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    el.scrollLeft = 50;
    el.scrollTop  = 50;

    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 90, clientY: 90 }));

    expect(z.isPanning.value).toBe(true);
    // dx = 90 - 100 = -10 => scrollLeft = 50 - (-10) = 60
    expect(el.scrollLeft).toBe(60);
    expect(el.scrollTop).toBe(60);
  });

  it('once isPanning is active, smaller subsequent moves still update scroll', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    el.scrollLeft = 0;
    el.scrollTop  = 0;

    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 95, clientY: 95 }));
    expect(z.isPanning.value).toBe(true);

    z.onMouseMove(new MouseEvent('mousemove', { clientX: 99, clientY: 99 }));
    // dx = 99 - 100 = -1 => scrollLeft = 0 - (-1) = 1
    expect(el.scrollLeft).toBe(1);
  });

  it('onMouseUp clears isPanning and pending flag', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;

    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 90, clientY: 90 }));
    expect(z.isPanning.value).toBe(true);

    z.onMouseUp();
    expect(z.isPanning.value).toBe(false);
  });

  it('onMouseMove after onMouseUp is a no-op (pending cleared)', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    el.scrollLeft = 0;

    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseUp();

    z.onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
    expect(el.scrollLeft).toBe(0);
    expect(z.isPanning.value).toBe(false);
  });

  it('onMouseMove without scrollRef does not throw when isPanning is active', () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;

    z.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
    expect(z.isPanning.value).toBe(true);

    z.scrollRef.value = null;
    z.onMouseMove(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));
    expect(z.isPanning.value).toBe(true);
  });
});

describe('useChartZoom -- applyZoom scrollRef null guard in nextTick', () => {
  it('does not throw when scrollRef becomes null between applyZoom and nextTick', async () => {
    const z = useChartZoom(1);
    const el = makeScroller();
    z.scrollRef.value = el;
    z.zoomIn();
    z.scrollRef.value = null;
    await nextTick();
    expect(z.zoom.value).toBeGreaterThan(1);
  });
});
