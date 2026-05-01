import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { usePanelResize, clampWidth } from '../../src/renderer/composables/usePanelResize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mount a minimal component that calls usePanelResize() and exposes the
 * composable's return value. Mounting inside a real Vue component ensures
 * onUnmounted lifecycle hooks fire correctly when wrapper.unmount() is called.
 */
function mountComposable(options: Parameters<typeof usePanelResize>[0] = {}) {
  let exposed!: ReturnType<typeof usePanelResize>;
  const TestComponent = defineComponent({
    setup() {
      exposed = usePanelResize(options);
    },
    template: '<div></div>',
  });
  const wrapper = mount(TestComponent);
  return { wrapper, exposed: () => exposed };
}

/** Build a container element whose getBoundingClientRect() returns a fixed rect. */
function makeContainer(width = 800, left = 0): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      left,
      right: left + width,
      width,
      height: 600,
      top: 0,
      bottom: 600,
    }),
    configurable: true,
  });
  return el;
}

function makeMouseEvent(type: string, clientX: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
}

// Make requestAnimationFrame synchronous so width updates happen inline during
// tests — otherwise the onMove callback fires in a deferred rAF.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// clampWidth utility
// ---------------------------------------------------------------------------

describe('clampWidth', () => {
  it('returns value when within range', () => {
    expect(clampWidth(300, 600)).toBe(300);
  });

  it('clamps to maxWidth when value exceeds it', () => {
    expect(clampWidth(700, 600)).toBe(600);
  });

  it('clamps to minWidth (default 200) when value is too small', () => {
    expect(clampWidth(100, 600)).toBe(200);
  });

  it('clamps to custom minWidth', () => {
    expect(clampWidth(50, 600, 150)).toBe(150);
  });

  it('allows value equal to maxWidth', () => {
    expect(clampWidth(600, 600)).toBe(600);
  });

  it('allows value equal to minWidth', () => {
    expect(clampWidth(200, 600)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Initial width from localStorage
// ---------------------------------------------------------------------------

describe('usePanelResize -- initial width', () => {
  it('uses defaultWidth (300) when localStorage is empty', () => {
    const { exposed } = mountComposable();
    expect(exposed().panelWidth.value).toBe(300);
  });

  it('reads persisted width from localStorage when present', () => {
    localStorage.setItem('viz-panel-width', '450');
    const { exposed } = mountComposable();
    expect(exposed().panelWidth.value).toBe(450);
  });

  it('uses custom storageKey', () => {
    localStorage.setItem('my-panel', '350');
    const { exposed } = mountComposable({ storageKey: 'my-panel' });
    expect(exposed().panelWidth.value).toBe(350);
  });

  it('uses custom defaultWidth when localStorage is empty', () => {
    const { exposed } = mountComposable({ defaultWidth: 400 });
    expect(exposed().panelWidth.value).toBe(400);
  });

  it('falls back to defaultWidth when stored value is non-numeric', () => {
    localStorage.setItem('viz-panel-width', 'not-a-number');
    const { exposed } = mountComposable();
    expect(exposed().panelWidth.value).toBe(300);
  });

  it('clamps stored value to minWidth if it is too small', () => {
    localStorage.setItem('viz-panel-width', '50');
    const { exposed } = mountComposable({ minWidth: 200 });
    expect(exposed().panelWidth.value).toBe(200);
  });

  it('uses stored value as-is when it exceeds minWidth', () => {
    localStorage.setItem('viz-panel-width', '500');
    const { exposed } = mountComposable();
    expect(exposed().panelWidth.value).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Drag: right-anchored panel (default)
// ---------------------------------------------------------------------------

describe('usePanelResize -- drag (right-anchored panel)', () => {
  it('startResize attaches document mousemove and mouseup listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { exposed } = mountComposable();
    const container = makeContainer(800, 0);
    const down = makeMouseEvent('mousedown', 400);
    exposed().startResize(down, container);
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    addSpy.mockRestore();
    document.dispatchEvent(makeMouseEvent('mouseup', 400));
  });

  it('drag move updates panelWidth based on right side (rect.right - clientX)', () => {
    // Container: left=0, right=800. Panel anchored to right.
    // clientX=600 → raw = 800 - 600 = 200, clamped → 200 (at minWidth boundary).
    const { exposed } = mountComposable({ minWidth: 200 });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 600));
    expect(exposed().panelWidth.value).toBe(200);
  });

  it('drag move to a position that gives a larger width', () => {
    // clientX=400 → raw = 800 - 400 = 400. maxW = 800 * 0.75 = 600. Clamped → 400.
    const { exposed } = mountComposable();
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 400));
    expect(exposed().panelWidth.value).toBe(400);
  });

  it('drag end persists width to localStorage', () => {
    const { exposed } = mountComposable({ storageKey: 'test-panel' });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 400)); // sets width to 400
    document.dispatchEvent(makeMouseEvent('mouseup', 400));
    expect(localStorage.getItem('test-panel')).toBe(String(exposed().panelWidth.value));
  });

  it('drag end removes document mousemove and mouseup listeners', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { exposed } = mountComposable();
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mouseup', 700));
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('panelWidth does not change after mouseup (listeners detached)', () => {
    const { exposed } = mountComposable();
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 400));
    const widthAfterMove = exposed().panelWidth.value;
    document.dispatchEvent(makeMouseEvent('mouseup', 400));
    document.dispatchEvent(makeMouseEvent('mousemove', 300));
    expect(exposed().panelWidth.value).toBe(widthAfterMove);
  });

  it('calls e.preventDefault() on mousedown', () => {
    const { exposed } = mountComposable();
    const container = makeContainer(800, 0);
    const down = makeMouseEvent('mousedown', 700);
    const preventSpy = vi.spyOn(down, 'preventDefault');
    exposed().startResize(down, container);
    expect(preventSpy).toHaveBeenCalled();
    document.dispatchEvent(makeMouseEvent('mouseup', 700));
  });
});

// ---------------------------------------------------------------------------
// Drag: left-anchored panel
// ---------------------------------------------------------------------------

describe('usePanelResize -- drag (left-anchored panel)', () => {
  it('uses clientX - rect.left for left-anchored panel', () => {
    // Container: left=0, right=800. Panel anchored to left.
    // clientX=350 → raw = 350 - 0 = 350. maxW = 800 * 0.75 = 600. Clamped → 350.
    const { exposed } = mountComposable({ side: 'left' });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 300), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 350));
    expect(exposed().panelWidth.value).toBe(350);
  });

  it('clamps to minWidth for left-anchored panel when clientX is near left edge', () => {
    const { exposed } = mountComposable({ side: 'left', minWidth: 200 });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 300), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 50)); // raw = 50, clamped → 200
    expect(exposed().panelWidth.value).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// maxWidthRatio cap
// ---------------------------------------------------------------------------

describe('usePanelResize -- maxWidthRatio cap', () => {
  it('clamps panelWidth to maxWidthRatio * containerWidth', () => {
    // Container width = 800. maxWidthRatio = 0.5 → maxW = 400.
    // clientX = 200 → raw = 800 - 200 = 600, clamped to 400.
    const { exposed } = mountComposable({ maxWidthRatio: 0.5 });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 200));
    expect(exposed().panelWidth.value).toBe(400);
  });

  it('allows widths below the ratio cap', () => {
    // clientX = 500 → raw = 800 - 500 = 300, within cap.
    const { exposed } = mountComposable({ maxWidthRatio: 0.75 });
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 500));
    expect(exposed().panelWidth.value).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Cleanup on unmount (real Vue component lifecycle)
// ---------------------------------------------------------------------------

describe('usePanelResize -- cleanup on unmount', () => {
  it('unmount during active drag removes document listeners', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { wrapper, exposed } = mountComposable();
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    // Unmounting the component should trigger onUnmounted → cleanup.
    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('unmount with no active drag does not throw', () => {
    const { wrapper } = mountComposable();
    expect(() => wrapper.unmount()).not.toThrow();
  });

  it('panelWidth stops updating after unmount cleans up listeners', () => {
    const { wrapper, exposed } = mountComposable();
    const container = makeContainer(800, 0);
    exposed().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 400));
    const widthBeforeUnmount = exposed().panelWidth.value;
    wrapper.unmount();
    // After unmount the document listener is removed; further mousemoves are no-ops.
    document.dispatchEvent(makeMouseEvent('mousemove', 300));
    expect(exposed().panelWidth.value).toBe(widthBeforeUnmount);
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence across simulated remounts
// ---------------------------------------------------------------------------

describe('usePanelResize -- localStorage persistence across remounts', () => {
  it('second mount reads width written by first drag', () => {
    const KEY = 'persist-resize-test';
    const { exposed: exposed1 } = mountComposable({ storageKey: KEY });
    const container = makeContainer(800, 0);
    exposed1().startResize(makeMouseEvent('mousedown', 700), container);
    document.dispatchEvent(makeMouseEvent('mousemove', 450)); // raw = 800-450 = 350
    document.dispatchEvent(makeMouseEvent('mouseup', 450));

    // Simulate remount with the same storage key.
    const { exposed: exposed2 } = mountComposable({ storageKey: KEY });
    expect(exposed2().panelWidth.value).toBe(350);
  });
});
