<!-- src/renderer/components/charts/FanChart.vue -->
<template>
  <div class="chart-outer">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="FAN_SVG_SIZE * zoom"
        :height="FAN_SVG_SIZE * zoom"
        :viewBox="`0 0 ${FAN_SVG_SIZE} ${FAN_SVG_SIZE}`"
        data-testid="fan-svg"
      >
        <!-- Non-focal segments -->
        <g
          v-for="seg in nonFocalSegments"
          :key="seg.ahnNum"
          :class="['fan-seg', { clickable: !seg.isEmpty }]"
          @click="!seg.isEmpty && $emit('navigate', seg.person!.id)"
        >
          <path
            :d="seg.pathD"
            :fill="seg.fill"
            stroke="white"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <!-- Hover tooltip via native SVG title (works in Electron WebView) -->
          <title v-if="seg.person">{{ tooltipLabel(seg) }}</title>

          <!-- Text for gen 1–5 (gen 6 is too narrow) -->
          <g
            v-if="seg.person && seg.generation <= 5"
            :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`"
          >
            <text
              :x="seg.textX"
              :y="seg.textY - (seg.generation <= 4 ? 5 : 0)"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="600"
              fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ primaryLabel(seg) }}</text>
            <text
              v-if="seg.generation <= 4 && birthYear(seg)"
              :x="seg.textX"
              :y="seg.textY + 6"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ birthYear(seg) }}</text>
          </g>
        </g>

        <!-- Focal person circle (rendered on top of segments) -->
        <circle
          v-if="focalSegment"
          :cx="FAN_CX" :cy="FAN_CY" r="32"
          :fill="focalSegment.fill"
        />
        <text
          v-if="focalSegment?.person"
          :x="FAN_CX" :y="FAN_CY - 7"
          text-anchor="middle"
          font-size="10"
          font-weight="600"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="white"
          style="pointer-events: none; user-select: none;"
        >{{ focalName }}</text>
        <text
          v-if="focalSegment?.person"
          :x="FAN_CX" :y="FAN_CY + 6"
          text-anchor="middle"
          font-size="8"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="rgba(255,255,255,0.65)"
          style="pointer-events: none; user-select: none;"
        >{{ focalDates }}</text>
      </svg>
    </div>

    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeFanLayout, FAN_CX, FAN_CY, FAN_SVG_SIZE, type FanSegment } from '../../utils/fanLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { fullNameParts } from '../../utils/nameUtils';
import type { PedigreeTree } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-fan');

const layout = computed<FanSegment[]>(() =>
  tree.value ? computeFanLayout(tree.value) : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const nonFocalSegments = computed(() => layout.value.filter(s => !s.isFocal));

const focalName = computed(() => {
  const p = focalSegment.value?.person;
  if (!p) return '';
  return fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
});

const focalDates = computed(() => {
  const p = focalSegment.value?.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
});

function primaryLabel(seg: FanSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  if (seg.generation <= 2) {
    return fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
      .map(pt => pt.text).join('');
  }
  return p.surname ?? p.givenName ?? '';
}

function birthYear(seg: FanSegment): string {
  return seg.person?.birthYear ? String(seg.person.birthYear) : '';
}

function tooltipLabel(seg: FanSegment): string {
  const p = seg.person!;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const dates = p.birthYear && p.deathYear
    ? ` (${p.birthYear}–${p.deathYear})`
    : p.birthYear ? ` (${p.birthYear}–)` : '';
  return name + dates;
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 10, 2: 9, 3: 8.5, 4: 8, 5: 7 };
  return sizes[gen] ?? 7;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 8, 2: 7.5, 3: 7, 4: 6.5 };
  return sizes[gen] ?? 6.5;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    // generations=7: focal (gen 0) + 6 ancestor rings (gens 1–6)
    tree.value = await fetchPedigreeTree(props.personId, 7);
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

.fan-seg.clickable { cursor: pointer; }
.fan-seg.clickable:hover path { opacity: 0.85; }

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
  font-size: 14px;
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover { background: #f0f0f0; }
.zoom-level {
  padding: 0 4px;
  font-size: 12px;
  color: #666;
  min-width: 38px;
  text-align: center;
}
</style>
