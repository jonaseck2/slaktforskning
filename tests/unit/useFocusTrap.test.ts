// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useFocusTrap } from '../../src/renderer/composables/useFocusTrap';

// Capture lifecycle hook callbacks so tests can trigger them manually
let mountedCb: (() => void) | null = null;
let unmountedCb: (() => void) | null = null;

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return {
    ...vue,
    onMounted: vi.fn((cb: () => void) => { mountedCb = cb; }),
    onUnmounted: vi.fn((cb: () => void) => { unmountedCb = cb; }),
  };
});

function makeButton(disabled = false): HTMLButtonElement {
  const btn = document.createElement('button');
  if (disabled) btn.disabled = true;
  return btn;
}

function makeContainer(...children: HTMLElement[]): HTMLDivElement {
  const div = document.createElement('div');
  children.forEach((c) => div.appendChild(c));
  document.body.appendChild(div);
  return div;
}

describe('useFocusTrap', async () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    mountedCb = null;
    unmountedCb = null;
  });

  it('returns nothing useful (no activate/deactivate exports)', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const result = useFocusTrap(containerRef);
    expect(result).toBeUndefined();
  });

  it('focuses first focusable element on mount', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();

    expect(document.activeElement).toBe(btn1);
  });

  it('focuses [autofocus] element on mount when present', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    btn2.setAttribute('autofocus', '');
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();

    expect(document.activeElement).toBe(btn2);
  });

  it('does nothing if container is null', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    useFocusTrap(containerRef);
    expect(() => mountedCb!()).not.toThrow();
    expect(() => unmountedCb!()).not.toThrow();
  });

  it('does not focus disabled buttons', async () => {
    const disabled = makeButton(true);
    const enabled = makeButton();
    const container = makeContainer(disabled, enabled);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();

    expect(document.activeElement).toBe(enabled);
  });

  it('wraps focus to last element on Shift+Tab from first', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    btn1.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(btn3);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps focus to first element on Tab from last', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    btn3.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(btn1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not intercept Tab when not at boundary', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    btn2.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('single focusable element: Tab wraps back to itself', async () => {
    const btn = makeButton();
    const container = makeContainer(btn);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    btn.focus();

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(btn);
    expect(tabEvent.defaultPrevented).toBe(true);

    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(btn);
    expect(shiftTabEvent.defaultPrevented).toBe(true);
  });

  it('restores focus to previously focused element on unmount', async () => {
    const outsideBtn = makeButton();
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    const btn1 = makeButton();
    const container = makeContainer(btn1);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    expect(document.activeElement).toBe(btn1);

    unmountedCb!();
    expect(document.activeElement).toBe(outsideBtn);
  });

  it('removes keydown listener on unmount', async () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    useFocusTrap(containerRef);
    mountedCb!();
    unmountedCb!();

    btn2.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
