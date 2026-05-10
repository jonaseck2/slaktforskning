import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { usePagedList } from '../../src/renderer/composables/usePagedList';

type Row = { id: string };

function flushDebounce(ms: number) {
  return new Promise(r => setTimeout(r, ms + 30));
}

describe('usePagedList', () => {
  it('initial reload fetches page 0 with default sort', async () => {
    const fetchPage = vi.fn(async () => ({ items: [{ id: '1' }, { id: '2' }], total: 2 }));
    const list = usePagedList<Row, 'name'>({
      defaultSortBy: 'name',
      fetchPage,
    });
    await list.reload();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(100, 0, 'name', 'asc', '', null, 'asc');
    expect(list.items.value).toHaveLength(2);
    expect(list.total.value).toBe(2);
    expect(list.hasMore.value).toBe(false);
  });

  it('loadMore appends next page and tracks offset', async () => {
    let call = 0;
    const fetchPage = vi.fn(async (_limit: number, _offset: number) => {
      call++;
      if (call === 1) return { items: [{ id: '1' }, { id: '2' }], total: 4 };
      return { items: [{ id: '3' }, { id: '4' }], total: 4 };
    });
    const list = usePagedList<Row, 'name'>({
      defaultSortBy: 'name',
      pageSize: 2,
      fetchPage,
    });
    await list.reload();
    expect(list.hasMore.value).toBe(true);
    await list.loadMore();
    expect(list.items.value.map(r => r.id)).toEqual(['1', '2', '3', '4']);
    expect(list.hasMore.value).toBe(false);
  });

  it('debounces filter changes and reloads from offset 0', async () => {
    const fetchPage = vi.fn(async (_l: number, _o: number, _sb: string, _sd: string, query: string) =>
      ({ items: query ? [{ id: 'match' }] : [{ id: '1' }, { id: '2' }], total: query ? 1 : 2 }));
    const list = usePagedList<Row, 'name'>({
      defaultSortBy: 'name',
      debounceMs: 50,
      fetchPage,
    });
    await list.reload();
    fetchPage.mockClear();

    list.searchQuery.value = 'a';
    list.searchQuery.value = 'an';
    list.searchQuery.value = 'and';
    await nextTick();
    expect(fetchPage).not.toHaveBeenCalled();
    await flushDebounce(50);
    await nextTick();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(100, 0, 'name', 'asc', 'and', null, 'asc');
    expect(list.items.value).toEqual([{ id: 'match' }]);
  });

  it('discards stale fetches when a newer one starts', async () => {
    let resolveSlow: ((v: { items: Row[]; total: number }) => void) | null = null;
    const fetchPage = vi.fn((_l: number, _o: number, _sb: string, _sd: string, query: string) => {
      if (query === 'slow') return new Promise<{ items: Row[]; total: number }>(r => { resolveSlow = r; });
      return Promise.resolve({ items: [{ id: 'fast' }], total: 1 });
    });
    const list = usePagedList<Row, 'name'>({
      defaultSortBy: 'name',
      debounceMs: 1,
      fetchPage,
    });

    // fire slow query — wait for debounce + watcher tick so the fetch starts
    list.searchQuery.value = 'slow';
    await flushDebounce(1);
    await nextTick();
    expect(resolveSlow).toBeTypeOf('function');

    // fire fast query before slow resolves
    list.searchQuery.value = 'fast';
    await flushDebounce(1);
    await nextTick();
    await nextTick();

    // resolve slow late — must not clobber state since a newer fetch has run
    resolveSlow!({ items: [{ id: 'STALE' }], total: 99 });
    await nextTick();
    await nextTick();
    expect(list.items.value).toEqual([{ id: 'fast' }]);
    expect(list.total.value).toBe(1);
  });

  it('toggleSort flips dir on same column, resets to asc on different column', async () => {
    const fetchPage = vi.fn(async () => ({ items: [], total: 0 }));
    const list = usePagedList<Row, 'name' | 'date'>({
      defaultSortBy: 'name',
      fetchPage,
    });
    await list.reload();
    expect(list.sortBy.value).toBe('name');
    expect(list.sortDir.value).toBe('asc');
    list.toggleSort('name');
    expect(list.sortDir.value).toBe('desc');
    list.toggleSort('date');
    expect(list.sortBy.value).toBe('date');
    expect(list.sortDir.value).toBe('asc');
  });

  it('hasMore is false when items.length >= total', async () => {
    const fetchPage = vi.fn(async () => ({ items: [{ id: '1' }], total: 1 }));
    const list = usePagedList<Row, 'name'>({
      defaultSortBy: 'name',
      fetchPage,
    });
    await list.reload();
    expect(list.hasMore.value).toBe(false);
    await list.loadMore();
    // loadMore should be a no-op when !hasMore
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
