import { ref, watch, onScopeDispose, type Ref } from 'vue';

interface UseEntityDataOptions {
  /**
   * Subscribe to `window.api.onDataChanged` and reload (debounced) on
   * mutation. Default: true. Set false for read-only snapshot views
   * (e.g. report previews, undo-history viewers) where stale data is
   * intentional.
   */
  subscribe?: boolean;
  /** Debounce window in ms for batching mutation bursts. Default: 150. */
  debounceMs?: number;
}

declare const window: Window & {
  api?: {
    onDataChanged?: (cb: () => void) => void;
    offDataChanged?: (cb: () => void) => void;
  };
};

/**
 * Race-safe loader for self-loading sections + cross-view reactivity.
 *
 * The composable does two things every consumer needs:
 *   1. Reload when `idRef` changes (immediate), with a generation guard
 *      so late-arriving fetches for stale ids don't overwrite the
 *      current entity.
 *   2. Reload when ANY mutating IPC call fires (`window.api.onDataChanged`),
 *      debounced ~150ms to coalesce bursts. Cleans up on scope dispose.
 *
 * This is the canonical mechanism for keeping list / panel / center
 * views in sync — composables own the subscription, views never call
 * `onDataChanged` directly.
 *
 * Pass `{ subscribe: false }` for snapshot views.
 */
export function useEntityData<T>(
  idRef: Ref<string | null>,
  loader: (id: string) => Promise<T>,
  options: UseEntityDataOptions = {}
) {
  const subscribe = options.subscribe ?? true;
  const debounceMs = options.debounceMs ?? 150;

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<unknown>(null);
  let generation = 0;

  async function reload() {
    const id = idRef.value;
    if (id === null) {
      data.value = null;
      loading.value = false;
      error.value = null;
      return;
    }
    const gen = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader(id);
      if (gen !== generation) return;
      data.value = result;
    } catch (e) {
      if (gen !== generation) return;
      error.value = e;
      data.value = null;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  watch(idRef, reload, { immediate: true });

  if (subscribe && typeof window !== 'undefined' && window.api?.onDataChanged) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMutation = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (idRef.value !== null) reload();
      }, debounceMs);
    };
    window.api.onDataChanged(onMutation);
    onScopeDispose(() => {
      if (debounce) clearTimeout(debounce);
      window.api?.offDataChanged?.(onMutation);
    });
  }

  return { data, loading, error, reload };
}
