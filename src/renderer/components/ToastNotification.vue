<!-- src/renderer/components/ToastNotification.vue -->
<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      <!-- Progress toasts: sticky, sit above transient toasts. Bar is
           determinate when current + total are set, indeterminate otherwise. -->
      <div
        v-for="p in progressToasts"
        :key="'p-' + p.id"
        class="toast toast--progress"
        role="status"
      >
        <div class="progress-msg">{{ p.message }}</div>
        <div class="progress-bar" :class="{ indeterminate: !isDeterminate(p) }">
          <div
            v-if="isDeterminate(p)"
            class="progress-fill"
            :style="{ width: percent(p) + '%' }"
          />
          <div v-else class="progress-pulse" />
        </div>
        <div v-if="isDeterminate(p)" class="progress-count" aria-hidden="true">
          {{ p.current }} / {{ p.total }}
        </div>
      </div>

      <!-- Transient toasts. -->
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="'toast--' + toast.type"
          role="alert"
          @click="dismiss(toast.id)"
          @keydown.enter="dismiss(toast.id)"
          @keydown.space.prevent="dismiss(toast.id)"
          tabindex="0"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast';
import type { ProgressToast } from '../composables/useToast';

const { toasts, progressToasts, dismiss } = useToast();

function isDeterminate(p: ProgressToast): boolean {
  return typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0;
}

function percent(p: ProgressToast): number {
  if (!isDeterminate(p)) return 0;
  const pct = (p.current! / p.total!) * 100;
  return Math.max(0, Math.min(100, pct));
}
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
.toast--warning {
  background: var(--warning-bg, #b45309);
  color: var(--warning-text, white);
}
.toast--progress {
  background: var(--surface, #1f2937);
  color: var(--text-primary, white);
  border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 280px;
}
.progress-msg {
  font-size: var(--font-sm);
  line-height: 1.3;
  word-break: break-word;
}
.progress-bar {
  height: 6px;
  background: var(--surface-hover, rgba(255, 255, 255, 0.1));
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}
.progress-fill {
  height: 100%;
  background: var(--accent, #3b82f6);
  border-radius: inherit;
  transition: width 0.18s ease-out;
}
.progress-pulse {
  position: absolute;
  height: 100%;
  width: 40%;
  background: var(--accent, #3b82f6);
  border-radius: inherit;
  animation: progress-indeterminate 1.2s ease-in-out infinite;
}
@keyframes progress-indeterminate {
  0%   { left: -40%; }
  100% { left: 100%; }
}
.progress-count {
  font-size: var(--font-xs, 11px);
  color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  text-align: right;
  font-variant-numeric: tabular-nums;
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
