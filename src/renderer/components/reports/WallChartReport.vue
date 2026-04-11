<template>
  <div class="wall-chart-report">
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="!svgContent" class="empty">{{ emptyMessage }}</div>
    <div v-else class="chart-container" v-html="svgContent"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchPedigreeTree, fetchPersonNode } from '../../utils/chartData';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  PAPER_SIZES,
  type WallChartPerson,
  type WallChartAncestorTree,
  type WallChartDescendantNode,
  type PaperSizeName,
} from '../../../api/reports/wall_chart';

type RawRel = { type: string; person1_id: string | null; person2_id: string | null };

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  chartType: 'pedigree' | 'descendant';
  generations: number;
  paperSize: PaperSizeName;
}>();

const emit = defineEmits<{
  (e: 'svgReady', svg: string, width: number, height: number): void;
}>();

const { t } = useI18n();
const loading = ref(false);
const svgContent = ref('');

const emptyMessage = computed(() => t('wallChart.selectPersonFirst'));

function toWallChartPerson(node: {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  sex: 'M' | 'F' | 'U';
  birthDate: string | null;
  deathDate: string | null;
}): WallChartPerson {
  return {
    id: node.id,
    givenName: node.givenName,
    surname: node.surname,
    preferredName: node.preferredName,
    birthDate: node.birthDate,
    deathDate: node.deathDate,
    sex: node.sex,
  };
}

async function fetchDescendantTree(
  personId: string,
  depth: number,
  maxDepth: number,
): Promise<WallChartDescendantNode> {
  const node = await fetchPersonNode(personId);
  if (depth >= maxDepth) {
    return { person: toWallChartPerson(node), children: [] };
  }

  const rawRels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
  const childIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person1_id === personId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  const children = await Promise.all(
    childIds.map(id => fetchDescendantTree(id, depth + 1, maxDepth)),
  );
  return { person: toWallChartPerson(node), children };
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  svgContent.value = '';

  try {
    const paper = PAPER_SIZES[props.paperSize];
    const options = {
      paperWidth: paper.width,
      paperHeight: paper.height,
      generations: props.generations,
    };

    let svg: string;
    if (props.chartType === 'pedigree') {
      const rawTree = await fetchPedigreeTree(props.personId, props.generations);
      // Convert to WallChartAncestorTree
      const wcNodes = new Map<number, WallChartPerson>();
      for (const [ahn, node] of (rawTree as { nodes: Map<number, ReturnType<typeof toWallChartPerson>> }).nodes) {
        wcNodes.set(ahn, toWallChartPerson(node));
      }
      const wcTree: WallChartAncestorTree = { nodes: wcNodes, generations: props.generations };
      svg = generatePedigreeWallChart(wcTree, options);
    } else {
      const root = await fetchDescendantTree(props.personId, 0, props.generations);
      svg = generateDescendantWallChart(root, options);
    }

    svgContent.value = svg;
    emit('svgReady', svg, paper.width, paper.height);
  } catch (err) {
    console.error('[WallChartReport] load failed:', err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.personId, props.chartType, props.generations, props.paperSize] as const,
  load,
  { immediate: true },
);
</script>

<style scoped>
.wall-chart-report {
  width: 100%;
}
.loading, .empty {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
.chart-container {
  width: 100%;
}
.chart-container :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
