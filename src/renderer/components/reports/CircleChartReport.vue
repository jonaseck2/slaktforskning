<template>
  <div class="chart-report">
    <CircleChartSvg
      v-if="layout.length > 0"
      :segments="layout"
      :focal-segment="focalSegment"
      :curved-text="curvedText ?? true"
      :view-box-size="svgSize"
      width="100%"
    />
    <div v-else-if="loading" class="empty-hint">{{ $t('common.loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { computeCircleLayout, circleSvgSizeForGenerations, type CircleSegment } from '../../utils/circleLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import type { PedigreeTree } from '../../utils/chart-layout';
import CircleChartSvg from '../charts/CircleChartSvg.vue';

const props = defineProps<{ personId: string; generations?: number; curvedText?: boolean }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);

const gens = computed(() => props.generations ?? 6);

const layout = computed<CircleSegment[]>(() =>
  tree.value ? computeCircleLayout(tree.value, gens.value) : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const svgSize = computed(() => circleSvgSizeForGenerations(gens.value));

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
onMounted(load);
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
</style>
