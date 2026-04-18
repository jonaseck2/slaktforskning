<!-- src/renderer/components/reports/FanChartReport.vue -->
<template>
  <div class="chart-report">
    <FanChartSvg
      v-if="layout.length > 0"
      :segments="layout"
      :focal-segment="focalSegment"
      :focal-cx="viewBoxInfo.cx"
      :focal-cy="viewBoxInfo.cy"
      :vb-width="viewBoxInfo.width"
      :vb-height="viewBoxInfo.height"
      :curved-text="curvedText ?? true"
      width="100%"
      stroke-color="#999"
      :no-gradients="true"
      empty-pattern-stroke="rgba(0,0,0,0.08)"
      focal-shadow-color="rgba(0,0,0,0.15)"
      text-color="white"
      date-color="rgba(255,255,255,0.75)"
    />
    <div v-else-if="loading" class="empty-hint">{{ $t('common.loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { computeFanLayout, fanViewBox, type FanSegment, type ArcSpan } from '../../utils/fanLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { printFill } from '../../utils/fanColors';
import type { PedigreeTree } from '../../utils/chart-layout';
import FanChartSvg from '../charts/FanChartSvg.vue';

const props = defineProps<{
  personId: string;
  generations?: number;
  arcSpan?: ArcSpan;
  curvedText?: boolean;
}>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);

const gens = computed(() => props.generations ?? 6);
const arc = computed((): ArcSpan => props.arcSpan ?? 180);

const layout = computed<FanSegment[]>(() =>
  tree.value
    ? computeFanLayout(tree.value, {
        arcSpan: arc.value,
        maxGen: gens.value,
        fillFn: (_ahn, gen, isEmpty) => printFill(gen, isEmpty),
      })
    : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const viewBoxInfo = computed(() => fanViewBox(arc.value, gens.value));

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    tree.value = await fetchPedigreeTree(props.personId, gens.value + 1);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
watch(gens, load);
watch(arc, load);
onMounted(load);
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}

@media print {
  .chart-report :deep(.seg-path) {
    filter: none !important;
    transition: none !important;
  }
}
</style>
