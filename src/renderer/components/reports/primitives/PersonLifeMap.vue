<template>
  <section v-if="!loading && points.length > 0" class="report-section">
    <h2 v-if="heading" class="section-heading">{{ heading }}</h2>
    <LifeMap
      :points="points"
      :height="height"
      :draw-path="drawPath"
      :path-color="pathColor"
      :aria-label="ariaLabel"
      :show-caption="showCaption"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LifeMap, { type LifeMapPathPoint } from './LifeMap.vue';
import { useLifeMap } from '../../../composables/useLifeMap';

const props = withDefaults(defineProps<{
  personId: string | null;
  heading?: string;
  height?: number;
  drawPath?: boolean;
  pathColor?: string;
  ariaLabel?: string;
  showCaption?: boolean;
}>(), {
  height: 300,
  drawPath: true,
  pathColor: '#2c5aa0',
  showCaption: true,
});

const personIdRef = computed(() => props.personId);
const { data, loading } = useLifeMap(personIdRef);

const points = computed<LifeMapPathPoint[]>(() =>
  data.value.events.map(e => ({
    lat: e.lat,
    lon: e.lon,
    label: e.placeName,
    year: e.dateISO ? extractYear(e.dateISO) : null,
    eventType: e.eventType,
  })),
);

function extractYear(dateISO: string): number | null {
  const m = dateISO.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}
</script>
