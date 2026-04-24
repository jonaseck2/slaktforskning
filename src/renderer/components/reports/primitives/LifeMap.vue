<template>
  <div v-if="points.length > 0" ref="mapEl" class="life-map" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
  <div v-else class="life-map life-map-empty" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
  <ol v-if="points.length > 0 && showCaption" class="life-map-legend">
    <li v-for="(p, idx) in points" :key="idx">
      <span class="legend-dot" :style="{ background: p.color || pathColor }"></span>
      <span class="legend-label">{{ p.eventType ? $t(`eventTypes.${p.eventType}`) : p.label }}</span>
      <span class="legend-place" v-if="p.eventType"> — {{ p.label }}</span>
      <span class="legend-year" v-if="p.year"> ({{ p.year }})</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LifeMapPathPoint {
  lat: number;
  lon: number;
  label: string;
  year: number | null;
  color?: string;
  eventType?: string;
}

const props = withDefaults(defineProps<{
  points: LifeMapPathPoint[];
  height?: number;
  drawPath?: boolean;
  pathColor?: string;
  ariaLabel?: string;
  showCaption?: boolean;
}>(), {
  height: 300,
  drawPath: true,
  pathColor: '#2c5aa0',
  ariaLabel: 'Life map',
  showCaption: true,
});

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;

function renderMap() {
  if (!mapEl.value || !props.points.length) {
    if (map) { map.remove(); map = null; }
    return;
  }
  if (map) { map.remove(); map = null; }

  map = L.map(mapEl.value, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    scrollWheelZoom: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const latlngs = props.points.map(p => [p.lat, p.lon] as [number, number]);
  props.points.forEach((p, idx) => {
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 6,
      color: '#fff',
      fillColor: p.color || props.pathColor,
      fillOpacity: 0.85,
      weight: 1.5,
    }).bindTooltip(`${idx + 1}. ${p.label}${p.year ? ` (${p.year})` : ''}`);
    marker.addTo(map!);
  });

  if (props.drawPath && latlngs.length > 1) {
    L.polyline(latlngs, { color: props.pathColor, weight: 3, opacity: 0.65 }).addTo(map);
  }

  if (latlngs.length === 1) {
    map.setView(latlngs[0], 6, { animate: false });
  } else {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], animate: false });
  }
}

onMounted(renderMap);
watch(() => props.points, renderMap, { deep: true });
onBeforeUnmount(() => { if (map) { map.remove(); map = null; } });
</script>

<style scoped>
.life-map {
  width: 100%;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--surface-border);
  break-inside: avoid;
}
.life-map-empty {
  background: var(--surface-bg);
}
.life-map-legend {
  list-style: decimal;
  margin: var(--space-xs) 0 0 0;
  padding: 0 0 0 var(--space-lg);
  font-size: var(--font-xs);
  color: var(--text-secondary);
  line-height: 1.6;
}
.life-map-legend li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-label {
  font-weight: 500;
  color: var(--text-primary);
}
.legend-place, .legend-year {
  color: var(--text-secondary);
}
</style>
