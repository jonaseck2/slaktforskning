<template>
  <div class="map-view">
    <div class="header">
      <h2>{{ $t('map.title') }}</h2>
      <span class="count-label">{{ filteredPlaces.length }} {{ $t('places.title').toLowerCase() }}</span>
    </div>

    <div v-if="filterText || allDisplayPlaces.length > 0" class="map-toolbar">
      <input
        v-model="filterText"
        type="text"
        :placeholder="$t('app.search')"
        class="map-search"
      />
      <span v-if="placesWithoutCoords > 0" class="no-coords-hint">
        {{ $t('map.noCoordinates', { count: placesWithoutCoords }) }}
      </span>
    </div>

    <div v-if="filteredPlaces.length === 0" class="empty">
      {{ $t('map.empty') }}
    </div>

    <div v-else class="map-container">
      <LMap
        ref="mapRef"
        :zoom="4"
        :center="[55, 15]"
        :use-global-leaflet="false"
        :options="{ zoomControl: false }"
        @ready="onMapReady"
      >
        <LTileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          layer-type="base"
        />
        <LMarker
          v-for="p in filteredPlaces"
          :key="p.id"
          :lat-lng="[p.displayLat, p.displayLon]"
          :options="p.resolved ? { opacity: 0.65 } : {}"
        >
          <LPopup>
            <router-link :to="'/places/' + p.id" class="popup-link">{{ p.name }}</router-link>
            <div v-if="p.place_type" class="popup-type">{{ $t('placeTypes.' + p.place_type) }}</div>
            <div v-if="p.resolved" class="popup-resolved">
              <span :class="'match-' + p.resolved.matchQuality">{{ $t('gazetteers.match.' + p.resolved.matchQuality) }}</span>
              <span class="match-path">{{ p.resolved.matchedPath.join(' > ') }}</span>
            </div>
          </LPopup>
        </LMarker>
      </LMap>
    </div>

    <ZoomControls
      v-if="filteredPlaces.length > 0"
      :zoom="currentZoom / maxZoom"
      :show-fit="true"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @reset="fitBounds"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { LMap, LTileLayer, LMarker, LPopup } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ZoomControls from '../components/ZoomControls.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';

// Fix default marker icons for Vite bundler
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

interface PlaceRow {
  id: string;
  name: string;
  place_type: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface DisplayPlace extends PlaceRow {
  displayLat: number;
  displayLon: number;
  resolved?: PlaceResolveResult;
}

const places = ref<PlaceRow[]>([]);
const filterText = ref('');
const mapRef = ref<InstanceType<typeof LMap> | null>(null);
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();

const maxZoom = 18;
const currentZoom = ref(4);

function onMapReady() {
  const map = mapRef.value?.leafletObject;
  if (map) {
    map.zoomControl?.remove();
    map.on('zoomend', () => { currentZoom.value = map.getZoom(); });
  }
  fitBounds();
}

function zoomIn() {
  mapRef.value?.leafletObject?.zoomIn();
}

function zoomOut() {
  mapRef.value?.leafletObject?.zoomOut();
}

const allDisplayPlaces = computed<DisplayPlace[]>(() => {
  const result: DisplayPlace[] = [];
  for (const p of places.value) {
    if (p.latitude != null && p.longitude != null) {
      result.push({ ...p, displayLat: p.latitude, displayLon: p.longitude });
    } else if (resolverReady.value) {
      const resolved = resolve(p.name);
      if (resolved) {
        result.push({ ...p, displayLat: resolved.lat, displayLon: resolved.lon, resolved });
      }
    }
  }
  return result;
});

const placesWithoutCoords = computed(() => {
  const displayIds = new Set(allDisplayPlaces.value.map(p => p.id));
  return places.value.filter(p => !displayIds.has(p.id)).length;
});

const filteredPlaces = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return allDisplayPlaces.value;
  return allDisplayPlaces.value.filter(p => p.name.toLowerCase().includes(q));
});

function fitBounds() {
  nextTick(() => {
    const map = mapRef.value?.leafletObject;
    if (!map || filteredPlaces.value.length === 0) return;
    const bounds = filteredPlaces.value.map(p => [p.displayLat, p.displayLon] as [number, number]);
    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  });
}

watch(filteredPlaces, () => {
  if (mapRef.value?.leafletObject) fitBounds();
});

onMounted(async () => {
  places.value = (await window.api.places.list()) as PlaceRow[];
  await ensureLoaded();
});
</script>

<style scoped>
.map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.map-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.map-search {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
  width: 260px;
}
.no-coords-hint {
  font-size: var(--font-sm);
  color: #999;
}
.map-container {
  flex: 1;
  min-height: 400px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ddd;
}
.popup-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-base);
}
.popup-link:hover {
  text-decoration: underline;
}
.popup-type {
  font-size: var(--font-xs);
  color: #666;
  margin-top: 2px;
}
.popup-resolved {
  font-size: var(--font-xs);
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 4px;
}
.match-exact {
  color: #22c55e;
  font-weight: 600;
}
.match-partial {
  color: #f59e0b;
  font-weight: 600;
}
.match-ambiguous {
  color: #ef4444;
  font-weight: 600;
}
.match-path {
  display: block;
  color: #666;
  font-size: var(--font-xs);
}
</style>
