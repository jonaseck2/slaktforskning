<!-- src/renderer/components/charts/FanChart.vue -->
<template>
  <div class="chart-outer" ref="outerRef">
    <div v-if="loading && tree" class="chart-reload-indicator" aria-live="polite">{{ $t('common.loading') }}</div>
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading && !tree" class="chart-loading">{{ $t('common.loading') }}</div>
      <FanChartSvg
        v-if="tree"
        :segments="layout"
        :focal-segment="focalSegment"
        :focal-cx="viewBoxInfo.cx"
        :focal-cy="viewBoxInfo.cy"
        :vb-width="viewBoxInfo.width"
        :vb-height="viewBoxInfo.height"
        :arc-span="selectedArc"
        :width="svgDisplayWidth"
        :height="svgDisplayHeight"
        :stroke-color="colorMode === 'bw' ? '#999' : (chartTheme.dark ? 'rgba(255,255,255,0.15)' : 'white')"
        :empty-pattern-stroke="colorMode === 'bw' ? 'rgba(0,0,0,0.08)' : (chartTheme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)')"
        :focal-shadow-color="colorMode === 'bw' ? 'rgba(0,0,0,0.15)' : (chartTheme.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)')"
        :no-gradients="chartTheme.highContrast || colorMode === 'bw'"
        @navigate="$emit('navigate', $event)"
      />
    </div>

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
      <span class="zoom-extra-sep">|</span>
      <button class="zoom-extra-btn" :title="$t('chart.export.colorMode')" @click="cycleColorMode">
        {{ colorModeLabel }}
      </button>
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
import ZoomControls from '../ZoomControls.vue';
import { fanGenerations } from '../../composables/useChartGenerations';
import { STORAGE_KEYS } from '../../utils/storage-keys';

const { t } = useI18n();

const props = defineProps<{ personId: string | undefined }>();
defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const selectedGens = fanGenerations;
const selectedArc = ref<ArcSpan>(
  (parseInt(localStorage.getItem(STORAGE_KEYS.fanArcSpan) ?? '') || 180) as ArcSpan
);
const colorMode = ref<FanColorMode>(
  (localStorage.getItem(STORAGE_KEYS.fanColorMode) as FanColorMode) || 'branch',
);
const outerRef = ref<HTMLElement | null>(null);
const containerWidth = ref(700);
const containerHeight = ref(500);

const arcOptions: ArcSpan[] = [180, 210, 240, 270, 360];

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, STORAGE_KEYS.vizZoomFan);

watch(selectedArc, (v) => localStorage.setItem(STORAGE_KEYS.fanArcSpan, String(v)));
watch(colorMode, (v) => localStorage.setItem(STORAGE_KEYS.fanColorMode, v));

function cycleColorMode() {
  const order: FanColorMode[] = ['branch', 'sex', 'bw'];
  const idx = order.indexOf(colorMode.value);
  colorMode.value = order[(idx + 1) % order.length];
}
const colorModeLabel = computed(() => {
  if (colorMode.value === 'branch') return t('chart.export.themed');
  if (colorMode.value === 'sex') return t('chart.export.sexColored');
  return t('chart.export.blackWhite');
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
// While a panel drag is active the chart pins to its last committed size and
// stages incoming dimensions in pendingW/pendingH; on mouseup we commit once.
// Re-rendering hundreds of arc paths + textPaths per frame during drag is the
// bottleneck — this gives a snappy drag, then a single fit on release.
let isPanelResizing = false;
let pendingW = 0;
let pendingH = 0;

function commitPending() {
  if (pendingW > 0) containerWidth.value = pendingW;
  if (pendingH > 0) containerHeight.value = pendingH;
}

function onDocMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest?.('.panel-drag-handle')) {
    isPanelResizing = true;
    document.addEventListener('mouseup', onDocMouseUp, { once: true });
  }
}

function onDocMouseUp() {
  isPanelResizing = false;
  commitPending();
}

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      pendingW = entry.contentRect.width;
      pendingH = entry.contentRect.height;
    }
    if (containerWidth.value === 0 || containerHeight.value === 0 || !isPanelResizing) {
      commitPending();
    }
  });
  if (outerRef.value) resizeObserver.observe(outerRef.value);
  document.addEventListener('mousedown', onDocMouseDown);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('mouseup', onDocMouseUp);
});

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
.chart-reload-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  color: var(--text-muted);
  font-size: var(--font-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  pointer-events: none;
  z-index: 20;
  box-shadow: var(--shadow-sm);
}

.fan-seg.clickable { cursor: pointer; }
.fan-seg.clickable:hover path { opacity: 0.85; }
</style>
