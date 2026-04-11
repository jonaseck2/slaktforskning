<template>
  <div class="chart-report">
    <div class="circle-controls">
      <label>
        {{ $t('reports.generations') }}
        <select v-model.number="generations">
          <option v-for="n in 6" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
    </div>
    <CircleChartSvg
      v-if="layout.length > 0"
      :segments="layout"
      :focal-segment="focalSegment"
      :curved-text="true"
      width="100%"
    />
    <div v-else-if="loading" class="empty-hint">{{ $t('common.loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { computeCircleLayout, type CircleSegment } from '../../utils/circleLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import type { PedigreeTree } from '../../utils/chart-layout';
import CircleChartSvg from '../charts/CircleChartSvg.vue';

const props = defineProps<{ personId: string }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const generations = ref(6);

const layout = computed<CircleSegment[]>(() =>
  tree.value ? computeCircleLayout(tree.value, generations.value) : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    tree.value = await fetchPedigreeTree(props.personId, generations.value + 1);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
watch(generations, load);
onMounted(load);
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.circle-controls {
  margin-bottom: 12px;
}
.circle-controls label {
  font-size: var(--font-sm);
  color: #555;
}
.circle-controls select {
  margin-left: 6px;
  font-size: var(--font-sm);
}
</style>
