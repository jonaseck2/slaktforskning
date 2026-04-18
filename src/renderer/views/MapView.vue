<template>
  <div class="map-view">
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
        <BaseMap
          ref="baseMapRef"
          :initial-zoom="4"
          :initial-center="[55, 15]"
          :show-fit="true"
          @ready="onMapReady"
        >
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
          <LGeoJson
            v-if="boundaryGeojson"
            :key="selectedPlaceId"
            :geojson="boundaryGeojson"
            :options-style="boundaryStyle"
          />
        </BaseMap>

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
          <PlacePanel
            :place-id="selectedPlaceId"
            @select-place="selectPlace"
            @close="closePanel"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { LMarker, LPopup, LGeoJson } from '@vue-leaflet/vue-leaflet';
import BaseMap from '../components/BaseMap.vue';
import PlacePanel from '../components/PlacePanel.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { usePanelResize } from '../composables/usePanelResize';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';

interface PlaceRow {
  id: string;
  name: string;
  place_type: string | null;
  parent_place_id: string | null;
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
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);
const mapBodyRef = ref<HTMLElement | null>(null);
const { ready: resolverReady, ensureLoaded, resolve, resolveBoundary } = usePlaceResolver();

// Boundary overlay
const boundaryGeojson = ref<Record<string, unknown> | null>(null);
const boundaryStyle = () => ({ color: '#4a90d9', weight: 2, fill: false });

// Panel state
const selectedPlaceId = ref<string | null>(localStorage.getItem('map-selected-place'));
const panelOpen = ref(localStorage.getItem('map-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: 'map-panel-width' });

function selectPlace(id: string) {
  selectedPlaceId.value = id;
  localStorage.setItem('map-selected-place', id);
  if (!panelOpen.value) openPanel();
}

function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('map-panel-open', 'true');
}

function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('map-panel-open', 'false');
  boundaryGeojson.value = null;
}

watch(selectedPlaceId, async (id) => {
  // Clear existing boundary immediately so v-if removes LGeoJson before the
  // :key change triggers a destroy cycle (avoids removeLayer on undefined).
  boundaryGeojson.value = null;
  if (!id) return;
  const place = allDisplayPlaces.value.find(p => p.id === id);
  if (!place) return;
  const result = await resolveBoundary(place.name, { lat: place.displayLat, lon: place.displayLon });
  if (result) {
    boundaryGeojson.value = { type: 'Feature', properties: {}, geometry: result.geometry };
  } else {
    boundaryGeojson.value = null;
  }
});

// Invalidate map when panel opens/closes
watch(panelOpen, () => {
  nextTick(() => {
    baseMapRef.value?.invalidateSize();
  });
});

function onMapReady() {
  // Invalidate after flex layout settles (panel may already be open)
  setTimeout(() => { baseMapRef.value?.invalidateSize(); fitBounds(); }, 100);
}

/** Build a full comma-separated path (leaf, parent, grandparent, …) using loaded places. */
function buildPlacePath(place: PlaceRow): string {
  const byId = new Map(places.value.map(p => [p.id, p]));
  const parts: string[] = [place.name];
  let cur = place.parent_place_id;
  while (cur) {
    const parent = byId.get(cur);
    if (!parent) break;
    parts.push(parent.name);
    cur = parent.parent_place_id;
  }
  return parts.join(', ');
}

const allDisplayPlaces = computed<DisplayPlace[]>(() => {
  const result: DisplayPlace[] = [];
  for (const p of places.value) {
    if (p.latitude != null && p.longitude != null) {
      result.push({ ...p, displayLat: p.latitude, displayLon: p.longitude });
    } else if (resolverReady.value) {
      const resolved = resolve(buildPlacePath(p));
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
    if (filteredPlaces.value.length === 0) return;
    const bounds = filteredPlaces.value.map(p => [p.displayLat, p.displayLon] as [number, number]);
    baseMapRef.value?.fitBounds(bounds);
  });
}

watch(filteredPlaces, () => {
  if (baseMapRef.value?.getLeafletObject()) fitBounds();
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
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
  width: 260px;
}
.no-coords-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
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
}
/* Remove BaseMap's own border/radius — the chart area handles layout */
.map-chart-area :deep(.base-map-container) {
  border: none;
  border-radius: 0;
  height: 100%;
}

/* Panel */
.map-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  min-width: 200px;
  max-width: 1040px;
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
  line-height: 1;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }

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
  color: var(--text-secondary);
  margin-top: 2px;
}
.popup-resolved {
  font-size: var(--font-xs);
  margin-top: 4px;
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 4px;
}
.match-exact {
  color: var(--success-text);
  font-weight: 600;
}
.match-partial {
  color: var(--warning-text);
  font-weight: 600;
}
.match-ambiguous {
  color: var(--error-text);
  font-weight: 600;
}
.match-path {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-xs);
}
</style>
