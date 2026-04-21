<template>
  <div class="chart-outer" ref="outerRef">
    <div v-if="loading && layout.bars.length > 0" class="chart-reload-indicator" aria-live="polite">{{ $t('common.loading') }}</div>
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading && layout.bars.length === 0" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-if="layout.bars.length > 0">
        <svg
          :width="layout.svgWidth * zoom"
          :height="layout.svgHeight * zoom"
          :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
          class="timeline-svg"
          :style="{ background: tlColors.surface }"
          data-testid="timeline-svg"
          @mouseleave="hoveredId = null"
        >
          <defs>
            <!-- Gradient definitions for bar fills — stop-color bound as hex so SVG export works -->
            <linearGradient id="tl-grad-m" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="tlColors.barM" stop-opacity="1" />
              <stop offset="100%" :stop-color="tlColors.barM" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-f" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="tlColors.barF" stop-opacity="1" />
              <stop offset="100%" :stop-color="tlColors.barF" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-u" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="tlColors.barU" stop-opacity="1" />
              <stop offset="100%" :stop-color="tlColors.barU" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-focal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="tlColors.barFocal" stop-opacity="1" />
              <stop offset="100%" :stop-color="tlColors.barFocal" stop-opacity="0.7" />
            </linearGradient>
          </defs>

          <!-- Grid lines (behind everything) -->
          <g class="tl-grid">
            <line
              v-for="tick in layout.ticks" :key="'grid-' + tick.year"
              :x1="tick.x" :y1="TOP"
              :x2="tick.x" :y2="layout.axisY"
              :stroke="tlColors.grid" stroke-width="1"
            />
            <!-- Century markers: thicker line -->
            <line
              v-for="tick in centuryTicks" :key="'century-' + tick.year"
              :x1="tick.x" :y1="TOP"
              :x2="tick.x" :y2="layout.axisY"
              :stroke="tlColors.axis" stroke-width="1.5"
            />
          </g>

          <!-- Axis line -->
          <line
            :x1="LEFT" :y1="layout.axisY"
            :x2="layout.svgWidth - RIGHT" :y2="layout.axisY"
            :stroke="tlColors.axis" stroke-width="1"
          />

          <!-- Tick labels at top -->
          <g class="tl-tick-labels">
            <text
              v-for="tick in layout.ticks" :key="'label-' + tick.year"
              :x="tick.x" :y="TOP - 4"
              class="tick-label" text-anchor="middle"
              :fill="tlColors.tick"
            >{{ tick.year }}</text>
          </g>

          <!-- Today line -->
          <line
            :x1="layout.todayX" :y1="TOP - 14"
            :x2="layout.todayX" :y2="layout.axisY"
            :stroke="tlColors.today" stroke-width="1.5" stroke-dasharray="4 3"
          />
          <text
            :x="layout.todayX" :y="TOP - 18"
            class="today-label" text-anchor="middle"
            :fill="tlColors.today"
          >{{ $t('visualization.today') }}</text>

          <!-- Person bars -->
          <g
            v-for="bar in layout.bars"
            :key="bar.person.id"
            :data-testid="'timeline-row-' + bar.person.id"
            :class="['timeline-row', { focal: bar.isFocal, hovered: hoveredId === bar.person.id }]"
            :style="{ cursor: readonly ? 'default' : undefined }"
            @click="!readonly && $emit('navigate', bar.person.id)"
            @mouseenter="hoveredId = bar.person.id"
            @mouseleave="hoveredId = null"
          >
            <!-- Person name (left side) -->
            <text
              :x="LEFT - 8" :y="bar.y + bar.h / 2"
              class="row-label" :class="{ 'focal-label': bar.isFocal }"
              text-anchor="end" dominant-baseline="middle"
              :fill="bar.isFocal ? tlColors.textFocal : tlColors.text"
              :font-weight="bar.isFocal ? '700' : undefined"
            ><tspan
                v-for="(part, pi) in truncateNameParts(fullNameParts(bar.person.givenName, bar.person.surname, bar.person.preferredName, bar.person.nickname), 22)"
                :key="pi"
                :text-decoration="part.underline ? 'underline' : undefined"
              >{{ part.text }}</tspan></text>

            <!-- Bar rect with gradient -->
            <rect
              v-if="!bar.hasNoDate"
              :x="bar.x" :y="bar.y"
              :width="bar.w" :height="bar.h"
              :fill="barGradient(bar)"
              :opacity="bar.person.living ? 1 : 0.8"
              :rx="bar.h / 2"
              :ry="bar.h / 2"
              class="tl-bar"
            />

            <!-- No-date placeholder -->
            <text
              v-if="bar.hasNoDate"
              :x="LEFT + 4" :y="bar.y + bar.h / 2"
              class="no-date-label" dominant-baseline="middle"
              :fill="tlColors.textMuted"
            >?</text>

            <!-- Living arrow (animated pulse) -->
            <g v-if="!bar.hasNoDate && bar.isOpen" class="living-pulse">
              <circle
                :cx="bar.x + bar.w" :cy="bar.y + bar.h / 2"
                :r="bar.h / 2"
                :fill="barGradient(bar)" opacity="0.5"
              >
                <animate attributeName="r" :values="`${bar.h / 2};${bar.h / 2 + 4};${bar.h / 2}`" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>

            <!-- Birth year label at bar start -->
            <text
              v-if="!bar.hasNoDate && birthYear(bar)"
              :x="bar.x - 3" :y="bar.y + bar.h + 12"
              class="year-label" text-anchor="end"
              :fill="tlColors.tick"
            >{{ birthYear(bar) }}</text>

            <!-- Death year label at bar end -->
            <text
              v-if="!bar.hasNoDate && deathYear(bar)"
              :x="bar.x + bar.w + 3" :y="bar.y + bar.h + 12"
              class="year-label" text-anchor="start"
              :fill="tlColors.tick"
            >{{ deathYear(bar) }}</text>

            <!-- Event markers (symbols above bars) -->
            <g v-for="(marker, mi) in bar.markers" :key="mi" class="event-marker">
              <text
                :x="marker.x"
                :y="bar.y - 3"
                class="marker-symbol"
                text-anchor="middle"
                dominant-baseline="auto"
                :fill="tlColors.marker"
              >{{ marker.symbol }}</text>
            </g>
          </g>

          <!-- Hover tooltip -->
          <foreignObject
            v-if="hoveredBar && !hoveredBar.hasNoDate"
            :x="tooltipX" :y="tooltipY"
            width="220" height="80"
            class="tl-tooltip-fo"
            style="pointer-events: none;"
          >
            <div xmlns="http://www.w3.org/1999/xhtml" class="tl-tooltip">
              <strong>{{ displayName(hoveredBar.person) }}</strong>
              <div v-if="birthYear(hoveredBar)">{{ $t('visualization.timelineBorn') }}: {{ birthYear(hoveredBar) }}</div>
              <div v-if="deathYear(hoveredBar)">{{ $t('visualization.timelineDied') }}: {{ deathYear(hoveredBar) }}</div>
              <div v-if="age(hoveredBar)">{{ $t('visualization.timelineAge') }}: {{ age(hoveredBar) }}</div>
            </div>
          </foreignObject>
        </svg>
      </template>
      <div v-else-if="!loading" class="chart-empty">—</div>
    </div>
    <ZoomControls v-if="!readonly" overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
      <button class="zoom-extra-btn" @click="decrGens" :disabled="genTarget <= 1">−</button>
      <span class="zoom-extra-value">{{ genTarget }}</span>
      <button class="zoom-extra-btn" @click="incrGens">+</button>
    </ZoomControls>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeTimelineLayout } from '../../utils/chart-layout';
import { fetchTimelineEntries } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { TimelineLayout, TimelineEntry, BarLayout, PersonNode } from '../../utils/chart-layout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';
import { yearFromDate } from '../../utils/chart-layout/utils';
import ZoomControls from '../ZoomControls.vue';
import { timelineGenerations } from '../../composables/useChartGenerations';
import { useThemeSignal } from '../../composables/useThemeSignal';
import type { ColorMode } from '../../../api/chart-export';

useI18n();

const props = defineProps<{ personId: string | undefined; readonly?: boolean; colorMode?: ColorMode }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const themeVersion = useThemeSignal();
const tlColors = computed(() => {
  void themeVersion.value;
  const mode = props.colorMode ?? 'themed';
  if (mode === 'bw') {
    return {
      surface:    '#ffffff',
      barM:       '#aaaaaa',
      barF:       '#aaaaaa',
      barU:       '#aaaaaa',
      barFocal:   '#444444',
      grid:       '#e0e0e0',
      axis:       '#888888',
      today:      '#000000',
      text:       '#333333',
      textFocal:  '#000000',
      tick:       '#888888',
      textMuted:  '#aaaaaa',
      marker:     '#333333',
    };
  }
  const s = getComputedStyle(document.documentElement);
  const g = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    surface:    g('--surface-bg',     '#ffffff'),
    barM:       g('--tl-bar-m',       '#7eb8f7'),
    barF:       g('--tl-bar-f',       '#f7a5c0'),
    barU:       g('--tl-bar-u',       '#bbbbbb'),
    barFocal:   g('--accent',         '#2c3e50'),
    grid:       g('--tl-grid',        '#f0f0f0'),
    axis:       g('--tl-axis',        '#dddddd'),
    today:      g('--tl-today',       '#ef4444'),
    text:       g('--text-secondary', '#555555'),
    textFocal:  g('--text-primary',   '#111111'),
    tick:       g('--text-muted',     '#888888'),
    textMuted:  g('--text-muted',     '#888888'),
    marker:     g('--text-primary',   '#333333'),
  };
});

const LEFT = 164;
const RIGHT = 30;
const TOP = 20;

const loading = ref(true);
const layout = ref<TimelineLayout>({ bars: [], ticks: [], todayX: 0, svgWidth: 800, svgHeight: 100, axisY: 60 });
const hoveredId = ref<string | null>(null);
const containerWidth = ref(800);
const outerRef = ref<HTMLElement | null>(null);
const genTarget = timelineGenerations;
watch(genTarget, () => load());

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-timeline');

// Responsive width via ResizeObserver
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (outerRef.value) {
    containerWidth.value = outerRef.value.clientWidth;
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(outerRef.value);
  }
});
onUnmounted(() => {
  resizeObserver?.disconnect();
});

const hoveredBar = computed(() =>
  hoveredId.value ? layout.value.bars.find(b => b.person.id === hoveredId.value) ?? null : null,
);

const centuryTicks = computed(() =>
  layout.value.ticks.filter(t => t.year % 100 === 0),
);

const tooltipX = computed(() => {
  if (!hoveredBar.value) return 0;
  const bar = hoveredBar.value;
  const x = bar.x + bar.w / 2 - 110;
  return Math.max(LEFT, Math.min(x, layout.value.svgWidth - RIGHT - 220));
});

const tooltipY = computed(() => {
  if (!hoveredBar.value) return 0;
  return hoveredBar.value.y + hoveredBar.value.h + 4;
});

function barGradient(bar: BarLayout): string {
  if (bar.isFocal) return 'url(#tl-grad-focal)';
  switch (bar.person.sex) {
    case 'M': return 'url(#tl-grad-m)';
    case 'F': return 'url(#tl-grad-f)';
    default: return 'url(#tl-grad-u)';
  }
}

function birthYear(bar: BarLayout): number | null {
  return yearFromDate(bar.person.birthDate);
}

function deathYear(bar: BarLayout): number | null {
  return yearFromDate(bar.person.deathDate);
}

function age(bar: BarLayout): number | null {
  const b = birthYear(bar);
  const d = deathYear(bar);
  if (b === null) return null;
  if (d !== null) return d - b;
  if (bar.person.living) return new Date().getFullYear() - b;
  return null;
}

function displayName(person: PersonNode): string {
  return [person.givenName, person.surname].filter(Boolean).join(' ') || '?';
}

// Cache fetched entries so resize can re-layout without re-fetching
const cachedEntries = ref<TimelineEntry[]>([]);

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    cachedEntries.value = await fetchTimelineEntries(props.personId, genTarget.value);
    layout.value = computeTimelineLayout(cachedEntries.value, new Date().getFullYear(), containerWidth.value);
  } finally {
    loading.value = false;
  }
}

function decrGens() {
  if (genTarget.value <= 1) return;
  genTarget.value--;
  load();
}

function incrGens() {
  genTarget.value++;
  load();
}

// Re-layout when container resizes — uses cached entries, no API call
watch(containerWidth, () => {
  if (cachedEntries.value.length > 0) {
    layout.value = computeTimelineLayout(cachedEntries.value, new Date().getFullYear(), containerWidth.value);
  }
});

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
.chart-loading { color: var(--text-muted); padding: 40px; text-align: center; }
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
.chart-empty { color: var(--text-muted); padding: 40px; text-align: center; }

.timeline-svg { background: var(--surface); }

.timeline-row { cursor: pointer; }
.timeline-row.focal { cursor: default; }
.timeline-row:not(.focal):hover .tl-bar { filter: brightness(1.1); }
.timeline-row.hovered .tl-bar { filter: brightness(1.15); }

.tl-bar { transition: filter 0.15s ease; }

.row-label { font-size: var(--font-sm); font-family: inherit; }
.tick-label { font-size: var(--font-xs); font-family: inherit; }
.today-label { font-size: var(--font-xs); font-family: inherit; font-weight: 600; }
.no-date-label { font-size: var(--font-base); font-family: inherit; }
.year-label { font-size: 9px; font-family: inherit; }
.marker-symbol { font-size: 10px; font-family: inherit; }

.tl-tooltip {
  background: var(--tl-tooltip-bg);
  border: 1px solid var(--tl-tooltip-border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-xs);
  color: var(--tl-tooltip-text);
  box-shadow: var(--shadow-md);
  line-height: 1.5;
}
.tl-tooltip strong {
  display: block;
  margin-bottom: 2px;
}

.living-pulse circle {
  pointer-events: none;
}

/* Print: hide interactive elements, no animations */
@media print {
  .living-pulse { display: none; }
  .timeline-svg { background: #fff !important; }
  .tl-tooltip-fo { display: none; }
  .tl-bar { opacity: 1 !important; }
}
</style>
