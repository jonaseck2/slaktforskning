<template>
  <div class="chart-report">
    <HourglassChart :person-id="personId" :readonly="true" :color-mode="colorMode" />
  </div>
</template>

<script setup lang="ts">
import HourglassChart from '../charts/HourglassChart.vue';
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
</style>
