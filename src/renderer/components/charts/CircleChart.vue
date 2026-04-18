<!-- src/renderer/components/charts/CircleChart.vue -->
<template>
  <div class="chart-outer" ref="outerRef">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <CircleChartSvg
        v-else
        :segments="layout"
        :focal-segment="focalSegment"
        :curved-text="curvedText"
        :width="svgDisplaySize"
        :height="svgDisplaySize"
        :stroke-color="dark ? 'rgba(255,255,255,0.15)' : 'white'"
        :empty-pattern-stroke="dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'"
        :focal-shadow-color="dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)'"
        :no-gradients="highContrast"
        @navigate="$emit('navigate', $event)"
        @personenter="(p, e) => tooltipRef?.show(p, e.clientX, e.clientY)"
        @personmove="(e) => tooltipRef?.move(e.clientX, e.clientY)"
        @personleave="tooltipRef?.hide()"
      />
    </div>

    <ChartTooltip ref="tooltipRef" />
    <div class="zoom-controls">
      <span class="zoom-label">Generationer:</span>
      <button class="zoom-btn" @click="decrGens" :disabled="selectedGens <= 1">−</button>
      <span class="zoom-level">{{ selectedGens }}</span>
      <button class="zoom-btn" @click="incrGens" :disabled="selectedGens >= 6">+</button>
      <span class="zoom-sep">|</span>
      <button
        class="zoom-btn"
        :class="{ active: curvedText }"
        @click="curvedText = !curvedText"
        title="Böj text längs cirkeln"
      >⌒</button>
      <span class="zoom-sep">|</span>
      <button
        class="zoom-btn"
        :class="{ active: colorMode === 'sex' }"
        @click="toggleColorMode"
        :title="$t('visualization.circleColorMode')"
      >{{ colorMode === 'branch' ? $t('visualization.circleColorBranch') : $t('visualization.circleColorSex') }}</button>
      <span class="zoom-sep">|</span>
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeCircleLayout, type CircleSegment } from '../../utils/circleLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { PedigreeTree } from '../../utils/chart-layout';
import {
  readThemeColors, isDarkMode, isHighContrast,
  branchBaseColors, branchFill, sexFill, highContrastBranchFill,
  type CircleColorMode,
} from '../../utils/circleColors';
import CircleChartSvg from './CircleChartSvg.vue';
import ChartTooltip from './ChartTooltip.vue';

const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const selectedGens = ref(6);
const curvedText = ref(false);
const colorMode = ref<CircleColorMode>(
  (localStorage.getItem('circle-color-mode') as CircleColorMode) || 'branch',
);
const outerRef = ref<HTMLElement | null>(null);
const containerSize = ref(700);

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-circle');

// Scale SVG to fill container, then apply zoom on top
const svgDisplaySize = computed(() => containerSize.value * zoom.value);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      containerSize.value = Math.min(width, height);
    }
  });
  if (outerRef.value) resizeObserver.observe(outerRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

function incrGens() { if (selectedGens.value < 6) selectedGens.value++; }
function decrGens() { if (selectedGens.value > 1) selectedGens.value--; }
function toggleColorMode() {
  colorMode.value = colorMode.value === 'branch' ? 'sex' : 'branch';
}
watch(colorMode, (v) => localStorage.setItem('circle-color-mode', v));

const dark = computed(() => isDarkMode());
const highContrast = computed(() => isHighContrast());

const layout = computed<CircleSegment[]>(() => {
  if (!tree.value) return [];
  const isDark = dark.value;
  const theme = readThemeColors();
  const branches = branchBaseColors(theme.accent);

  if (highContrast.value) {
    return computeCircleLayout(tree.value, selectedGens.value, (ahnNum, gen, isEmpty) => {
      return highContrastBranchFill(ahnNum, gen, isEmpty, branches);
    });
  }

  return computeCircleLayout(tree.value, selectedGens.value, (ahnNum, gen, isEmpty, person) => {
    if (colorMode.value === 'sex' && person) {
      return sexFill(person.sex, gen, isEmpty, theme, isDark);
    }
    return branchFill(ahnNum, gen, isEmpty, branches, isDark);
  });
});

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    // selectedGens + 1: focal (gen 0) + N ancestor rings
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
.chart-scroll > svg {
  flex-shrink: 0;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }

.circle-seg.clickable { cursor: pointer; }
.circle-seg.clickable:hover path { opacity: 0.85; }

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 3px 5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover { background: var(--color-bg-muted); }
.zoom-btn.active { background: #e0eaf5; color: #2060a0; }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: #666;
  min-width: 24px;
  text-align: center;
}
.zoom-sep {
  color: #ccc;
  padding: 0 3px;
}
.zoom-label {
  font-size: 11px;
  color: #888;
  padding: 0 4px 0 2px;
}
</style>
