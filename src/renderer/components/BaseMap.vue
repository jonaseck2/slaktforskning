<template>
  <div class="base-map-container" :style="containerStyle">
    <LMap
      ref="mapRef"
      :zoom="initialZoom"
      :center="initialCenter"
      :use-global-leaflet="false"
      :options="{ zoomControl: false, scrollWheelZoom: false }"
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
}>(), {
  height: '100%',
  initialZoom: 4,
  initialCenter: () => [55, 15],
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
  }
  emit('ready');
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
  border: 1px solid #ddd;
}

/* Override ZoomControls fixed positioning to be within the map container */
.base-map-container :deep(.zoom-controls-bar) {
  position: absolute;
  bottom: 12px;
  right: 12px;
}
</style>
