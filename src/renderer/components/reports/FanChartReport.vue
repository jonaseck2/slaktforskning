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
      :arc-span="arcSpan ?? 360"
      width="100%"
      :stroke-color="isBw ? '#999' : 'white'"
      :no-gradients="isBw"
      :empty-pattern-stroke="isBw ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.15)'"
      :focal-shadow-color="isBw ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)'"
      text-color="white"
      date-color="rgba(255,255,255,0.75)"
      :link-base="anchorBase ?? null"
      :link-by-ahnentafel="!!anchorBase"
    />
    <div v-else-if="loading" class="empty-hint">{{ $t('common.loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { computeFanLayout, fanViewBox, type FanSegment, type ArcSpan } from '../../utils/fanLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { branchFill, sexFill, printFill } from '../../utils/fanColors';
import { useFanThemeColors } from '../../composables/useFanThemeColors';
import type { PedigreeTree } from '../../utils/chart-layout';
import FanChartSvg from '../charts/FanChartSvg.vue';

type ColorMode = 'branch' | 'sex' | 'bw';

const props = defineProps<{
  personId: string;
  generations?: number;
  arcSpan?: ArcSpan;
  colorMode?: ColorMode;
  anchorBase?: string;
}>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);

const gens = computed(() => props.generations ?? 6);
const arc = computed((): ArcSpan => props.arcSpan ?? 180);
const mode = computed<ColorMode>(() => props.colorMode ?? 'bw');
const isBw = computed(() => mode.value === 'bw');
const chartTheme = useFanThemeColors();

const layout = computed<FanSegment[]>(() => {
  if (!tree.value) return [];
  const m = mode.value;
  const { theme, dark } = chartTheme.value;
  return computeFanLayout(tree.value, {
    arcSpan: arc.value,
    maxGen: gens.value,
    fillFn: (ahn, gen, isEmpty, person) => {
      if (m === 'bw') return printFill(gen, isEmpty);
      if (m === 'sex') return sexFill(person?.sex ?? 'U', gen, isEmpty, theme, dark);
      return branchFill(ahn, gen, isEmpty, theme.branches, dark);
    },
  });
});

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
