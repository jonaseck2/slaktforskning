import { ref } from 'vue';

/**
 * Tiny helper for the "click ✕ → confirm modal → call API" pattern.
 *
 *   const del = useDeleteConfirm<string>(async (id) => {
 *     await window.api.foo.delete(id);
 *     await reload();
 *   });
 *
 *   <button @click="del.ask(id)">✕</button>
 *   <ConfirmModal
 *     :visible="del.visible.value"
 *     ...
 *     @cancel="del.cancel"
 *     @confirm="del.confirm"
 *   />
 */
export function useDeleteConfirm<T = string>(perform: (target: T) => void | Promise<void>) {
  const target = ref<T | null>(null) as { value: T | null };
  const visible = ref(false);

  function ask(t: T) {
    target.value = t;
    visible.value = true;
  }
  function cancel() {
    visible.value = false;
    target.value = null;
  }
  async function confirm() {
    const t = target.value;
    visible.value = false;
    target.value = null;
    if (t !== null) await perform(t as T);
  }

  return { target, visible, ask, cancel, confirm };
}
