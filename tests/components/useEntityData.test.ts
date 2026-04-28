import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useEntityData } from '../../src/renderer/composables/useEntityData';

describe('useEntityData', () => {
  it('loads data when id changes', async () => {
    const id = ref<string | null>(null);
    const load = vi.fn(async (i: string) => ({ id: i, name: 'X' }));
    const { data } = useEntityData(id, load);

    expect(data.value).toBeNull();
    id.value = 'a';
    await nextTick();
    await nextTick();
    expect(load).toHaveBeenCalledWith('a');
    expect(data.value).toEqual({ id: 'a', name: 'X' });
  });

  it('discards stale results when id changes mid-fetch', async () => {
    const id = ref<string | null>('a');
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const load = vi.fn((i: string) => {
      if (i === 'a') return new Promise(r => { resolveA = r; });
      return new Promise(r => { resolveB = r; });
    });
    const { data } = useEntityData(id, load as never);

    await nextTick();
    id.value = 'b';
    await nextTick();
    resolveB({ id: 'b' });
    await nextTick();
    await nextTick();
    expect(data.value).toEqual({ id: 'b' });

    // Late-arriving result for 'a' must not overwrite
    resolveA({ id: 'a' });
    await nextTick();
    await nextTick();
    expect(data.value).toEqual({ id: 'b' });
  });

  it('clears data when id becomes null', async () => {
    const id = ref<string | null>('a');
    const { data } = useEntityData(id, async i => ({ id: i }));
    await nextTick();
    await nextTick();
    expect(data.value).toEqual({ id: 'a' });

    id.value = null;
    await nextTick();
    expect(data.value).toBeNull();
  });

  it('reload re-runs the loader for the current id', async () => {
    const id = ref<string | null>('a');
    let counter = 0;
    const load = vi.fn(async (i: string) => ({ id: i, n: ++counter }));
    const { data, reload } = useEntityData(id, load);
    await nextTick();
    await nextTick();
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
    await nextTick();
    await nextTick();
    expect(loading.value).toBe(false);
  });
});
