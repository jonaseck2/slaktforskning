<template>
  <div class="filter-chips">
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
/* `.filter-chips` is the outer positioning hook for callers — it carries any
   external class (e.g. `viz-tabs`, `map-type-filter`) so margins/padding from
   parent layouts never leak onto the pill itself. The pill's intrinsic shape
   is owned by `.filter-chips-bar`, which spans the wrapper's content width so
   the bar reads as a full-width filter strip rather than a shrink-to-fit pill. */
.filter-chips {
  display: flex;
}
.filter-chips-bar {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
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
  white-space: nowrap;
  flex-shrink: 0;
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
