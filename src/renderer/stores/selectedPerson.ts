import { defineStore } from 'pinia';
import { ref } from 'vue';

// "Selected person" = the panel target / highlighted box in the chart.
// Independent from the chart focal (URL `/persons/:id`), which only changes
// via the "🌳 Visa i träd" button in the panel header.
//
// Session-only — resets on app reload.
export const useSelectedPersonStore = defineStore('selectedPerson', () => {
  const personId = ref<string | null>(null);
  function set(id: string | null) { personId.value = id; }
  function clear() { personId.value = null; }
  return { personId, set, clear };
});
