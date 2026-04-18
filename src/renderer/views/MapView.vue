<template>
  <div class="map-view" ref="mapBodyRef">
    <!-- Left sheet: toolbar + map -->
    <div class="map-chart-area">
      <slot name="header" />
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

      <AppLoadingState v-if="loading" />
      <AppEmptyState v-else-if="filteredPlaces.length === 0" icon="📍" :message="$t('map.empty')" />

      <div v-else class="map-content">
        <BaseMap
          ref="baseMapRef"
          :initial-zoom="4"
          :initial-center="[55, 15]"
          :scroll-wheel-zoom="true"
          :show-fit="true"
          @ready="onMapReady"
        >
          <!-- Markers managed imperatively via canvasMarkers for performance -->
          <LGeoJson
            v-if="boundaryGeojson"
            :key="selectedPlaceId"
            :geojson="boundaryGeojson"
            :options-style="boundaryStyle"
          />
        </BaseMap>
      </div>

      <!-- Reopen panel button -->
      <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" @click="openPanel">▶</button>
    </div>

    <!-- Drag handle + panel (right sheet) -->
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
          @place-updated="refreshPlace"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { LGeoJson } from '@vue-leaflet/vue-leaflet';
import L from 'leaflet';
import BaseMap from '../components/BaseMap.vue';
import PlacePanel from '../components/PlacePanel.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { usePanelResize } from '../composables/usePanelResize';
import { useI18n } from 'vue-i18n';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';

const { t } = useI18n();

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

// Canvas-rendered circle markers — one L.circleMarker per place, no DOM per pin
const PIN_COLOR = '#4a90d9';
const PIN_COLOR_SELECTED = '#2a6ab9';
const PIN_COLOR_RESOLVED = '#7ab0e9';

const markerLayer = L.layerGroup();
const markerMap = new Map<string, L.CircleMarker>();
let popup: L.Popup | null = null;

function markerStyle(selected: boolean, resolved: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? 8 : 6,
    fillColor: selected ? PIN_COLOR_SELECTED : resolved ? PIN_COLOR_RESOLVED : PIN_COLOR,
    fillOpacity: resolved ? 0.5 : 0.85,
    color: '#fff',
    weight: selected ? 2 : 1,
    bubblingMouseEvents: false,
  };
}

function syncMarkers() {
  const map = baseMapRef.value?.getLeafletObject();
  if (!map) return;

  const currentIds = new Set(filteredPlaces.value.map(p => p.id));
  const selId = selectedPlaceId.value;

  // Remove markers no longer in filteredPlaces
  for (const [id, marker] of markerMap) {
    if (!currentIds.has(id)) {
      markerLayer.removeLayer(marker);
      markerMap.delete(id);
    }
  }

  // Add or update markers
  for (const p of filteredPlaces.value) {
    const selected = p.id === selId;
    const resolved = !!p.resolved;
    const existing = markerMap.get(p.id);
    if (existing) {
      existing.setLatLng([p.displayLat, p.displayLon]);
      existing.setStyle(markerStyle(selected, resolved));
      existing.setRadius(selected ? 8 : 6);
    } else {
      const m = L.circleMarker([p.displayLat, p.displayLon], markerStyle(selected, resolved));
      m.on('click', () => selectPlace(p.id));
      markerLayer.addLayer(m);
      markerMap.set(p.id, m);
    }
  }
}

function showPopup(id: string) {
  const map = baseMapRef.value?.getLeafletObject();
  const marker = markerMap.get(id);
  const place = filteredPlaces.value.find(p => p.id === id);
  if (!map || !marker || !place) return;

  if (popup) map.closePopup(popup);

  let html = `<a href="#" class="popup-link" data-place-id="${place.id}">${place.name}</a>`;
  if (place.place_type) {
    html += `<div class="popup-type">${t('placeTypes.' + place.place_type)}</div>`;
  }
  if (place.resolved) {
    const qClass = 'match-' + place.resolved.matchQuality;
    html += `<div class="popup-resolved"><span class="${qClass}">${t('gazetteers.match.' + place.resolved.matchQuality)}</span>`;
    html += `<span class="match-path">${place.resolved.matchedPath.join(' &gt; ')}</span></div>`;
  }

  popup = L.popup({ offset: [0, -8] })
    .setLatLng(marker.getLatLng())
    .setContent(html)
    .openOn(map);

  // Handle popup link click
  const popupEl = popup.getElement();
  popupEl?.querySelector('.popup-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    selectPlace(id);
  });
}

// Module-level cache so data survives navigation (component remounts)
let cachedPlaces: PlaceRow[] | null = null;

const places = ref<PlaceRow[]>(cachedPlaces ?? []);
const loading = ref(cachedPlaces === null);
const filterText = ref('');
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);
const mapBodyRef = ref<HTMLElement | null>(null);
const mapInitialized = ref(false);
const { ready: resolverReady, ensureLoaded, resolve, resolveBoundary, invalidate } = usePlaceResolver();

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

// Invalidate map when panel opens/closes or resizes
watch(panelOpen, () => {
  nextTick(() => {
    baseMapRef.value?.invalidateSize();
  });
});
let panelResizeTimer: ReturnType<typeof setTimeout> | null = null;
watch(panelWidth, () => {
  if (panelResizeTimer) clearTimeout(panelResizeTimer);
  panelResizeTimer = setTimeout(() => {
    baseMapRef.value?.invalidateSize();
  }, 50);
});

// ResizeObserver to catch any container size changes (window resize, layout shifts)
// Debounce to avoid feedback loops during zoom animations
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      baseMapRef.value?.invalidateSize();
    }, 150);
  });
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (resizeTimer) clearTimeout(resizeTimer);
  if (panelResizeTimer) clearTimeout(panelResizeTimer);
  markerLayer.clearLayers();
  markerMap.clear();
});

function onMapReady() {
  const map = baseMapRef.value?.getLeafletObject();
  // Add canvas marker layer
  if (map) {
    markerLayer.addTo(map);
    syncMarkers();
  }
  // Observe the map's container so invalidateSize fires on any layout change
  const container = map?.getContainer();
  if (container && resizeObserver) {
    resizeObserver.observe(container);
  }
  // Invalidate after flex layout settles (panel may already be open)
  setTimeout(() => {
    baseMapRef.value?.invalidateSize();
    fitBounds();
    mapInitialized.value = true;
  }, 200);
}

const allDisplayPlaces = computed<DisplayPlace[]>(() => {
  // Build parent lookup once for the entire computed pass
  const byId = new Map(places.value.map(p => [p.id, p]));
  const result: DisplayPlace[] = [];
  for (const p of places.value) {
    if (p.latitude != null && p.longitude != null) {
      result.push({ ...p, displayLat: p.latitude, displayLon: p.longitude });
    } else if (resolverReady.value) {
      // Build path by walking parents
      const parts: string[] = [p.name];
      let cur = p.parent_place_id;
      while (cur) {
        const parent = byId.get(cur);
        if (!parent) break;
        parts.push(parent.name);
        cur = parent.parent_place_id;
      }
      const resolved = resolve(parts.join(', '));
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
  syncMarkers();
  if (mapInitialized.value && baseMapRef.value?.getLeafletObject()) fitBounds();
});

watch(selectedPlaceId, (id) => {
  syncMarkers();
  if (id) showPopup(id);
});

async function refreshPlace(id: string) {
  const updated = (await window.api.places.get(id)) as PlaceRow | null;
  if (!updated) return;
  const idx = places.value.findIndex(p => p.id === id);
  if (idx >= 0) {
    places.value[idx] = updated;
    places.value = [...places.value]; // trigger reactivity
    cachedPlaces = places.value;
    invalidate(); // clear resolver cache so gazetteer re-resolves the new name
    await ensureLoaded();
  }
}

onMounted(async () => {
  const freshPlaces = (await window.api.places.list()) as PlaceRow[];
  await ensureLoaded();
  places.value = freshPlaces;
  cachedPlaces = freshPlaces;
  loading.value = false;

  // Auto-select a place if none is selected
  if (!selectedPlaceId.value && allDisplayPlaces.value.length > 0) {
    let autoId: string | null = null;

    // Try focus person's first place
    const focusPersonId = await window.api.db.getSetting('default_person_id') as string | null;
    if (focusPersonId) {
      const events = (await window.api.events.forPerson(focusPersonId)) as { place_id?: string | null }[];
      const placeIds = new Set(events.map(e => e.place_id).filter(Boolean));
      const displayIds = new Set(allDisplayPlaces.value.map(p => p.id));
      autoId = [...placeIds].find(pid => displayIds.has(pid!)) as string | undefined ?? null;
    }

    // Fall back to first place in the list
    if (!autoId) autoId = allDisplayPlaces.value[0].id;

    selectPlace(autoId);
  }
});
</script>

<style scoped>
.map-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}

/* Left sheet: header slot + toolbar + map */
.map-chart-area :deep(.header) {
  padding: var(--space-lg) var(--space-lg) 0;
  margin-bottom: var(--space-sm);
}
.map-chart-area {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.map-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--space-md) var(--space-lg);
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
.map-content {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: var(--space-sm) var(--space-lg) var(--space-lg);
}
/* Remove BaseMap's own border/radius — the sheet handles the outer shape */
.map-chart-area :deep(.base-map-container) {
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  height: 100%;
}

/* Panel */
.map-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
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
