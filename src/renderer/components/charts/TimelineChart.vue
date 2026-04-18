<template>
  <div class="chart-outer">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-else-if="layout.bars.length > 0">
        <svg
          :width="layout.svgWidth * zoom"
          :height="layout.svgHeight * zoom"
          :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
          data-testid="timeline-svg"
        >
          <!-- Axis -->
          <line
            :x1="LEFT" :y1="layout.axisY"
            :x2="layout.svgWidth - RIGHT" :y2="layout.axisY"
            stroke="#ddd" stroke-width="1"
          />
          <!-- Tick marks -->
          <g v-for="tick in layout.ticks" :key="tick.year">
            <line
              :x1="tick.x" :y1="TOP"
              :x2="tick.x" :y2="layout.axisY"
              stroke="#f0f0f0" stroke-width="1"
            />
            <text
              :x="tick.x" :y="layout.axisY + 16"
              class="tick-label" text-anchor="middle"
            >{{ tick.year }}</text>
          </g>
          <!-- Today line -->
          <line
            :x1="layout.todayX" :y1="TOP - 4"
            :x2="layout.todayX" :y2="layout.axisY"
            stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3"
          />
          <text
            :x="layout.todayX" :y="TOP - 8"
            class="today-label" text-anchor="middle"
          >{{ $t('visualization.today') }}</text>

          <!-- Person bars -->
          <g
            v-for="bar in layout.bars"
            :key="bar.person.id"
            :data-testid="'timeline-row-' + bar.person.id"
            :class="['timeline-row', { focal: bar.isFocal }]"
            :style="{ cursor: readonly ? 'default' : undefined }"
            @click="!readonly && $emit('navigate', bar.person.id)"
          >
            <text
              :x="LEFT - 8" :y="bar.y + bar.h / 2 + (ROW_H - bar.h) / 2"
              class="row-label" :class="{ 'focal-label': bar.isFocal }"
              text-anchor="end" dominant-baseline="middle"
            ><tspan
                v-for="(part, pi) in truncateNameParts(chartNameParts(bar.person.givenName, bar.person.surname, bar.person.preferredName), 22)"
                :key="pi"
                :text-decoration="part.underline ? 'underline' : undefined"
              >{{ part.text }}</tspan></text>

            <rect
              v-if="!bar.hasNoDate"
              :x="bar.x" :y="bar.y"
              :width="bar.w" :height="bar.h"
              :fill="bar.isFocal ? '#2c3e50' : sexColor(bar.person.sex)"
              :opacity="bar.person.living ? 1 : 0.7"
              rx="3"
            />
            <text
              v-else
              :x="LEFT + 4" :y="bar.y + bar.h / 2"
              class="no-date-label" dominant-baseline="middle"
            >?</text>
            <!-- Living arrow -->
            <text
              v-if="!bar.hasNoDate && bar.isOpen"
              :x="bar.x + bar.w + 4" :y="bar.y + bar.h / 2"
              class="living-arrow" dominant-baseline="middle"
            >→</text>
          </g>
        </svg>
      </template>
      <div v-else-if="!loading" class="chart-empty">—</div>
    </div>
    <div v-if="!readonly" class="zoom-controls">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in (Ctrl+scroll)">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeTimelineLayout } from '../../utils/chart-layout';
import { fetchTimelineEntries } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { TimelineLayout, PersonNode } from '../../utils/chart-layout';
import { chartNameParts, truncateNameParts } from '../../utils/nameUtils';

useI18n();

const props = defineProps<{ personId: string | undefined; readonly?: boolean }>();
const emit = defineEmits<{ navigate: [id: string] }>();

// Mirror constants from chart-layout
const LEFT = 164;
const RIGHT = 30;
const TOP = 20;
const ROW_H = 36;

const loading = ref(true);
const layout = ref<TimelineLayout>({ bars: [], ticks: [], todayX: 0, svgWidth: 800, svgHeight: 100, axisY: 60 });

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-timeline');

const SEX_COLORS: Record<string, string> = {
  M: getComputedStyle(document.documentElement).getPropertyValue('--sex-m-bg').trim() || '#7eb8f7',
  F: getComputedStyle(document.documentElement).getPropertyValue('--sex-f-bg').trim() || '#f7a5c0',
  U: getComputedStyle(document.documentElement).getPropertyValue('--sex-u-bg').trim() || '#bbb',
};
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#bbb'; }

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const entries = await fetchTimelineEntries(props.personId);
    layout.value = computeTimelineLayout(entries, new Date().getFullYear());
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }
.chart-empty { color: #bbb; padding: 40px; text-align: center; }
.timeline-row { cursor: pointer; }
.timeline-row.focal { cursor: default; }
.timeline-row:not(.focal):hover rect { opacity: 0.85; }
.row-label { fill: #444; font-size: 12px; font-family: inherit; }
.focal-label { font-weight: 700; fill: var(--color-primary); }
.tick-label { fill: #aaa; font-size: 11px; font-family: inherit; }
.today-label { fill: #ef4444; font-size: 11px; font-family: inherit; }
.no-date-label { fill: #ccc; font-size: 14px; font-family: inherit; }
.living-arrow { fill: #888; font-size: 13px; font-family: inherit; }

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
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: #666;
  min-width: 38px;
  text-align: center;
}
</style>
