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
   *
   * `sortBy2` / `sortDir2` are the user-selected secondary-sort key (see
   * plan 2026-05-09-persons-list-aggregate-columns). `null` means no
   * explicit secondary; the API still applies its built-in tiebreaker
   * (surname, given_name) so adjacent rows with equal primary keys stay
   * in a stable, useful order.
   */
  fetchPage: (
    limit: number,
    offset: number,
    sortBy: SortBy,
    sortDir: 'asc' | 'desc',
    query: string,
    sortBy2: SortBy | null,
    sortDir2: 'asc' | 'desc',
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
  /**
   * Secondary sort key. `null` when the user has not picked one — the
   * API's built-in tiebreaker (surname, given_name on persons; entity-
   * appropriate elsewhere) still applies. Set explicitly via shift-click
   * on a column header, or via `setSecondarySort`.
   */
  sortBy2: Ref<SortBy | null>;
  sortDir2: Ref<'asc' | 'desc'>;
  hasMore: Ref<boolean>;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  /**
   * Click handler for column headers. Plain click toggles the primary
   * sort (or sets it if it's a different column). Shift-click sets the
   * secondary sort (or toggles its direction).
   */
  toggleSort: (column: SortBy, opts?: { shift?: boolean }) => void;
  /** Clear the secondary sort. */
  clearSecondarySort: () => void;
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
  const initialSortBy2 = opts.storageKey
    ? (localStorage.getItem(`${opts.storageKey}-sort-by2`) as SortBy | null)
    : null;
  const initialSortDir2 = (opts.storageKey
    ? (localStorage.getItem(`${opts.storageKey}-sort-dir2`) as 'asc' | 'desc' | null)
    : null) ?? 'asc';

  const sortBy = ref<SortBy>(initialSortBy) as Ref<SortBy>;
  const sortDir = ref<'asc' | 'desc'>(initialSortDir);
  const sortBy2 = ref<SortBy | null>(initialSortBy2) as Ref<SortBy | null>;
  const sortDir2 = ref<'asc' | 'desc'>(initialSortDir2);

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
      const result = await opts.fetchPage(
        PAGE_SIZE,
        0,
        sortBy.value,
        sortDir.value,
        debouncedQuery.value,
        sortBy2.value,
        sortDir2.value,
      );
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
      const result = await opts.fetchPage(
        PAGE_SIZE,
        offset.value,
        sortBy.value,
        sortDir.value,
        debouncedQuery.value,
        sortBy2.value,
        sortDir2.value,
      );
      if (seq !== requestSeq) return;
      items.value = [...items.value, ...result.items];
      total.value = result.total;
      offset.value += result.items.length;
      opts.onAppended?.(result.items);
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function persistSort() {
    if (!opts.storageKey) return;
    localStorage.setItem(`${opts.storageKey}-sort-by`, sortBy.value);
    localStorage.setItem(`${opts.storageKey}-sort-dir`, sortDir.value);
    if (sortBy2.value) {
      localStorage.setItem(`${opts.storageKey}-sort-by2`, sortBy2.value);
      localStorage.setItem(`${opts.storageKey}-sort-dir2`, sortDir2.value);
    } else {
      localStorage.removeItem(`${opts.storageKey}-sort-by2`);
      localStorage.removeItem(`${opts.storageKey}-sort-dir2`);
    }
  }

  function toggleSort(column: SortBy, options?: { shift?: boolean }) {
    if (options?.shift) {
      // Shift-click: set/toggle the secondary sort. If the column matches
      // the primary, clear the secondary instead — a column can't be both.
      if (sortBy.value === column) {
        sortBy2.value = null;
      } else if (sortBy2.value === column) {
        sortDir2.value = sortDir2.value === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy2.value = column;
        sortDir2.value = 'asc';
      }
      persistSort();
      return;
    }
    if (sortBy.value === column) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy.value = column;
      sortDir.value = 'asc';
      // Promoting a column to primary clears it from secondary if it was
      // there — a column can't be both.
      if (sortBy2.value === column) sortBy2.value = null;
    }
    persistSort();
  }

  function clearSecondarySort() {
    sortBy2.value = null;
    persistSort();
  }

  // Re-fetch from offset 0 whenever the debounced query or sort changes.
  // We watch these together so a rapid filter+sort change is coalesced.
  watch([debouncedQuery, sortBy, sortDir, sortBy2, sortDir2], () => {
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
    sortBy2,
    sortDir2,
    hasMore,
    reload,
    loadMore,
    toggleSort,
    clearSecondarySort,
    attachSentinel,
  };
}
