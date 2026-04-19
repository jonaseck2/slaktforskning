<!-- src/renderer/components/charts/FanChart.vue -->
<template>
  <div class="chart-outer" ref="outerRef">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <FanChartSvg
        v-else
        ref="fanSvgRef"
        :segments="layout"
        :focal-segment="focalSegment"
        :focal-cx="viewBoxInfo.cx"
        :focal-cy="viewBoxInfo.cy"
        :vb-width="viewBoxInfo.width"
        :vb-height="viewBoxInfo.height"
        :width="svgDisplayWidth"
        :height="svgDisplayHeight"
        :stroke-color="colorMode === 'bw' ? '#999' : (chartTheme.dark ? 'rgba(255,255,255,0.15)' : 'white')"
        :empty-pattern-stroke="colorMode === 'bw' ? 'rgba(0,0,0,0.08)' : (chartTheme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)')"
        :focal-shadow-color="colorMode === 'bw' ? 'rgba(0,0,0,0.15)' : (chartTheme.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)')"
        :no-gradients="chartTheme.highContrast || colorMode === 'bw'"
        @navigate="$emit('navigate', $event)"
        @personenter="(p, e) => tooltipRef?.show(p, e.clientX, e.clientY)"
        @personmove="(e) => tooltipRef?.move(e.clientX, e.clientY)"
        @personleave="tooltipRef?.hide()"
      />
    </div>

    <ChartTooltip ref="tooltipRef" />
    <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <span class="zoom-extra-label">{{ $t('visualization.fan.arc') }}</span>
      <button
        v-for="span in arcOptions"
        :key="span"
        class="zoom-extra-btn"
        :class="{ active: selectedArc === span }"
        @click="selectedArc = span"
      >{{ span }}°</button>
      <span class="zoom-extra-sep">|</span>
      <span class="zoom-extra-label">{{ $t('visualization.fan.generations') }}</span>
      <button class="zoom-extra-btn" @click="decrGens" :disabled="selectedGens <= 1">−</button>
      <span class="zoom-extra-value">{{ selectedGens }}</span>
      <button class="zoom-extra-btn" @click="incrGens" :disabled="selectedGens >= 8">+</button>
      <ChartExportControls
        :paper-size="exporter.paperSize.value"
        :orientation="exporter.orientation.value"
        :color-mode="fanToExport(colorMode)"
        :tile-count="exporter.tileCount.value"
        @update:paper-size="(v) => exporter.paperSize.value = v"
        @update:orientation="(v) => exporter.orientation.value = v"
        @update:color-mode="(v) => colorMode = exportToFan(v)"
        @save-svg="exporter.saveSvg"
        @save-pdf="exporter.savePdf"
      />
    </ZoomControls>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeFanLayout, fanViewBox, type FanSegment, type ArcSpan } from '../../utils/fanLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { PedigreeTree, PersonNode } from '../../utils/chart-layout';
import {
  branchFill, sexFill, printFill, highContrastBranchFill,
  type FanColorMode,
} from '../../utils/fanColors';
import { useFanThemeColors } from '../../composables/useFanThemeColors';
import FanChartSvg from './FanChartSvg.vue';
import ChartTooltip from './ChartTooltip.vue';
import ZoomControls from '../ZoomControls.vue';
import ChartExportControls from '../ChartExportControls.vue';
import { fanGenerations } from '../../composables/useChartGenerations';
import { useChartExport } from '../../composables/useChartExport';
import type { ColorMode as ExportColorMode } from '../../../api/chart-export';

function fanToExport(m: FanColorMode): ExportColorMode {
  if (m === 'branch') return 'themed';
  if (m === 'sex') return 'sex-colored';
  return 'bw';
}
function exportToFan(m: ExportColorMode): FanColorMode {
  if (m === 'themed') return 'branch';
  if (m === 'sex-colored') return 'sex';
  return 'bw';
}

const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

const { t } = useI18n();

const props = defineProps<{ personId: string | undefined }>();
defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const selectedGens = fanGenerations;
const selectedArc = ref<ArcSpan>(
  (parseInt(localStorage.getItem('fan-arc-span') ?? '') || 180) as ArcSpan
);
const colorMode = ref<FanColorMode>(
  (localStorage.getItem('fan-color-mode') as FanColorMode) || 'branch',
);
const outerRef = ref<HTMLElement | null>(null);
const containerWidth = ref(700);
const containerHeight = ref(500);

const arcOptions: ArcSpan[] = [180, 210, 240, 270, 360];

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-fan');

watch(selectedArc, (v) => localStorage.setItem('fan-arc-span', String(v)));
watch(colorMode, (v) => localStorage.setItem('fan-color-mode', v));

// SVG ref plumbing: FanChartSvg exposes rootRef via defineExpose
const fanSvgRef = ref<{ rootRef: SVGElement | null } | null>(null);
const svgRootRef = computed<SVGElement | null>(() => fanSvgRef.value?.rootRef ?? null);

const focalName = computed(() => {
  const tr = tree.value;
  if (!tr || !props.personId) return '?';
  const focal = Array.from(tr.nodes.values()).find(p => p.id === props.personId);
  if (!focal) return '?';
  return [focal.preferredName ?? focal.givenName, focal.surname].filter(Boolean).join(' ') || '?';
});

const exportTitle = computed(() =>
  `${t('reports.tabFanChart')} \u2014 ${focalName.value}`
);

const exporter = useChartExport({
  svgRef: svgRootRef,
  title: exportTitle,
  defaultPaperSize: 'A2',
  defaultOrientation: 'landscape',
});

const chartTheme = useFanThemeColors();

const layout = computed<FanSegment[]>(() => {
  if (!tree.value) return [];
  const isDark = chartTheme.value.dark;
  const theme = chartTheme.value.theme;
  const branches = theme.branches;
  const mode = colorMode.value;
  const hc = chartTheme.value.highContrast;

  const fillFn = (ahnNum: number, gen: number, isEmpty: boolean, person: PersonNode | null) => {
    if (hc) return highContrastBranchFill(ahnNum, gen, isEmpty, branches);
    if (mode === 'bw') return printFill(gen, isEmpty);
    if (mode === 'sex') return sexFill(person?.sex ?? 'U', gen, isEmpty, theme, isDark);
    return branchFill(ahnNum, gen, isEmpty, branches, isDark);
  };

  return computeFanLayout(tree.value, {
    arcSpan: selectedArc.value,
    maxGen: selectedGens.value,
    fillFn,
  });
});

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const viewBoxInfo = computed(() => fanViewBox(selectedArc.value, selectedGens.value));

// Scale SVG to fill container, preserving aspect ratio, then apply zoom
const svgDisplayWidth = computed(() => {
  const vb = viewBoxInfo.value;
  const aspect = vb.width / vb.height;
  const fitW = containerWidth.value;
  const fitH = containerHeight.value;
  const fitByWidth = fitW;
  const fitByHeight = fitH * aspect;
  return Math.min(fitByWidth, fitByHeight) * zoom.value;
});

const svgDisplayHeight = computed(() => {
  const vb = viewBoxInfo.value;
  const aspect = vb.width / vb.height;
  return svgDisplayWidth.value / aspect;
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      containerWidth.value = entry.contentRect.width;
      containerHeight.value = entry.contentRect.height;
    }
  });
  if (outerRef.value) resizeObserver.observe(outerRef.value);
});

onUnmounted(() => { resizeObserver?.disconnect(); });

function incrGens() { if (selectedGens.value < 8) selectedGens.value++; }
function decrGens() { if (selectedGens.value > 1) selectedGens.value--; }

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    tree.value = await fetchPedigreeTree(props.personId, selectedGens.value + 1);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
watch(selectedGens, load);
onMounted(load);
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.chart-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: safe center;
  justify-content: safe center;
}
.chart-scroll > svg { flex-shrink: 0; }
.chart-loading { color: #999; padding: 40px; text-align: center; }

.fan-seg.clickable { cursor: pointer; }
.fan-seg.clickable:hover path { opacity: 0.85; }
</style>
