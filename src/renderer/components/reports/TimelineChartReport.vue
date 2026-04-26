<template>
  <div class="chart-report">
    <TimelineChart :person-id="personId" :readonly="true" :color-mode="colorMode" />
  </div>
</template>

<script setup lang="ts">
import TimelineChart from '../charts/TimelineChart.vue';
import type { ColorMode } from '../../../api/chart-export';
defineProps<{ personId: string; colorMode?: ColorMode }>();
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.chart-report :deep(.chart-scroll) {
  overflow: visible !important;
  height: auto !important;
}
.chart-report :deep(svg) {
  width: 100%;
  height: auto;
}
.chart-report :deep(.zoom-controls-bar) {
  display: none;
}
.chart-report :deep(.marker-symbol) {
  stroke: none;
  paint-order: normal;
}
/* Names sit at x = LEFT - 8 with text-anchor="end" — long names extend
 * past the viewBox's left edge. Allow the SVG to render content outside
 * its viewBox so names are not clipped at the edge in the report. */
.chart-report :deep(.timeline-svg) {
  overflow: visible;
}
</style>
