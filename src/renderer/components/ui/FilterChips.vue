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
  background: var(--surface-bg);
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
  color: var(--text-muted);
  transition: all 0.15s;
  font-family: inherit;
}

.chip-btn--active {
  background: var(--surface);
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-sm);
}

.chip-count {
  margin-left: var(--space-xs);
  font-size: var(--font-xs);
  opacity: 0.7;
}
</style>
