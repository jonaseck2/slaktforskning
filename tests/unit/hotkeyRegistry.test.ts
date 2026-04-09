import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HotkeyRegistry } from '../../src/renderer/composables/useHotkeyRegistry';

// Helper to create a KeyboardEvent-like object
function makeEvent(
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}
): KeyboardEvent {
  return {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('HotkeyRegistry', () => {
  // Registry with no input focused (default)
  let registry: HotkeyRegistry;
  // Registry that simulates an input being focused
  let registryInInput: HotkeyRegistry;

  beforeEach(() => {
    registry = new HotkeyRegistry(() => false);
    registryInInput = new HotkeyRegistry(() => true);
  });

  it('registers and triggers a global hotkey', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    const handled = registry.handleKeydown(makeEvent('p'));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('returns false when no matching hotkey', () => {
    registry.registerGlobal([{ key: 'p', action: vi.fn(), description: 'Go to persons' }]);
    const handled = registry.handleKeydown(makeEvent('x'));
    expect(handled).toBe(false);
  });

  it('is case-insensitive for letter keys', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    const handled = registry.handleKeydown(makeEvent('P'));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('suppresses single-letter hotkeys when an input field is focused', () => {
    const action = vi.fn();
    registryInInput.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    const handled = registryInInput.handleKeydown(makeEvent('p'));
    expect(handled).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('suppresses letter hotkeys for INPUT, TEXTAREA and SELECT (via injected check)', () => {
    // The registry itself just calls the injected isInputFocused — tag-specific
    // logic lives in the caller. This test confirms the suppression works for any truthy result.
    const action = vi.fn();
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const r = new HotkeyRegistry(() => ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag));
      r.registerGlobal([{ key: 'p', action, description: 'test' }]);
      expect(r.handleKeydown(makeEvent('p'))).toBe(false);
    }
    expect(action).not.toHaveBeenCalled();
  });

  it('allows Escape hotkey even inside an input field', () => {
    const action = vi.fn();
    registryInInput.registerGlobal([{ key: 'Escape', action, description: 'Close modal' }]);
    const handled = registryInInput.handleKeydown(makeEvent('Escape'));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('view-scoped hotkeys override global hotkeys for the same key', () => {
    const globalAction = vi.fn();
    const viewAction = vi.fn();
    registry.registerGlobal([{ key: 'p', action: globalAction, description: 'global' }]);
    registry.registerView([{ key: 'p', action: viewAction, description: 'view' }]);
    registry.handleKeydown(makeEvent('p'));
    expect(viewAction).toHaveBeenCalledOnce();
    expect(globalAction).not.toHaveBeenCalled();
  });

  it('cleanup function removes view hotkeys and restores global', () => {
    const globalAction = vi.fn();
    const viewAction = vi.fn();
    registry.registerGlobal([{ key: 'p', action: globalAction, description: 'global' }]);
    const cleanup = registry.registerView([{ key: 'p', action: viewAction, description: 'view' }]);

    // View hotkey is active
    registry.handleKeydown(makeEvent('p'));
    expect(viewAction).toHaveBeenCalledOnce();

    // Clean up view hotkeys
    cleanup();

    // Global is active again
    registry.handleKeydown(makeEvent('p'));
    expect(globalAction).toHaveBeenCalledOnce();
    expect(viewAction).toHaveBeenCalledOnce(); // still only once
  });

  it('multiple registerView calls accumulate', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();
    registry.registerView([{ key: 'a', action: action1, description: 'view A' }]);
    registry.registerView([{ key: 'b', action: action2, description: 'view B' }]);
    registry.handleKeydown(makeEvent('a'));
    registry.handleKeydown(makeEvent('b'));
    expect(action1).toHaveBeenCalledOnce();
    expect(action2).toHaveBeenCalledOnce();
  });

  it('cleanup removes only the specific view hotkeys batch', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();
    const cleanup1 = registry.registerView([{ key: 'a', action: action1, description: 'view A' }]);
    registry.registerView([{ key: 'b', action: action2, description: 'view B' }]);
    cleanup1();
    expect(registry.handleKeydown(makeEvent('a'))).toBe(false);
    expect(registry.handleKeydown(makeEvent('b'))).toBe(true);
  });

  it('matches Ctrl+. combo key', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'Ctrl+.', action, description: 'toggle' }]);
    const handled = registry.handleKeydown(makeEvent('.', { ctrlKey: true }));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not match Ctrl+. without ctrl held', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'Ctrl+.', action, description: 'toggle' }]);
    const handled = registry.handleKeydown(makeEvent('.'));
    expect(handled).toBe(false);
  });

  it('matches Ctrl+. combo even inside an input field', () => {
    const action = vi.fn();
    registryInInput.registerGlobal([{ key: 'Ctrl+.', action, description: 'toggle' }]);
    const handled = registryInInput.handleKeydown(makeEvent('.', { ctrlKey: true }));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('matches Ctrl+. combo with metaKey (Mac)', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'Ctrl+.', action, description: 'toggle' }]);
    const handled = registry.handleKeydown(makeEvent('.', { metaKey: true }));
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('does NOT trigger single-key hotkey when Ctrl is held', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    // Ctrl+P is a browser shortcut — should not trigger our hotkey
    const handled = registry.handleKeydown(makeEvent('p', { ctrlKey: true }));
    expect(handled).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('does NOT trigger single-key hotkey when Meta is held', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    const handled = registry.handleKeydown(makeEvent('p', { metaKey: true }));
    expect(handled).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('does NOT trigger single-key hotkey when Alt is held', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);
    const handled = registry.handleKeydown(makeEvent('p', { altKey: true }));
    expect(handled).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('listAll returns all unique hotkeys (view wins for duplicates)', () => {
    registry.registerGlobal([
      { key: 'p', action: vi.fn(), description: 'Go to persons' },
      { key: 'r', action: vi.fn(), description: 'Go to relationships' },
    ]);
    registry.registerView([{ key: 'p', action: vi.fn(), description: 'New person (view)' }]);
    const list = registry.listAll();
    const keys = list.map((h) => h.key);
    // 'p' appears once (view wins), 'r' appears once
    expect(keys.filter((k) => k === 'p')).toHaveLength(1);
    expect(keys).toContain('r');
    // View description wins for 'p'
    const pEntry = list.find((h) => h.key === 'p');
    expect(pEntry?.description).toBe('New person (view)');
  });

  it('listAll returns empty array when nothing registered', () => {
    expect(registry.listAll()).toEqual([]);
  });

  it('destroy clears all hotkeys', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'test' }]);
    registry.registerView([{ key: 'q', action, description: 'test' }]);
    registry.destroy();
    expect(registry.handleKeydown(makeEvent('p'))).toBe(false);
    expect(registry.handleKeydown(makeEvent('q'))).toBe(false);
    expect(registry.listAll()).toEqual([]);
  });
});
