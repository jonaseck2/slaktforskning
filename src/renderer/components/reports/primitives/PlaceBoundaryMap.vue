<template>
  <div ref="mapEl" class="place-boundary-map" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlaceResolver } from '../../../composables/usePlaceResolver';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

export interface PlacePin {
  id: string;
  lat: number;
  lon: number;
  label: string;
}

interface PlaceRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

const props = withDefaults(defineProps<{
  placeId: string | null;
  persons?: PlacePin[];
  showBoundary?: boolean;
  height?: number;
  ariaLabel?: string;
}>(), {
  persons: () => [],
  showBoundary: true,
  height: 400,
  ariaLabel: 'Place map',
});

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
const resolver = usePlaceResolver();

async function renderMap() {
  if (!mapEl.value || !props.placeId) {
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

  const place = (await window.api.places.get(props.placeId)) as PlaceRow | null;
  if (!place) return;

  const bounds = L.latLngBounds([]);

  if (place.latitude != null && place.longitude != null) {
    L.circleMarker([place.latitude, place.longitude], {
      radius: 8, color: '#fff', fillColor: '#2c5aa0', fillOpacity: 0.85, weight: 1.5,
    }).addTo(map);
    bounds.extend([place.latitude, place.longitude]);
  }

  if (props.showBoundary) {
    try {
      await resolver.ensureLoaded();
      const hint = (place.latitude != null && place.longitude != null)
        ? { lat: place.latitude, lon: place.longitude }
        : undefined;
      const resolved = await resolver.resolveBoundary(place.name, hint);
      if (resolved && resolved.geometry) {
        const feature = { type: 'Feature', properties: {}, geometry: resolved.geometry } as GeoJSON.Feature;
        const geoLayer = L.geoJSON(feature, {
          style: { color: '#2c5aa0', weight: 2, fillOpacity: 0.08 },
          interactive: false,
        });
        geoLayer.addTo(map);
        const geoBounds = geoLayer.getBounds();
        if (geoBounds.isValid()) bounds.extend(geoBounds);
      }
    } catch { /* boundary is best-effort */ }
  }

  for (const pin of props.persons) {
    L.circleMarker([pin.lat, pin.lon], {
      radius: 6, color: '#fff', fillColor: '#2c5aa0', fillOpacity: 0.85, weight: 1.5,
    }).bindTooltip(pin.label).addTo(map);
    bounds.extend([pin.lat, pin.lon]);
  }

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [30, 30], animate: false });
  } else if (place.latitude != null && place.longitude != null) {
    map.setView([place.latitude, place.longitude], 6, { animate: false });
  }
}

onMounted(renderMap);
watch(() => [props.placeId, props.persons, props.showBoundary], renderMap, { deep: true });
onBeforeUnmount(() => { if (map) { map.remove(); map = null; } });
</script>

<style scoped>
.place-boundary-map {
  width: 100%;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--surface-border);
  background: var(--surface-bg);
  break-inside: avoid;
  pointer-events: none;
}
</style>
