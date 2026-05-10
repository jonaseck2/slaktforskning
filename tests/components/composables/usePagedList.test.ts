import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, effectScope } from 'vue';
import { usePagedList } from '../../../src/renderer/composables/usePagedList';

// Minimal stub for window.api.onDataChanged / offDataChanged (mirrors useEntityData test setup)
let dataChangedCb: (() => void) | null = null;
beforeEach(() => {
  dataChangedCb = null;
  (globalThis as { api: unknown }).api = undefined;
  (globalThis as { window: { api: unknown } }).window = {
    api: {
      onDataChanged: (cb: () => void) => { dataChangedCb = cb; },
      offDataChanged: () => { dataChangedCb = null; },
    },
  };
});

async function flushPromises() {
  await nextTick();
  await nextTick();
  await nextTick();
}

describe('usePagedList — onDataChanged reactivity', async () => {
  it('reloads (debounced) when onDataChanged fires', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchPage = vi.fn(async () => {
        calls++;
        return { items: [{ id: String(calls) }], total: calls };
      });
      const list = usePagedList({ defaultSortBy: 'name', fetchPage });
      // Consumers drive the initial load explicitly (matches real callers).
      await list.reload();
      await flushPromises();
      expect(fetchPage).toHaveBeenCalledTimes(1);

      dataChangedCb!(); dataChangedCb!();
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();
      expect(fetchPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opt-out via subscribe: false', async () => {
    const fetchPage = vi.fn(async () => ({ items: [], total: 0 }));
    usePagedList({ defaultSortBy: 'name', fetchPage, subscribe: false });
    await flushPromises();
    expect(dataChangedCb).toBeNull();
  });

  it('unsubscribes on unmount', async () => {
    const scope = effectScope();
    scope.run(() => {
      usePagedList({
        defaultSortBy: 'name',
        fetchPage: async () => ({ items: [], total: 0 }),
      });
    });
    expect(dataChangedCb).not.toBeNull();
    scope.stop();
    expect(dataChangedCb).toBeNull();
  });
});
