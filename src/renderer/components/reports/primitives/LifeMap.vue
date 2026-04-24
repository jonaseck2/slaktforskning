<template>
  <div v-if="points.length > 0" ref="mapEl" class="life-map" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
  <div v-else class="life-map life-map-empty" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
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
}

const props = withDefaults(defineProps<{
  points: LifeMapPathPoint[];
  height?: number;
  drawPath?: boolean;
  pathColor?: string;
  ariaLabel?: string;
}>(), {
  height: 300,
  drawPath: true,
  pathColor: '#2c5aa0',
  ariaLabel: 'Life map',
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
      color: p.color || props.pathColor,
      fillColor: p.color || props.pathColor,
      fillOpacity: 0.8,
      weight: 2,
    }).bindTooltip(`${idx + 1}. ${p.label}${p.year ? ` (${p.year})` : ''}`);
    marker.addTo(map!);
  });

  if (props.drawPath && latlngs.length > 1) {
    L.polyline(latlngs, { color: props.pathColor, weight: 2, opacity: 0.7 }).addTo(map);
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
  pointer-events: none;
}
.life-map-empty {
  background: var(--surface-bg);
}
</style>
