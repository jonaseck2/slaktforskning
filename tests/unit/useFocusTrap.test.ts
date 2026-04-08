// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vue lifecycle hooks since we're testing outside a component context
vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return {
    ...vue,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
  };
});

import { ref } from 'vue';
import { useFocusTrap } from '../../src/renderer/composables/useFocusTrap';

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

describe('useFocusTrap', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('exports activate and deactivate functions', () => {
    const containerRef = ref<HTMLElement | null>(null);
    const { activate, deactivate } = useFocusTrap(containerRef);
    expect(typeof activate).toBe('function');
    expect(typeof deactivate).toBe('function');
  });

  it('focuses first focusable element on activate', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();

    expect(document.activeElement).toBe(btn1);
  });

  it('focuses [autofocus] element on activate when present', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    btn2.setAttribute('autofocus', '');
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();

    expect(document.activeElement).toBe(btn2);
  });

  it('does nothing if container is null', () => {
    const containerRef = ref<HTMLElement | null>(null);
    const { activate, deactivate } = useFocusTrap(containerRef);
    expect(() => activate()).not.toThrow();
    expect(() => deactivate()).not.toThrow();
  });

  it('does not focus disabled buttons', () => {
    const disabled = makeButton(true);
    const enabled = makeButton();
    const container = makeContainer(disabled, enabled);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();

    expect(document.activeElement).toBe(enabled);
  });

  it('wraps focus to last element on Shift+Tab from first', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();
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

  it('wraps focus to first element on Tab from last', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();
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

  it('does not intercept Tab when not at boundary', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    const container = makeContainer(btn1, btn2, btn3);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate } = useFocusTrap(containerRef);
    activate();
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

  it('restores focus to previously focused element on deactivate', () => {
    const outsideBtn = makeButton();
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    const btn1 = makeButton();
    const container = makeContainer(btn1);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate, deactivate } = useFocusTrap(containerRef);
    activate();
    expect(document.activeElement).toBe(btn1);

    deactivate();
    expect(document.activeElement).toBe(outsideBtn);
  });

  it('removes keydown listener on deactivate', () => {
    const btn1 = makeButton();
    const btn2 = makeButton();
    const container = makeContainer(btn1, btn2);
    const containerRef = ref<HTMLElement | null>(container);

    const { activate, deactivate } = useFocusTrap(containerRef);
    activate();
    deactivate();

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
