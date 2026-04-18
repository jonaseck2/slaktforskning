import { ref, onMounted, type Ref } from 'vue';

const STORAGE_PREFIX = 'slaktforskning-textarea-height-';

/**
 * Persists a textarea's user-resized height to localStorage so it survives navigation.
 * Returns a ref to bind to the textarea element + an onResize handler for the textarea.
 */
export function useTextareaHeight(key: string) {
  const textareaRef: Ref<HTMLTextAreaElement | null> = ref(null);
  const storedHeight = ref<string | null>(null);

  const storageKey = STORAGE_PREFIX + key;

  onMounted(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      storedHeight.value = saved;
      if (textareaRef.value) {
        textareaRef.value.style.height = saved + 'px';
      }
    }
  });

  function persistHeight() {
    if (textareaRef.value) {
      const h = textareaRef.value.offsetHeight;
      if (h > 0) {
        localStorage.setItem(storageKey, String(h));
      }
    }
  }

  return { textareaRef, storedHeight, persistHeight };
}
