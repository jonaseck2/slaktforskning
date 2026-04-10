import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSourceSession = defineStore('sourceSession', () => {
  const lastSourceId = ref<string | null>(null);
  const lastPage = ref('');

  function setLastUsed(sourceId: string, page: string) {
    lastSourceId.value = sourceId;
    lastPage.value = page;
  }

  function clear() {
    lastSourceId.value = null;
    lastPage.value = '';
  }

  return { lastSourceId, lastPage, setLastUsed, clear };
});
