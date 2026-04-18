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
 * Custom wheel zoom: accumulates scroll delta per frame, applies zoom via
 * setZoom(animate:false). With preferCanvas the markers redraw instantly;
 * tiles flash briefly but zoom is continuous and never blocked by animation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupSmoothWheel(map: any) {
  let pendingDelta = 0;
  let rafId = 0;
  const PX_PER_ZOOM = 120;
  const minZoom = map.getMinZoom();
  const maxZoom = map.getMaxZoom();

  function tick() {
    rafId = 0;
    if (!pendingDelta) return;
    const zoom = map.getZoom();
    const d = pendingDelta / PX_PER_ZOOM;
    pendingDelta = 0;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + d));
    if (newZoom !== zoom) {
      map.setZoom(newZoom, { animate: false });
    }
  }

  map.getContainer().addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pendingDelta += -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
    if (!rafId) rafId = requestAnimationFrame(tick);
  }, { passive: false });
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
