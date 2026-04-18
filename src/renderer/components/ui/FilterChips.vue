<template>
  <div class="filter-chips-bar">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="chip-btn"
      :class="{ 'chip-btn--active': option.value === modelValue }"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
      <span v-if="option.count !== undefined" class="chip-count">{{ option.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  options: Array<{ value: string; label: string; count?: number }>;
  modelValue: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<style scoped>
.filter-chips-bar {
  display: flex;
  gap: 2px;
  background: var(--surface-border-subtle);
  border-radius: var(--radius-md);
  padding: 2px;
}

.chip-btn {
  padding: var(--space-xs) var(--space-sm);
  border: none;
  border-radius: calc(var(--radius-md) - 1px);
  font-size: var(--font-sm);
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s;
  font-family: inherit;
}

.chip-btn:hover {
  color: var(--text-primary);
}

.chip-btn--active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: var(--font-weight-medium);
}

.chip-count {
  margin-left: var(--space-xs);
  font-size: var(--font-xs);
  opacity: 0.7;
}
</style>
