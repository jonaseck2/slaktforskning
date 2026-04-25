<template>
  <div class="timeline-bar" v-if="items.length > 0">
    <div class="track" :style="{ height: trackHeight + 'px' }">
      <!-- Pass 1: stems and dots (below labels in paint order) -->
      <div
        v-for="item in positioned"
        :key="item.id"
        class="marker"
        :class="['event-' + item.eventType]"
        :style="{ left: item.leftPct + '%', '--stem-h': stemPx(item.row) + 'px' }"
      >
        <span class="marker-stem" aria-hidden="true"></span>
        <span class="marker-dot" aria-hidden="true"></span>
      </div>
      <!-- Pass 2: labels (rendered after stems so always on top) -->
      <a
        v-if="anchorBase"
        v-for="item in positioned"
        :key="'lbl-' + item.id"
        class="marker-lbl marker-link"
        :href="anchorBase + item.id"
        :style="{ left: item.leftPct + '%', '--stem-h': stemPx(item.row) + 'px' }"
        :title="item.label"
        @click.prevent="scrollToId((anchorBase + item.id).replace(/^#/, ''))"
      >
        <span class="marker-label" :style="item.labelAdjustPx ? { transform: `translateX(${item.labelAdjustPx}px)` } : undefined">{{ item.label }}</span>
      </a>
      <template v-else>
        <span
          v-for="item in positioned"
          :key="'lbl-' + item.id"
          class="marker-lbl"
          :style="{ left: item.leftPct + '%', '--stem-h': stemPx(item.row) + 'px' }"
          :title="item.label"
        >
          <span class="marker-label" :style="item.labelAdjustPx ? { transform: `translateX(${item.labelAdjustPx}px)` } : undefined">{{ item.label }}</span>
        </span>
      </template>
    </div>
    <div class="axis">
      <span class="axis-start">{{ yearMin }}</span>
      <span class="axis-end">{{ yearMax }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface TimelineItem {
  id: string;
  year: number;
  eventType: string;
  label: string;
}

const props = defineProps<{
  items: TimelineItem[];
  rangeStart?: number | null;
  rangeEnd?: number | null;
  anchorBase?: string | null;
}>();

// Layout constants (px)
const BASE_STEM   = 16;
const ROW_HEIGHT  = 22;
const LABEL_H     = 14;
const LABEL_GAP   = 2;
const DOT_SIZE    = 10;
const CHAR_W      = 6.5;  // approximate px per char at font-xs
const MIN_GAP     = 8;    // minimum gap between adjacent labels
const CONTAINER_W = 640;  // reference container width for % → px mapping

const yearMin = computed(() => {
  if (props.rangeStart != null) return props.rangeStart;
  return props.items.length ? Math.min(...props.items.map(i => i.year)) : 0;
});
const yearMax = computed(() => {
  if (props.rangeEnd != null) return props.rangeEnd;
  return props.items.length ? Math.max(...props.items.map(i => i.year)) : 0;
});

function stemPx(row: number): number {
  return BASE_STEM + row * ROW_HEIGHT;
}

const positioned = computed(() => {
  const span = Math.max(1, yearMax.value - yearMin.value);

  // Build items with leftPct, clamped to [0,100]
  const withPct = props.items.map(item => ({
    ...item,
    leftPct: Math.max(0, Math.min(100, ((item.year - yearMin.value) / span) * 100)),
    row: 0,
    labelAdjustPx: 0,
  }));

  // Greedy row assignment: process left-to-right, put each item in the first
  // row where its label doesn't overlap the previous item's label in that row.
  const rowRightEdges: number[] = [];
  const sorted = [...withPct].sort((a, b) => a.leftPct - b.leftPct);

  for (const item of sorted) {
    const centerPx = (item.leftPct / 100) * CONTAINER_W;
    const halfW = (item.label.length * CHAR_W) / 2;
    const leftEdge = centerPx - halfW;

    let assigned = false;
    for (let r = 0; r <= rowRightEdges.length; r++) {
      if (rowRightEdges[r] == null || rowRightEdges[r] + MIN_GAP <= leftEdge) {
        item.row = r;
        rowRightEdges[r] = centerPx + halfW;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      item.row = rowRightEdges.length;
      rowRightEdges.push(centerPx + halfW);
    }

    // Shift label to prevent overflow at left/right edges
    const labelLeft = centerPx - halfW;
    const labelRight = centerPx + halfW;
    if (labelLeft < 0) item.labelAdjustPx = -labelLeft;
    else if (labelRight > CONTAINER_W) item.labelAdjustPx = CONTAINER_W - labelRight;
  }

  return sorted;
});

const maxRow = computed(() =>
  positioned.value.reduce((m, i) => Math.max(m, i.row), 0)
);

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Track height = tallest marker (label + gap + stem + dot) + a little breathing room
const trackHeight = computed(() =>
  LABEL_H + LABEL_GAP + stemPx(maxRow.value) + DOT_SIZE + 4
);
</script>

<style scoped>
.timeline-bar { padding: var(--space-lg) 0; }

.track {
  position: relative;
}
.track::after {
  content: '';
  position: absolute;
  bottom: 5px; /* half of 10px dot */
  left: 0; right: 0;
  height: 2px;
  background: var(--text-primary);
}

/* Pass 1: stem + dot */
.marker {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Pass 2: label wrapper — positioned above the stem+dot */
.marker-lbl {
  position: absolute;
  bottom: calc(var(--stem-h, 16px) + 10px); /* 10px = dot height */
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.marker-link {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.marker-link:hover .marker-label {
  color: var(--accent);
}

.marker-label {
  font-size: var(--font-xs);
  white-space: nowrap;
  color: var(--text-secondary);
  line-height: 1;
  background: var(--surface-bg, white);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  padding: 0 3px;
  border-radius: 2px;
}
.marker-stem {
  width: 1px;
  height: var(--stem-h, 16px);
  background: var(--surface-border-subtle);
  flex-shrink: 0;
}
.marker-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--accent);
  flex-shrink: 0;
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: var(--space-sm);
}
</style>
