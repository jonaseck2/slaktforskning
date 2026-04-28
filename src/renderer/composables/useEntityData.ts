import { ref, watch, type Ref } from 'vue';

/**
 * Race-safe loader for self-loading sections that watch a prop id.
 *
 * Without a guard, the common pattern
 *   watch(() => props.personId, async (id) => { data.value = await fetch(id); });
 * lets a slow load(A) overwrite a fast load(B) when the user clicks
 * rapidly between entities — the panel ends up showing A's data while B
 * is selected. A generation counter keeps only the latest fetch's
 * result, so stale loads are dropped.
 *
 * Pass a `Ref<string | null>` for the id and an async loader that takes
 * the resolved id. The composable reloads on every id change (including
 * back to null, which clears `data`).
 */
export function useEntityData<T>(
  idRef: Ref<string | null>,
  loader: (id: string) => Promise<T>
) {
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

  return { data, loading, error, reload };
}
