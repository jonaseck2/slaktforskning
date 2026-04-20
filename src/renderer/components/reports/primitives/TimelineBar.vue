<template>
  <div class="timeline-bar" v-if="items.length > 0">
    <div class="track" :style="{ width: '100%' }">
      <div
        v-for="item in positioned"
        :key="item.id"
        class="marker"
        :class="['event-' + item.eventType]"
        :style="{ left: item.leftPct + '%' }"
        :title="item.label"
      >
        <span class="marker-dot" aria-hidden="true"></span>
        <span class="marker-label">{{ item.label }}</span>
      </div>
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
}>();

const yearMin = computed(() => {
  if (props.rangeStart != null) return props.rangeStart;
  if (!props.items.length) return 0;
  return Math.min(...props.items.map(i => i.year));
});
const yearMax = computed(() => {
  if (props.rangeEnd != null) return props.rangeEnd;
  if (!props.items.length) return 0;
  return Math.max(...props.items.map(i => i.year));
});

const positioned = computed(() => {
  const span = Math.max(1, yearMax.value - yearMin.value);
  return props.items.map(item => ({
    ...item,
    leftPct: ((item.year - yearMin.value) / span) * 100,
  }));
});
</script>

<style scoped>
.timeline-bar { padding: var(--space-lg) 0; }
.track {
  position: relative;
  height: 4px;
  background: var(--surface-border);
  margin-bottom: var(--space-lg);
}
.marker {
  position: absolute; top: -6px;
  transform: translateX(-50%);
  text-align: center;
}
.marker-dot {
  display: block;
  width: 12px; height: 12px;
  border-radius: var(--radius-full);
  background: var(--accent);
  margin: 0 auto 2px;
}
.marker-label {
  display: block;
  font-size: var(--font-xs);
  white-space: nowrap;
  color: var(--text-secondary);
}
.axis {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
