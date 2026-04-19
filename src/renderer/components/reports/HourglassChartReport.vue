<template>
  <div class="chart-report">
    <HourglassChart :person-id="personId" :readonly="true" />
  </div>
</template>

<script setup lang="ts">
import HourglassChart from '../charts/HourglassChart.vue';
defineProps<{ personId: string }>();
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
