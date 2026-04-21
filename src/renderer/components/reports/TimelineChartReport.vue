<template>
  <div class="chart-report">
    <TimelineChart :person-id="personId" :readonly="true" />
  </div>
</template>

<script setup lang="ts">
import TimelineChart from '../charts/TimelineChart.vue';
defineProps<{ personId: string }>();
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.chart-report :deep(.chart-outer) {
  height: auto !important;
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
