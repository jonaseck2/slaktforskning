<!-- src/renderer/components/BaseModal.vue -->
<template>
  <div class="modal-overlay" role="presentation" @click.self="$emit('close')">
    <div
      ref="modalRef"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useFocusTrap } from '../composables/useFocusTrap';

defineProps<{ titleId?: string }>();
const emit = defineEmits<{ close: [] }>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
