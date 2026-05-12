<template>
  <div class="filter-chips">
    <div
      class="filter-chips-bar"
      :role="role === 'tablist' ? 'tablist' : undefined"
      :aria-label="role === 'tablist' ? ariaLabel : undefined"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="chip-btn"
        :class="{ 'chip-btn--active': option.value === modelValue }"
        :role="role === 'tablist' ? 'tab' : undefined"
        :aria-selected="role === 'tablist' ? String(option.value === modelValue) : undefined"
        :aria-controls="role === 'tablist' && tabpanelIdPrefix ? `${tabpanelIdPrefix}-${option.value}` : undefined"
        :id="role === 'tablist' && tabpanelIdPrefix ? `${tabpanelIdPrefix}-tab-${option.value}` : undefined"
        :tabindex="role === 'tablist' ? (option.value === modelValue ? 0 : -1) : undefined"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
        <span v-if="option.count !== undefined" class="chip-count">{{ option.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  options: Array<{ value: string; label: string; count?: number }>;
  modelValue: string;
  /**
   * When set to 'tablist', the chip strip is announced as ARIA tabs (role="tablist"
   * on the bar, role="tab" + aria-selected on each chip). Pair with `tabpanelIdPrefix`
   * to wire `aria-controls` so a screen reader can jump from a tab to its panel.
   * Default is the filter pattern (no role — chips are plain buttons that filter
   * the surrounding content; "tab" semantics would lie about what they do).
   */
  role?: 'tablist' | 'filter';
  /**
   * When `role="tablist"`, prefix used to build `aria-controls`/`id` for tab and
   * panel association. The owning view should render the active panel with
   * `id="<prefix>-<value>"` and `role="tabpanel"` `aria-labelledby="<prefix>-tab-<value>"`.
   */
  tabpanelIdPrefix?: string;
  /** Optional accessible name for the tablist (when `role="tablist"`). */
  ariaLabel?: string;
}>(), {
  role: 'filter',
  tabpanelIdPrefix: undefined,
  ariaLabel: undefined,
});

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
