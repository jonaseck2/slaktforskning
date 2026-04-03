<template>
  <div class="timeline-chart">
    <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
    <svg
      v-else-if="layout.bars.length > 0"
      :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
      width="100%"
      :style="{ maxWidth: layout.svgWidth + 'px' }"
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
        @click="!bar.isFocal && $emit('navigate', bar.person.id)"
      >
        <text
          :x="LEFT - 8" :y="bar.y + bar.h / 2 + (ROW_H - bar.h) / 2"
          class="row-label" :class="{ 'focal-label': bar.isFocal }"
          text-anchor="end" dominant-baseline="middle"
        >{{ truncate(personName(bar.person), 22) }}</text>

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
    <div v-else-if="!loading" class="chart-empty">—</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeTimelineLayout } from '../../utils/chartLayout';
import { fetchTimelineEntries } from '../../utils/chartData';
import type { TimelineLayout, PersonNode } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

// Match chartLayout.ts constants (exported via the module but convenient to mirror here)
const LEFT = 164;
const RIGHT = 30;
const TOP = 20;
const ROW_H = 36;

const loading = ref(true);
const layout = ref<TimelineLayout>({ bars: [], ticks: [], todayX: 0, svgWidth: 800, svgHeight: 100, axisY: 60 });

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#bbb' };
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#bbb'; }

function personName(p: PersonNode): string {
  return [p.givenName, p.surname].filter(Boolean).join(' ') || '(okänd)';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

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
.timeline-chart { width: 100%; }
.chart-loading { color: #999; padding: 40px; text-align: center; }
.chart-empty { color: #bbb; padding: 40px; text-align: center; }
.timeline-row { cursor: pointer; }
.timeline-row.focal { cursor: default; }
.timeline-row:not(.focal):hover rect { opacity: 0.85; }
.row-label { fill: #444; font-size: 12px; font-family: inherit; }
.focal-label { font-weight: 700; fill: #2c3e50; }
.tick-label { fill: #aaa; font-size: 11px; font-family: inherit; }
.today-label { fill: #ef4444; font-size: 11px; font-family: inherit; }
.no-date-label { fill: #ccc; font-size: 14px; font-family: inherit; }
.living-arrow { fill: #888; font-size: 13px; font-family: inherit; }
</style>
