<!-- src/renderer/components/BaseModal.vue -->
<template>
  <div class="modal-overlay" role="presentation">
    <div
      ref="modalRef"
      class="modal"
      :class="props.modalClass"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFocusTrap } from '../composables/useFocusTrap';
import { narrateModalOpen } from '../utils/screenReaderNarration';

const props = defineProps<{ titleId?: string; modalClass?: string }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const screenReader = inject('screenReader', null) as any;

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  if (screenReader?.isScreenReader?.value) {
    nextTick(() => {
      const modalEl = modalRef.value;
      const fields = modalEl?.querySelectorAll('input, select, textarea').length ?? 0;
      const titleEl = props.titleId ? document.getElementById(props.titleId) : null;
      const title = titleEl?.textContent?.trim() ?? '';
      screenReader.speak(narrateModalOpen(title, fields, t));
    });
  }
});
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
