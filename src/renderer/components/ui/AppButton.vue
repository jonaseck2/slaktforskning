<template>
  <button
    :type="$attrs.type as string || 'button'"
    :disabled="disabled || loading"
    :class="['app-btn', `app-btn--${variant}`, `app-btn--${size}`, { 'app-btn--loading': loading }]"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
}>(), {
  variant: 'secondary',
  size: 'md',
  loading: false,
  disabled: false,
});
</script>

<style scoped>
.app-btn {
  border: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-medium);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  transition: background 0.15s;
}

/* Sizes */
.app-btn--sm {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-sm);
}
.app-btn--md {
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-md);
}

/* Variants */
.app-btn--primary {
  background: var(--accent);
  color: var(--accent-text);
}
.app-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.app-btn--secondary {
  background: transparent;
  border: 1px solid var(--surface-border);
  color: var(--text-secondary);
}
.app-btn--secondary:hover:not(:disabled) {
  background: var(--surface-hover);
}

.app-btn--danger {
  background: var(--error-bg);
  color: var(--error-text);
}
.app-btn--danger:hover:not(:disabled) {
  filter: brightness(0.92);
}

.app-btn--ghost {
  background: transparent;
  border: none;
  color: var(--text-muted);
}
.app-btn--ghost:hover:not(:disabled) {
  background: var(--surface-hover);
}

.app-btn--soft {
  background: var(--surface-hover);
  border: none;
  color: var(--accent);
}
.app-btn--soft:hover:not(:disabled) {
  background: var(--surface-border-subtle);
}

/* Disabled / loading */
.app-btn:disabled,
.app-btn--loading {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
