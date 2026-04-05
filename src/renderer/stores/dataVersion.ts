import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDataVersionStore = defineStore('dataVersion', () => {
  const version = ref(0);
  function increment() { version.value++; }
  return { version, increment };
});
