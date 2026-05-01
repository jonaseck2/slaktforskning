import { reactive, watch, type Ref } from 'vue';

/**
 * Race-safe per-field editor for panel forms.
 *
 * Replaces the hand-rolled `editFields` + `saveField(field)` pattern that
 * appears across `SourcePanel`, `RelationshipPanel`, `PlacePanel`, etc.
 *
 * Behaviour:
 *   1. Whenever `idRef` or `dataRef` changes, `fields` is re-seeded from
 *      `dataRef` and the internal generation counter bumps.
 *   2. `save(field)` captures the current generation, calls `persist`, and
 *      drops the result if the id changed mid-flight (the watcher will have
 *      already re-seeded `fields` from the new data, so writing the stale
 *      value back into `dataRef` would overwrite the fresh entity).
 *
 * Pair with `useEntityData` for the source of `dataRef`.
 */
export function useEditableFields<T extends Record<string, unknown>>(
  idRef: Ref<string | null>,
  dataRef: Ref<T | null>,
  persist: (id: string, patch: Partial<T>) => Promise<void>
) {
  const fields = reactive({}) as T;
  let generation = 0;

  watch(
    [idRef, dataRef],
    () => {
      generation++;
      if (dataRef.value) {
        for (const k of Object.keys(dataRef.value) as (keyof T)[]) {
          (fields as Record<string, unknown>)[k as string] = dataRef.value[k];
        }
      }
    },
    { immediate: true, deep: false }
  );

  async function save<K extends keyof T>(field: K) {
    const id = idRef.value;
    if (id === null) return;
    const gen = generation;
    const patch = { [field]: fields[field] } as Partial<T>;
    await persist(id, patch);
    if (gen !== generation) return;          // id changed during save; re-seed already happened
    if (dataRef.value) (dataRef.value as T)[field] = fields[field];
  }

  return { fields, save };
}
