import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiModeStore = defineStore('uiMode', () => {
  const isReadOnly = ref<boolean>(import.meta.env.VITE_STATIC_MODE === 'true');
  return { isReadOnly };
});
