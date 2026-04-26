import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'tree-focal-id';

export const useTreeFocalStore = defineStore('treeFocal', () => {
  const personId = ref<string | null>(localStorage.getItem(STORAGE_KEY));

  watch(personId, v => {
    if (v) localStorage.setItem(STORAGE_KEY, v);
    else localStorage.removeItem(STORAGE_KEY);
  });

  function set(id: string) { personId.value = id; }
  function clear() { personId.value = null; }

  return { personId, set, clear };
});
