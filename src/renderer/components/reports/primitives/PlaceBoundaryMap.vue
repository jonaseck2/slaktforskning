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

  const bounds = L.latLngBounds([]);
  const points: [number, number][] = [];
  let hasBoundary = false;

  // Effective coordinates: the DB row almost never carries lat/lon (per the
  // Prime Directive, coordinates are gazetteer-resolved at render time, never
  // persisted), so fall back to the resolver — same path the Places map and
  // useLifeMap take. Without this the map below is never given a view and
  // Leaflet renders a blank box for any place lacking a boundary polygon.
  let effLat = place?.latitude ?? null;
  let effLon = place?.longitude ?? null;
  if (place && (effLat == null || effLon == null)) {
    try {
      await resolver.ensureLoaded();
      const path = (await window.api.places.getPath(props.placeId)) as string | null;
      const coords = resolver.resolveCoordinates(place, path || place.name) as
        { lat: number; lon: number } | null;
      if (coords) { effLat = coords.lat; effLon = coords.lon; }
    } catch { /* point resolution is best-effort */ }
  }

  if (effLat != null && effLon != null) {
    L.circleMarker([effLat, effLon], {
      radius: 8, color: '#fff', fillColor: '#2c5aa0', fillOpacity: 0.85, weight: 1.5,
    }).addTo(map);
    bounds.extend([effLat, effLon]);
    points.push([effLat, effLon]);
  }

  if (place && props.showBoundary) {
    try {
      await resolver.ensureLoaded();
      const hint = (effLat != null && effLon != null)
        ? { lat: effLat, lon: effLon }
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
        if (geoBounds.isValid()) { bounds.extend(geoBounds); hasBoundary = true; }
      }
    } catch { /* boundary is best-effort */ }
  }

  for (const pin of props.persons) {
    L.circleMarker([pin.lat, pin.lon], {
      radius: 6, color: '#fff', fillColor: '#2c5aa0', fillOpacity: 0.85, weight: 1.5,
    }).bindTooltip(pin.label).addTo(map);
    bounds.extend([pin.lat, pin.lon]);
    points.push([pin.lat, pin.lon]);
  }

  if ((hasBoundary || points.length >= 2) && bounds.isValid()) {
    // A real area (boundary polygon) or several distinct points — frame them all.
    map.fitBounds(bounds, { padding: [30, 30], animate: false });
  } else if (points.length === 1) {
    // A single point would make fitBounds zoom to max on a zero-area bounds, so
    // set a town-level view instead (mirrors the Places map's single-pin path).
    map.setView(points[0], 10, { animate: false });
  } else {
    // Last resort: nothing about this place could be located. Still give the
    // map a view (Scandinavia, matching BaseMap's default) so it renders tiles
    // instead of a dead blank box.
    map.setView([55, 15], 4, { animate: false });
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
