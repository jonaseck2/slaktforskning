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

    <div v-else class="map-body" ref="mapBodyRef">
      <div class="map-chart-area">
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
            @click="selectPlace(p.id)"
          >
            <LPopup>
              <a href="#" class="popup-link" @click.prevent="selectPlace(p.id)">{{ p.name }}</a>
              <div v-if="p.place_type" class="popup-type">{{ $t('placeTypes.' + p.place_type) }}</div>
              <div v-if="p.resolved" class="popup-resolved">
                <span :class="'match-' + p.resolved.matchQuality">{{ $t('gazetteers.match.' + p.resolved.matchQuality) }}</span>
                <span class="match-path">{{ p.resolved.matchedPath.join(' > ') }}</span>
              </div>
            </LPopup>
          </LMarker>
        </LMap>

        <ZoomControls
          :zoom="currentZoom / maxZoom"
          :show-fit="true"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
          @reset="fitBounds"
        />

        <!-- Reopen panel button -->
        <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" @click="openPanel">▶</button>
      </div>

      <!-- Drag handle + panel -->
      <template v-if="panelOpen">
        <div
          class="panel-drag-handle"
          @mousedown="(e: MouseEvent) => startResize(e, mapBodyRef!)"
        ></div>
        <div class="map-panel" :style="{ width: panelWidth + 'px' }">
          <button class="panel-close-btn" @click="closePanel">◀</button>
          <PlacePanel
            :place-id="selectedPlaceId"
            @select-place="selectPlace"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { LMap, LTileLayer, LMarker, LPopup } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ZoomControls from '../components/ZoomControls.vue';
import PlacePanel from '../components/PlacePanel.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { usePanelResize } from '../composables/usePanelResize';
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
const mapBodyRef = ref<HTMLElement | null>(null);
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();

const maxZoom = 18;
const currentZoom = ref(4);

// Panel state
const selectedPlaceId = ref<string | null>(null);
const panelOpen = ref(localStorage.getItem('map-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize();

function selectPlace(id: string) {
  selectedPlaceId.value = id;
  if (!panelOpen.value) openPanel();
}

function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('map-panel-open', 'true');
}

function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('map-panel-open', 'false');
}

// Invalidate map when panel opens/closes
watch(panelOpen, () => {
  nextTick(() => {
    mapRef.value?.leafletObject?.invalidateSize();
  });
});

function onMapReady() {
  const map = mapRef.value?.leafletObject;
  if (map) {
    map.zoomControl?.remove();
    map.on('zoomend', () => { currentZoom.value = map.getZoom(); });
    // Invalidate after flex layout settles (panel may already be open)
    setTimeout(() => { map.invalidateSize(); fitBounds(); }, 100);
  }
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

/* Body: map + panel flex layout */
.map-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  position: relative;
}
.map-chart-area {
  flex: 1;
  min-width: 200px;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ddd;
}

/* Panel */
.map-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-left: 1px solid #e0e0e0;
  position: relative;
}
.panel-drag-handle {
  width: 6px;
  background: #e8e8e8;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
}
.panel-drag-handle:hover { background: #c0c0c0; }
.panel-close-btn {
  position: absolute;
  top: 8px;
  left: -1px;
  z-index: 10;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0 4px 4px 0;
  padding: 4px 4px 4px 2px;
  cursor: pointer;
  font-size: var(--font-xs);
  color: var(--color-text-faint);
  line-height: 1;
}
.panel-close-btn:hover { color: var(--color-text-muted); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px 0 0 4px;
  padding: 8px 4px;
  cursor: pointer;
  font-size: var(--font-xs);
  color: var(--color-text-faint);
  z-index: 1000;
  line-height: 1;
}
.panel-open-btn:hover { color: var(--color-text-muted); background: var(--color-bg-subtle); }

/* Popups */
.popup-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-base);
  cursor: pointer;
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

/* Override ZoomControls to stay within map area (not overlap panel) */
.map-chart-area :deep(.zoom-controls-bar) {
  position: absolute;
  bottom: 12px;
  right: 12px;
}
</style>
