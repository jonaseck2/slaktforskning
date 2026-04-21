<template>
  <div class="zoom-controls-bar" :class="{ 'is-overlay': overlay, 'is-inline': inline }">
    <slot></slot>
    <span v-if="$slots.default" class="zoom-sep">|</span>
    <button class="zoom-btn" :disabled="zoom <= 0.2" :aria-label="$t('a11y.zoomOut')" @click="$emit('zoomOut')">−</button>
    <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
    <button class="zoom-btn" :aria-label="$t('a11y.zoomIn')" @click="$emit('zoomIn')">+</button>
    <button v-if="showFit" class="zoom-btn" :aria-label="$t('a11y.resetZoom')" @click="$emit('reset')">{{ $t('reports.zoomFit') }}</button>
    <button v-else class="zoom-btn" :aria-label="$t('a11y.resetZoom')" @click="$emit('reset')">↺</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  zoom: number;
  showFit?: boolean;
  overlay?: boolean;
  inline?: boolean;
}>();

defineEmits<{
  zoomIn: [];
  zoomOut: [];
  reset: [];
}>();
</script>

<style scoped>
.zoom-controls-bar {
  position: fixed;
  bottom: 46px;
  right: 28px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: 3px 5px;
  box-shadow: var(--shadow-md);
  z-index: 1000;
}
.zoom-controls-bar.is-overlay {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 5;
}
.zoom-controls-bar.is-inline {
  position: static;
  background: none;
  border: none;
  box-shadow: none;
  padding: 0;
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  line-height: 1.4;
}
.zoom-btn:hover:not(:disabled) { background: var(--surface-hover); }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  min-width: 38px;
  text-align: center;
}
.zoom-sep {
  color: var(--surface-border);
  padding: 0 3px;
}

/* Styles for slotted content (generation pickers, toggles) */
:slotted(.zoom-extra-label) {
  font-size: var(--font-xs);
  color: var(--text-muted);
  padding: 0 4px 0 2px;
}
:slotted(.zoom-extra-btn) {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  line-height: 1.4;
}
:slotted(.zoom-extra-btn:hover:not(:disabled)) { background: var(--surface-hover); }
:slotted(.zoom-extra-btn:disabled) { opacity: 0.4; cursor: default; }
:slotted(.zoom-extra-btn.active) { background: var(--surface-hover); color: var(--accent); }
:slotted(.zoom-extra-sep) { color: var(--surface-border); padding: 0 3px; }
:slotted(.zoom-extra-value) {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  min-width: 24px;
  text-align: center;
}

@media print {
  .zoom-controls-bar { display: none !important; }
}
</style>
