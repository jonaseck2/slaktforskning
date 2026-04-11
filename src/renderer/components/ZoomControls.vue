<template>
  <div class="zoom-controls-bar">
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
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 3px 5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  z-index: 100;
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover:not(:disabled) { background: var(--color-bg-muted); }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: #666;
  min-width: 38px;
  text-align: center;
}
.zoom-sep {
  color: #ccc;
  padding: 0 3px;
}

@media print {
  .zoom-controls-bar { display: none !important; }
}
</style>
