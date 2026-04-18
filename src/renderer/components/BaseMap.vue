<template>
  <div class="base-map-container" :style="containerStyle">
    <LMap
      ref="mapRef"
      :zoom="initialZoom"
      :center="initialCenter"
      :use-global-leaflet="true"
      :options="{
        zoomControl: false,
        scrollWheelZoom: false,
        preferCanvas: true,
        zoomSnap: 0,
        zoomDelta: 0.5,
      }"
      @ready="onMapReady"
    >
      <LTileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
        layer-type="base"
      />
      <slot />
    </LMap>

    <ZoomControls
      :zoom="currentZoom / maxZoom"
      :show-fit="showFit"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @reset="onReset"
    >
      <slot name="controls" />
    </ZoomControls>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ZoomControls from './ZoomControls.vue';

// Expose Leaflet globally so vue-leaflet skips its async dynamic import
// (prevents "Uncaught (in promise) undefined" race condition)
(window as Record<string, unknown>).L = L;

// Fix default marker icons for Vite bundler
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

const props = withDefaults(defineProps<{
  height?: string;
  initialZoom?: number;
  initialCenter?: [number, number];
  showFit?: boolean;
  scrollWheelZoom?: boolean;
}>(), {
  height: '100%',
  initialZoom: 4,
  initialCenter: () => [55, 15],
  scrollWheelZoom: false,
  showFit: true,
});

const emit = defineEmits<{
  ready: [];
}>();

const mapRef = ref<InstanceType<typeof LMap> | null>(null);
const maxZoom = 18;
const currentZoom = ref(props.initialZoom);

const containerStyle = computed(() => ({
  height: props.height,
}));

function onMapReady() {
  const map = mapRef.value?.leafletObject;
  if (map) {
    map.on('zoomend', () => { currentZoom.value = map.getZoom(); });
    map.on('zoom', () => { currentZoom.value = map.getZoom(); });
    if (props.scrollWheelZoom) {
      setupSmoothWheel(map);
    }
  }
  emit('ready');
}

/**
 * Continuous wheel zoom using CSS transforms.
 * During scrolling, tiles are scaled via CSS (no grey flash). The actual
 * Leaflet zoom is committed only after scrolling stops (150ms idle).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupSmoothWheel(map: any) {
  let targetZoom = map.getZoom();
  let commitTimer = 0;
  const PX_PER_ZOOM = 150;

  // After the user stops scrolling, commit the final zoom level
  function commitZoom() {
    commitTimer = 0;
    map.setZoom(targetZoom, { animate: false });
  }

  map.getContainer().addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const delta = -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
    const zoomChange = delta / PX_PER_ZOOM;
    targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom + zoomChange));

    // CSS-transform the tile pane for instant visual feedback (no tile reload)
    const currentZoomLevel = map.getZoom();
    const scale = Math.pow(2, targetZoom - currentZoomLevel);
    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      const center = map.getContainer().getBoundingClientRect();
      const cx = center.width / 2;
      const cy = center.height / 2;
      tilePane.style.transformOrigin = `${cx}px ${cy}px`;
      tilePane.style.transform = `scale(${scale})`;
    }

    // Debounce the actual zoom commit so tiles only reload when scrolling stops
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = window.setTimeout(commitZoom, 150);
  }, { passive: false });

  // Reset transform after Leaflet commits the zoom and reloads tiles
  map.on('zoomend', () => {
    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      tilePane.style.transform = '';
      tilePane.style.transformOrigin = '';
    }
    targetZoom = map.getZoom();
  });
}

function zoomIn() {
  mapRef.value?.leafletObject?.zoomIn();
}

function zoomOut() {
  mapRef.value?.leafletObject?.zoomOut();
}

function onReset() {
  fitBounds();
}

/** Fit map to given lat/lng bounds, or call without args for the consumer to handle via @reset */
function fitBounds(latLngs?: [number, number][]) {
  nextTick(() => {
    const map = mapRef.value?.leafletObject;
    if (!map || !latLngs || latLngs.length === 0) return;
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 10);
    } else {
      map.fitBounds(latLngs, { padding: [30, 30] });
    }
  });
}

function invalidateSize() {
  mapRef.value?.leafletObject?.invalidateSize();
}

function getLeafletObject() {
  return mapRef.value?.leafletObject;
}

defineExpose({ fitBounds, invalidateSize, getLeafletObject });
</script>

<style scoped>
.base-map-container {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--surface-border);
}

/* Override ZoomControls fixed positioning to be within the map container */
.base-map-container :deep(.zoom-controls-bar) {
  position: absolute;
  bottom: 32px;
  right: 12px;
}
</style>
