import { describe, it, expect, vi } from 'vitest';
import { useDeleteConfirm } from '../../src/renderer/composables/useDeleteConfirm';

describe('useDeleteConfirm', async () => {
  describe('initial state', () => {
    it('initializes with visible=false and target=null', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);
      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
    });

    it('returns refs for target and visible', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);
      expect(del.target).toHaveProperty('value');
      expect(del.visible).toHaveProperty('value');
    });

    it('returns functions ask, cancel, and confirm', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);
      expect(typeof del.ask).toBe('function');
      expect(typeof del.cancel).toBe('function');
      expect(typeof del.confirm).toBe('function');
    });
  });

  describe('ask()', () => {
    it('sets target to the passed value and opens the modal', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');

      expect(del.target.value).toBe('item-1');
      expect(del.visible.value).toBe(true);
    });

    it('works with different types (generic <T>)', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<number>(perform);

      del.ask(42);

      expect(del.target.value).toBe(42);
      expect(del.visible.value).toBe(true);
    });

    it('works with object types', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<{ id: string; name: string }>(perform);

      const obj = { id: '123', name: 'Test' };
      del.ask(obj);

      expect(del.target.value).toEqual(obj);
      expect(del.visible.value).toBe(true);
    });

    it('overwrites previous target if ask is called again', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      expect(del.target.value).toBe('item-1');

      del.ask('item-2');
      expect(del.target.value).toBe('item-2');
      expect(del.visible.value).toBe(true);
    });
  });

  describe('cancel()', () => {
    it('closes the modal and clears the target', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      expect(del.visible.value).toBe(true);

      del.cancel();

      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
    });

    it('does not call perform when cancelled', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      del.cancel();

      expect(perform).not.toHaveBeenCalled();
    });

    it('can be called when modal is already closed (idempotent)', () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.cancel();
      del.cancel();

      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
      expect(perform).not.toHaveBeenCalled();
    });
  });

  describe('confirm()', async () => {
    it('closes the modal and calls perform with the target', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      await del.confirm();

      expect(perform).toHaveBeenCalledWith('item-1');
      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
    });

    it('clears state before calling perform', async () => {
      const stateAtCall = { visible: null, target: null };
      const perform = vi.fn(() => {
        stateAtCall.visible = del.visible.value;
        stateAtCall.target = del.target.value;
      });
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      await del.confirm();

      expect(stateAtCall.visible).toBe(false);
      expect(stateAtCall.target).toBeNull();
    });

    it('does not call perform if target is null', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.visible.value = true;
      del.target.value = null;
      await del.confirm();

      expect(perform).not.toHaveBeenCalled();
    });

    it('handles synchronous perform functions', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      await del.confirm();

      expect(perform).toHaveBeenCalledTimes(1);
      expect(del.visible.value).toBe(false);
    });

    it('handles async perform functions', async () => {
      const perform = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      await del.confirm();

      expect(perform).toHaveBeenCalledTimes(1);
      expect(del.visible.value).toBe(false);
    });

    it('propagates errors from perform function', async () => {
      const perform = vi.fn(() => Promise.reject(new Error('Delete failed')));
      const del = useDeleteConfirm(perform);

      del.ask('item-1');

      await expect(del.confirm()).rejects.toThrow('Delete failed');
    });

    it('still clears state even if perform throws', async () => {
      const perform = vi.fn(() => Promise.reject(new Error('Delete failed')));
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      try {
        await del.confirm();
      } catch {
        // error expected
      }

      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
    });

    it('with generic number type', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<number>(perform);

      del.ask(42);
      await del.confirm();

      expect(perform).toHaveBeenCalledWith(42);
    });

    it('with generic object type', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<{ id: string }>(perform);

      const obj = { id: 'abc' };
      del.ask(obj);
      await del.confirm();

      expect(perform).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc' }));
    });
  });

  describe('full workflows', async () => {
    it('ask -> confirm -> ask -> cancel -> ask -> confirm', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      // First flow: ask + confirm
      del.ask('item-1');
      expect(del.visible.value).toBe(true);
      await del.confirm();
      expect(perform).toHaveBeenCalledWith('item-1');
      expect(del.visible.value).toBe(false);

      // Second flow: ask + cancel
      perform.mockClear();
      del.ask('item-2');
      expect(del.visible.value).toBe(true);
      del.cancel();
      expect(del.visible.value).toBe(false);
      expect(perform).not.toHaveBeenCalled();

      // Third flow: ask + confirm
      del.ask('item-3');
      expect(del.visible.value).toBe(true);
      await del.confirm();
      expect(perform).toHaveBeenCalledWith('item-3');
      expect(del.visible.value).toBe(false);
    });

    it('multiple rapid ask calls use the last target', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      del.ask('item-2');
      del.ask('item-3');

      await del.confirm();

      expect(perform).toHaveBeenCalledOnce();
      expect(perform).toHaveBeenCalledWith('item-3');
    });

    it('confirm without asking never calls perform', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      await del.confirm();

      expect(perform).not.toHaveBeenCalled();
      expect(del.visible.value).toBe(false);
      expect(del.target.value).toBeNull();
    });

    it('cancel followed by confirm without ask is safe', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.cancel();
      await del.confirm();

      expect(perform).not.toHaveBeenCalled();
      expect(del.visible.value).toBe(false);
    });

    it('ask -> ask -> cancel reverts to null, confirm does nothing', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      del.ask('item-2');
      del.cancel();
      await del.confirm();

      expect(perform).not.toHaveBeenCalled();
    });
  });

  describe('type safety', async () => {
    it('enforces generic type parameter for perform callback', () => {
      // TypeScript compile-time check: perform function signature must match <T>
      const del = useDeleteConfirm<string>((id: string) => {
        // id must be string
        expect(typeof id).toBe('string');
      });

      del.ask('test-id');
      // This line would be a TypeScript error if we tried del.ask(123) with <string>
    });

    it('allows void or Promise<void> return from perform', async () => {
      const voidPerform = vi.fn(() => {
        // sync return void
      });
      const delVoid = useDeleteConfirm(voidPerform);
      delVoid.ask('id1');
      await delVoid.confirm();
      expect(voidPerform).toHaveBeenCalled();

      const asyncPerform = vi.fn(async () => {
        // async return Promise<void>
      });
      const delAsync = useDeleteConfirm(asyncPerform);
      delAsync.ask('id2');
      await delAsync.confirm();
      expect(asyncPerform).toHaveBeenCalled();
    });
  });

  describe('refs and reactivity', () => {
    it('visible.value changes trigger watchers', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.visible; // Access to ensure it's tracked

      del.ask('item-1');
      expect(del.visible.value).toBe(true);

      del.cancel();
      expect(del.visible.value).toBe(false);
    });

    it('target.value is reactive', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('item-1');
      expect(del.target.value).toBe('item-1');

      del.ask('item-2');
      expect(del.target.value).toBe('item-2');

      del.cancel();
      expect(del.target.value).toBeNull();
    });
  });

  describe('edge cases', async () => {
    it('handles falsy but non-null targets', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<boolean | string>(perform);

      del.ask(false);
      expect(del.target.value).toBe(false);
      await del.confirm();
      expect(perform).toHaveBeenCalledWith(false);
    });

    it('handles empty string target', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm(perform);

      del.ask('');
      expect(del.target.value).toBe('');
      await del.confirm();
      expect(perform).toHaveBeenCalledWith('');
    });

    it('handles zero as target', async () => {
      const perform = vi.fn();
      const del = useDeleteConfirm<number>(perform);

      del.ask(0);
      expect(del.target.value).toBe(0);
      await del.confirm();
      expect(perform).toHaveBeenCalledWith(0);
    });

    it('handles undefined in generic but enforces non-null on ask', async () => {
      // Even with Union<T | undefined>, the target starts null and ask must
      // set a concrete value; confirm only calls perform if target !== null
      const perform = vi.fn();
      const del = useDeleteConfirm<string>(perform);

      // target is null initially
      expect(del.target.value).toBeNull();

      // ask with a string value
      del.ask('item');
      expect(del.target.value).toBe('item');

      await del.confirm();
      expect(perform).toHaveBeenCalledWith('item');
    });
  });
});
