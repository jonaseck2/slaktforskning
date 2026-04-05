import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useFocusStore = defineStore('focus', () => {
  const personId = ref<string | null>(null);
  const personName = ref<string | null>(null);
  function set(id: string, name: string) { personId.value = id; personName.value = name; }
  function clear() { personId.value = null; personName.value = null; }
  return { personId, personName, set, clear };
});
