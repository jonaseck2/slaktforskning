import { ref, onMounted, onScopeDispose, type Ref } from 'vue';

interface UseEntityListOptions {
  subscribe?: boolean;
  debounceMs?: number;
  immediate?: boolean;
}

declare const window: Window & {
  api?: {
    onDataChanged?: (cb: () => void) => void;
    offDataChanged?: (cb: () => void) => void;
  };
};

/**
 * List-equivalent of `useEntityData` — loads a full unpaged list and
 * auto-subscribes to `window.api.onDataChanged` so the list reloads on
 * every mutating IPC call (debounced ~150ms).
 *
 * Use this for views that need the entire entity set (map pins,
 * chip-count derivation, full hierarchy walks) and would otherwise miss
 * mutations that don't pass through the view's own event handlers
 * (MCP tool calls, sibling-view edits, undo/redo).
 *
 * Component code must never register `window.api.onDataChanged` directly —
 * keep that subscription owned by composables.
 */
export function useEntityList<T>(
  loader: () => Promise<T[]>,
  options: UseEntityListOptions = {}
) {
  const subscribe = options.subscribe ?? true;
  const debounceMs = options.debounceMs ?? 150;
  const immediate = options.immediate ?? true;

  const items = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const error = ref<unknown>(null);
  let generation = 0;

  async function reload() {
    const gen = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader();
      if (gen !== generation) return;
      items.value = result;
    } catch (e) {
      if (gen !== generation) return;
      error.value = e;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  if (immediate) {
    onMounted(reload);
  }

  if (subscribe && typeof window !== 'undefined' && window.api?.onDataChanged) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMutation = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(reload, debounceMs);
    };
    window.api.onDataChanged(onMutation);
    onScopeDispose(() => {
      if (debounce) clearTimeout(debounce);
      window.api?.offDataChanged?.(onMutation);
    });
  }

  return { items, loading, error, reload };
}
