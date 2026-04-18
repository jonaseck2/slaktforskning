<template>
  <div class="wall-chart-report">
    <div v-if="generating" class="report-loading">{{ $t('common.loading') }}</div>
    <div v-else-if="svgContent" class="report-svg" v-html="svgContent"></div>
    <div v-else class="report-empty">{{ $t('wallChart.noPreview') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  computeTileViewBoxes,
  getPaperDimensions,
  type WallChartOptions,
} from '../../../api/wall-charts';
import {
  fetchWallChartAncestorTree,
  fetchWallChartDescendantTree,
} from '../../utils/wallChartData';

const props = defineProps<{
  personId: string;
  options: WallChartOptions;
}>();

const emit = defineEmits<{
  svgGenerated: [svg: string];
  tilesChanged: [tiles: { count: number; rows: number; cols: number } | null];
}>();

const svgContent = ref<string | null>(null);
const generating = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let runId = 0;

async function generateChart() {
  const myRun = ++runId;
  generating.value = true;
  svgContent.value = null;
  try {
    if (props.options.chartType === 'pedigree') {
      const tree = await fetchWallChartAncestorTree(props.personId, props.options.generations);
      if (myRun !== runId) return;
      svgContent.value = generatePedigreeWallChart(tree, props.options);
    } else {
      const tree = await fetchWallChartDescendantTree(props.personId, props.options.generations);
      if (myRun !== runId) return;
      svgContent.value = generateDescendantWallChart(tree, props.options);
    }
    emit('svgGenerated', svgContent.value);

    // Compute tile info
    const paper = getPaperDimensions(props.options);
    const MM_TO_PX = 3.7795275591;
    const W = Math.round(paper.width * MM_TO_PX);
    const H = Math.round(paper.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    if (tiles.length <= 1) {
      emit('tilesChanged', null);
    } else {
      const maxRow = Math.max(...tiles.map(t => t.row)) + 1;
      const maxCol = Math.max(...tiles.map(t => t.col)) + 1;
      emit('tilesChanged', { count: tiles.length, rows: maxRow, cols: maxCol });
    }
  } catch (err) {
    console.error('Wall chart generation failed:', err);
  } finally {
    if (myRun === runId) {
      generating.value = false;
    }
  }
}

watch(
  () => [props.personId, { ...props.options }],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateChart, 400);
  },
  { deep: true },
);

onMounted(generateChart);

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.wall-chart-report {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.report-svg {
  width: 100%;
  height: 100%;
}
.report-svg :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}
.report-loading,
.report-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
</style>
