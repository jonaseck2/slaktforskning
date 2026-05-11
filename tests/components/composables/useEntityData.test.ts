import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick, effectScope } from 'vue';
import { useEntityData } from '../../../src/renderer/composables/useEntityData';

// Minimal stub for window.api.onDataChanged / offDataChanged
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

describe('useEntityData — race safety', async () => {
  it('loads data when id changes', async () => {
    const id = ref<string | null>(null);
    const load = vi.fn(async (i: string) => ({ id: i, name: 'X' }));
    const { data } = useEntityData(id, load);

    expect(data.value).toBeNull();
    id.value = 'a';
    await nextTick(); await nextTick();
    expect(load).toHaveBeenCalledWith('a');
    expect(data.value).toEqual({ id: 'a', name: 'X' });
  });

  it('discards stale results', async () => {
    const id = ref<string | null>('a');
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const load = vi.fn(async (i: string) => {
      if (i === 'a') return new Promise(r => { resolveA = r; });
      return new Promise(r => { resolveB = r; });
    });
    const { data } = useEntityData(id, load as never);

    await nextTick();
    id.value = 'b';
    await nextTick();
    resolveB({ id: 'b' });
    await nextTick(); await nextTick();
    expect(data.value).toEqual({ id: 'b' });
    resolveA({ id: 'a' });
    await nextTick(); await nextTick();
    expect(data.value).toEqual({ id: 'b' });
  });

  it('clears data when id becomes null', async () => {
    const id = ref<string | null>('a');
    const { data } = useEntityData(id, async i => ({ id: i }));
    await nextTick(); await nextTick();
    id.value = null;
    await nextTick();
    expect(data.value).toBeNull();
  });

  it('reload re-runs the loader for the current id', async () => {
    const id = ref<string | null>('a');
    let counter = 0;
    const load = vi.fn(async (i: string) => ({ id: i, n: ++counter }));
    const { data, reload } = useEntityData(id, load);
    await nextTick(); await nextTick();
    expect(data.value).toEqual({ id: 'a', n: 1 });

    await reload();
    expect(data.value).toEqual({ id: 'a', n: 2 });
  });

  it('exposes loading flag during fetch', async () => {
    const id = ref<string | null>(null);
    let resolve: (v: unknown) => void = () => {};
    const load = vi.fn(() => new Promise(r => { resolve = r; }));
    const { loading } = useEntityData(id, load as never);

    expect(loading.value).toBe(false);
    id.value = 'a';
    await nextTick();
    expect(loading.value).toBe(true);
    resolve({ id: 'a' });
    await nextTick(); await nextTick();
    expect(loading.value).toBe(false);
  });
});

describe('useEntityData — onDataChanged reactivity', async () => {
  it('reloads when onDataChanged fires (debounced)', async () => {
    vi.useFakeTimers();
    try {
      const id = ref<string | null>('a');
      let counter = 0;
      const load = vi.fn(async (i: string) => ({ id: i, n: ++counter }));
      const { data } = useEntityData(id, load);
      await nextTick(); await nextTick();
      expect(load).toHaveBeenCalledTimes(1);

      // Fire mutation event 3 times rapidly — debounce coalesces
      dataChangedCb!(); dataChangedCb!(); dataChangedCb!();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();
      expect(load).toHaveBeenCalledTimes(2);
      expect((data.value as { n: number }).n).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not subscribe when subscribe: false', async () => {
    const id = ref<string | null>('a');
    const load = vi.fn(async (i: string) => ({ id: i }));
    useEntityData(id, load, { subscribe: false });
    await nextTick(); await nextTick();
    expect(dataChangedCb).toBeNull();
  });

  it('unsubscribes on scope dispose', async () => {
    const scope = effectScope();
    scope.run(() => {
      const id = ref<string | null>('a');
      useEntityData(id, async i => ({ id: i }));
    });
    expect(dataChangedCb).not.toBeNull();
    scope.stop();
    expect(dataChangedCb).toBeNull();
  });

  it('does not reload when id is null', async () => {
    vi.useFakeTimers();
    try {
      const id = ref<string | null>(null);
      const load = vi.fn(async (i: string) => ({ id: i }));
      useEntityData(id, load);
      await nextTick();
      dataChangedCb!();
      await vi.advanceTimersByTimeAsync(200);
      expect(load).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
