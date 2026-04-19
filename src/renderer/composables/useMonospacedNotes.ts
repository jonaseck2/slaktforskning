import { ref, watch } from 'vue';

export type NotesEntityType = 'person' | 'relationship' | 'place' | 'group' | 'media';

const STORAGE_PREFIX = 'slaktforskning-monospace-notes-';

export function useMonospacedNotes(entityType: NotesEntityType) {
  const storageKey = STORAGE_PREFIX + entityType;
  const initial = localStorage.getItem(storageKey) === 'true';
  const monospaced = ref(initial);

  watch(monospaced, (value) => {
    localStorage.setItem(storageKey, String(value));
  }, { flush: 'sync' });

  function toggle() {
    monospaced.value = !monospaced.value;
  }

  return { monospaced, toggle };
}
