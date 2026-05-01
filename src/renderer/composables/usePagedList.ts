import { ref, computed, watch, onUnmounted, onScopeDispose, type Ref } from 'vue';

declare const window: Window & {
  api?: {
    onDataChanged?: (cb: () => void) => void;
    offDataChanged?: (cb: () => void) => void;
  };
};

export interface PagedListOptions<T, SortBy extends string> {
  /** Number of items per page. Default 100. */
  pageSize?: number;
  /** Default sort column. */
  defaultSortBy: SortBy;
  /** Default sort direction. Default 'asc'. */
  defaultSortDir?: 'asc' | 'desc';
  /** localStorage key prefix used for sort state (`<prefix>-sort-by`, `<prefix>-sort-dir`). Optional. */
  storageKey?: string;
  /** Debounce in ms for the filter query. Default 200. */
  debounceMs?: number;
  /**
   * The fetcher. Must return `{ items, total }` filtered+sorted server-side.
   * The composable guarantees only the latest call's result is applied.
   */
  fetchPage: (
    limit: number,
    offset: number,
    sortBy: SortBy,
    sortDir: 'asc' | 'desc',
    query: string,
  ) => Promise<{ items: T[]; total: number }>;
  /** Optional callback after a fresh page (offset 0) loads. */
  onLoaded?: (items: T[]) => void;
  /** Optional callback after a loadMore appends new items. */
  onAppended?: (newItems: T[]) => void;
  /**
   * Auto-reload on `window.api.onDataChanged` (debounced). Default: true.
   * Set false for snapshot views where stale data is intentional.
   */
  subscribe?: boolean;
}

export interface PagedListApi<T, SortBy extends string> {
  items: Ref<T[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  searchQuery: Ref<string>;
  sortBy: Ref<SortBy>;
  sortDir: Ref<'asc' | 'desc'>;
  hasMore: Ref<boolean>;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  toggleSort: (column: SortBy) => void;
  /** Wire the IntersectionObserver sentinel to trigger loadMore. */
  attachSentinel: (el: HTMLElement | null, root?: HTMLElement | null) => void;
}

/**
 * Server-paged list with debounced filter, stale-response guard, and
 * reset-on-filter/sort semantics. Used by PersonsListTab, PlacesView,
 * SourcesView, MediaView so the same UX (filter the entire list, sort the
 * entire list, infinite-scroll the result) lives in one place.
 */
export function usePagedList<T, SortBy extends string>(opts: PagedListOptions<T, SortBy>): PagedListApi<T, SortBy> {
  const PAGE_SIZE = opts.pageSize ?? 100;
  const DEBOUNCE = opts.debounceMs ?? 200;

  const items = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const offset = ref(0);
  const searchQuery = ref('');
  const debouncedQuery = ref('');

  const initialSortBy = (opts.storageKey
    ? (localStorage.getItem(`${opts.storageKey}-sort-by`) as SortBy | null)
    : null) ?? opts.defaultSortBy;
  const initialSortDir = (opts.storageKey
    ? (localStorage.getItem(`${opts.storageKey}-sort-dir`) as 'asc' | 'desc' | null)
    : null) ?? opts.defaultSortDir ?? 'asc';

  const sortBy = ref<SortBy>(initialSortBy) as Ref<SortBy>;
  const sortDir = ref<'asc' | 'desc'>(initialSortDir);

  const hasMore = computed(() => items.value.length < total.value);

  // Stale-response guard: every fetch gets a sequence id; only the latest
  // result is allowed to mutate state. Without this, a slow query for "an"
  // can land after a fast query for "ander" and clobber it.
  let requestSeq = 0;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleDebounce() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = searchQuery.value;
      debounceTimer = null;
    }, DEBOUNCE);
  }

  watch(searchQuery, () => {
    if (searchQuery.value === debouncedQuery.value) return;
    scheduleDebounce();
  });

  async function reload(): Promise<void> {
    const seq = ++requestSeq;
    loading.value = true;
    try {
      const result = await opts.fetchPage(PAGE_SIZE, 0, sortBy.value, sortDir.value, debouncedQuery.value);
      if (seq !== requestSeq) return; // stale — newer request in flight
      items.value = result.items;
      total.value = result.total;
      offset.value = result.items.length;
      opts.onLoaded?.(result.items);
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value) return;
    const seq = ++requestSeq;
    loading.value = true;
    try {
      const result = await opts.fetchPage(PAGE_SIZE, offset.value, sortBy.value, sortDir.value, debouncedQuery.value);
      if (seq !== requestSeq) return;
      items.value = [...items.value, ...result.items];
      total.value = result.total;
      offset.value += result.items.length;
      opts.onAppended?.(result.items);
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function toggleSort(column: SortBy) {
    if (sortBy.value === column) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy.value = column;
      sortDir.value = 'asc';
    }
    if (opts.storageKey) {
      localStorage.setItem(`${opts.storageKey}-sort-by`, sortBy.value);
      localStorage.setItem(`${opts.storageKey}-sort-dir`, sortDir.value);
    }
  }

  // Re-fetch from offset 0 whenever the debounced query or sort changes.
  // We watch these together so a rapid filter+sort change is coalesced.
  watch([debouncedQuery, sortBy, sortDir], () => {
    void reload();
  });

  // Sentinel wiring — owned here so views don't have to repeat the boilerplate.
  let observer: IntersectionObserver | null = null;
  function attachSentinel(el: HTMLElement | null, root?: HTMLElement | null) {
    if (observer) { observer.disconnect(); observer = null; }
    if (!el) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore.value && !loading.value) {
          void loadMore();
        }
      },
      root ? { root, rootMargin: '600px 0px' } : { rootMargin: '2000px 0px' },
    );
    observer.observe(el);
  }

  onUnmounted(() => {
    if (observer) observer.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // Auto-subscribe to mutation events so the list refreshes after any
  // create/update/delete (own view, sibling section, modal, MCP call,
  // undo, import). Mirrors useEntityData — composables own the
  // subscription, views never call `onDataChanged` directly.
  const subscribe = opts.subscribe ?? true;
  if (subscribe && typeof window !== 'undefined' && window.api?.onDataChanged) {
    let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
    const onMutation = () => {
      if (mutationDebounce) clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => { void reload(); }, 200);
    };
    window.api.onDataChanged(onMutation);
    onScopeDispose(() => {
      if (mutationDebounce) clearTimeout(mutationDebounce);
      window.api?.offDataChanged?.(onMutation);
    });
  }

  return {
    items,
    total,
    loading,
    searchQuery,
    sortBy,
    sortDir,
    hasMore,
    reload,
    loadMore,
    toggleSort,
    attachSentinel,
  };
}
