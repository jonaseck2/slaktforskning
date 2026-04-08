<!-- src/renderer/components/ToastNotification.vue -->
<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="'toast--' + toast.type"
          @click="dismiss(toast.id)"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  padding: 10px 16px;
  border-radius: 6px;
  font-size: var(--font-sm);
  max-width: 360px;
  cursor: pointer;
  pointer-events: all;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  line-height: 1.4;
}
.toast--error {
  background: var(--color-danger-text);
  color: white;
}
.toast--success {
  background: #15803d;
  color: white;
}
.toast--info {
  background: #1d4ed8;
  color: white;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
