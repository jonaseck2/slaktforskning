<template>
  <div class="map-view" ref="mapBodyRef">
    <!-- Left sheet: toolbar + map -->
    <div class="map-chart-area">
      <slot name="header" />
      <div v-if="placesWithoutCoords > 0" class="map-toolbar">
        <span class="no-coords-hint">
          {{ $t('map.noCoordinates', { count: placesWithoutCoords }) }}
        </span>
      </div>

      <AppLoadingState v-if="loading && places.length === 0" />

      <div v-else class="map-content" :class="{ 'pick-mode': pickMode }">
        <!-- Coord-pick banner (overlays the map while pickMode is on) -->
        <div v-if="pickMode" class="pick-banner" role="status">
          <span class="pick-banner-text">{{ pickModeLabel ?? $t('places.pickCoordsBanner') }}</span>
          <button class="pick-banner-cancel" type="button" @click="emit('cancel-pick')">
            {{ $t('common.cancel') }}
          </button>
        </div>
        <BaseMap
          ref="baseMapRef"
          :initial-zoom="4"
          :initial-center="[55, 15]"
          :scroll-wheel-zoom="true"
          :show-fit="true"
          @ready="onMapReady"
          @map-click="onMapClick"
        >
          <!-- Markers managed imperatively via canvasMarkers for performance -->
          <!-- Only mount LGeoJson once Leaflet's canvas renderer is ready —
               adding a layer before then races _addPath against onAdd and
               throws "Cannot read properties of undefined (reading 'clearRect')"
               from L.Canvas._clear when the canvas's 2D context isn't yet set. -->
          <LGeoJson
            v-if="boundaryGeojson && mapInitialized"
            :key="selectedPlaceId + '-' + themeVersion"
            :geojson="boundaryGeojson"
            :options-style="boundaryStyle"
          />
        </BaseMap>
        <div v-if="allDisplayPlaces.length === 0" class="map-empty-overlay">
          <span>{{ $t('empty.places') }}</span>
          <router-link to="/places" class="map-empty-link">{{ $t('empty.addPlace') }}</router-link>
        </div>
        <div v-else-if="filteredPlaces.length === 0" class="map-empty-overlay">
          <span>{{ $t('empty.places') }} {{ $t('empty.withFilter') }}</span>
        </div>
      </div>

      <!-- Reopen panel button -->
      <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" @click="props.noPanel ? emit('reopen-panel') : openPanel()">▶</button>
    </div>

    <!-- Drag handle + panel (right sheet) -->
    <template v-if="!props.noPanel && panelOpen">
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

const props = defineProps<{
  noPanel?: boolean;
  searchText?: string;
  countryFilter?: string;
  pickMode?: boolean;
  pickModeLabel?: string;
}>();
const emit = defineEmits<{
  'select-place': [id: string];
  'reopen-panel': [];
  'coords-picked': [lat: number, lon: number];
  'cancel-pick': [];
}>();
import { LGeoJson } from '@vue-leaflet/vue-leaflet';
import L from 'leaflet';
import BaseMap from '../components/BaseMap.vue';
import PlacePanel from '../components/PlacePanel.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { useEntityList } from '../composables/useEntityList';
import { usePanelResize } from '../composables/usePanelResize';
import { useThemeSignal } from '../composables/useThemeSignal';
import { useI18n } from 'vue-i18n';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';
import { STORAGE_KEYS } from '../utils/storage-keys';

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

// Canvas-rendered circle markers — one L.circleMarker per place, no DOM per pin.
// Colors are read from CSS tokens so pins follow the active theme.
const themeVersion = useThemeSignal();

function readPinColors() {
  const s = getComputedStyle(document.documentElement);
  const accent = s.getPropertyValue('--accent').trim() || '#4a90d9';
  const accentHover = s.getPropertyValue('--accent-hover').trim() || '#2a6ab9';
  return { accent, accentHover };
}

const markerLayer = L.layerGroup();
const markerMap = new Map<string, L.CircleMarker>();
let popup: L.Popup | null = null;

function markerStyle(selected: boolean, resolved: boolean): L.CircleMarkerOptions {
  const { accent, accentHover } = readPinColors();
  return {
    radius: selected ? 8 : 6,
    fillColor: selected ? accentHover : accent,
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
      m.on('click', () => {
        if (props.pickMode) {
          const ll = m.getLatLng();
          emit('coords-picked', ll.lat, ll.lng);
          return;
        }
        selectPlace(p.id);
      });
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
    html += `<span class="match-path">${place.resolved.matchedPath.join(' &gt; ')}</span>`;
    // Source provenance: the merge engine returns a synthetic id; the actual
    // contributing gazetteers live on the matched node's `__contributors`.
    const node = place.resolved.matchedNode as { __contributors?: string[] };
    const contributors = node.__contributors ?? [];
    if (contributors.length > 0) {
      const label = contributors.length === 1 ? contributors[0] : contributors.join(', ');
      html += `<span class="match-gazetteer">${t('gazetteers.via')} <code>${label}</code></span>`;
    }
    html += `</div>`;
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

const { ready: resolverReady, ensureLoaded, resolve, resolveBoundary, invalidate } = usePlaceResolver();

// Auto-subscribed list — reloads on every mutating IPC call (debounced) so
// the map mirrors live DB state without the parent view having to wire
// up bespoke refresh paths. The targeted `refreshPlace(id)` below is still
// useful as a cheap single-row refresh when MapView's own internal panel
// emits `place-updated`.
const { items: places, loading, reload: reloadPlaces } = useEntityList<PlaceRow>(
  async () => (await window.api.places.list()) as PlaceRow[],
  { immediate: false },
);

const filterText = computed(() => props.searchText ?? '');
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);
const mapBodyRef = ref<HTMLElement | null>(null);
const mapInitialized = ref(false);

// Boundary overlay
const boundaryGeojson = ref<Record<string, unknown> | null>(null);
const boundaryStyle = () => ({
  color: readPinColors().accent,
  weight: 2,
  fill: false,
  interactive: false,
});

// Panel state
const selectedPlaceId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.mapSelectedPlace));
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.mapPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: STORAGE_KEYS.mapPanelWidth });

function selectPlace(id: string) {
  selectedPlaceId.value = id;
  localStorage.setItem(STORAGE_KEYS.mapSelectedPlace, id);
  if (props.noPanel) {
    emit('select-place', id);
  } else {
    if (!panelOpen.value) openPanel();
  }
}

function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.mapPanelOpen, 'true');
}

function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.mapPanelOpen, 'false');
  boundaryGeojson.value = null;
}

watch(selectedPlaceId, async (id) => {
  // Clear existing boundary immediately so v-if removes LGeoJson before the
  // :key change triggers a destroy cycle (avoids removeLayer on undefined).
  boundaryGeojson.value = null;
  if (!id) return;
  const place = allDisplayPlaces.value.find(p => p.id === id);
  if (!place) return;
  // Use the point gazetteer's matched path (reversed, excluding the leaf city)
  // to query the boundary gazetteer. This avoids city-name conflicts (e.g.
  // "Wichita" matching Wichita County instead of Sedgwick County).
  // Falls back to the raw place name if no resolved path is available.
  const boundaryQuery = place.resolved?.matchedPath
    ? [...place.resolved.matchedPath].reverse().join(', ')
    : place.name;
  const result = await resolveBoundary(boundaryQuery, { lat: place.displayLat, lon: place.displayLon });
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

// Re-style existing markers when theme/appearance changes. Leaflet's canvas
// renderer bakes colors into the marker at creation, so we must imperatively
// re-read the CSS tokens and call setStyle on each marker.
watch(themeVersion, () => {
  syncMarkers();
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

// Country lookup — derived from gazetteer resolution. Places with explicit
// lat/lon don't carry `resolved` (their pin doesn't need it), so we resolve
// the hierarchy once for filtering. Places without any resolution are
// classified as unresolved.
const UNRESOLVED_COUNTRY = '__unresolved__';
const placeCountry = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  if (!resolverReady.value) return map;
  const byId = new Map(places.value.map(p => [p.id, p]));
  for (const p of places.value) {
    const parts: string[] = [p.name];
    let cur = p.parent_place_id;
    while (cur) {
      const parent = byId.get(cur);
      if (!parent) break;
      parts.push(parent.name);
      cur = parent.parent_place_id;
    }
    const r = resolve(parts.join(', '));
    map.set(p.id, r?.matchedPath[0] ?? UNRESOLVED_COUNTRY);
  }
  return map;
});

const filteredPlaces = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  const country = props.countryFilter && props.countryFilter !== 'all' ? props.countryFilter : null;
  return allDisplayPlaces.value.filter(p => {
    if (country && placeCountry.value.get(p.id) !== country) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
});

function onMapClick(lat: number, lon: number) {
  if (!props.pickMode) return;
  emit('coords-picked', lat, lon);
}

// Esc cancels pick mode while it's active
function onPickEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.pickMode) {
    e.stopPropagation();
    emit('cancel-pick');
  }
}
watch(() => props.pickMode, (on) => {
  if (on) {
    window.addEventListener('keydown', onPickEscape, true);
  } else {
    window.removeEventListener('keydown', onPickEscape, true);
  }
});
onUnmounted(() => window.removeEventListener('keydown', onPickEscape, true));

function fitBounds() {
  nextTick(() => {
    if (filteredPlaces.value.length === 0) return;
    const bounds = filteredPlaces.value.map(p => [p.displayLat, p.displayLon] as [number, number]);
    baseMapRef.value?.fitBounds(bounds);
  });
}

// Sync markers on any change to the visible set (data reloads, filter
// changes, selection changes). Refitting bounds is intentionally NOT done
// here — data reloads must not yank the user's zoom/pan. fitBounds runs
// only on initial map ready and on explicit filter changes below.
watch(filteredPlaces, () => {
  syncMarkers();
});

watch([() => props.searchText, () => props.countryFilter], () => {
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
    invalidate(); // clear resolver cache so gazetteer re-resolves the new name
    await ensureLoaded();
  }
}

onMounted(async () => {
  await ensureLoaded();
  await reloadPlaces();

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
  min-width: 0;
  overflow: hidden;
}

/* Left sheet: header slot + toolbar + map */
.map-chart-area :deep(.header) {
  padding: var(--space-lg) var(--space-lg) 0;
  margin-bottom: var(--space-sm);
}
.map-chart-area {
  flex: 1;
  min-width: 0;
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
.map-content.pick-mode :deep(.leaflet-container),
.map-content.pick-mode :deep(.leaflet-clickable),
.map-content.pick-mode :deep(.leaflet-interactive) {
  cursor: crosshair !important;
}
.pick-banner {
  position: absolute;
  top: var(--space-md);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--accent);
  color: var(--accent-text, #fff);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-sm);
  pointer-events: auto;
  white-space: nowrap;
  max-width: calc(100% - 2 * var(--space-md));
}
.pick-banner-text { font-weight: 500; }
.pick-banner-cancel {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--accent-text, #fff) 60%, transparent);
  color: inherit;
  border-radius: var(--radius-sm);
  padding: 2px 10px;
  font-size: var(--font-xs);
  cursor: pointer;
}
.pick-banner-cancel:hover {
  background: color-mix(in srgb, var(--accent-text, #fff) 15%, transparent);
}
.map-empty-overlay {
  position: absolute;
  top: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-sm) var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-muted);
  z-index: 10;
  pointer-events: auto;
  white-space: nowrap;
}
.map-empty-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.map-empty-link:hover { color: var(--accent-hover); }
/* Remove BaseMap's own border/radius — the sheet handles the outer shape */
.map-chart-area :deep(.base-map-container) {
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

/* Popups — use :deep() because Leaflet injects popup HTML outside Vue's template */
:deep(.popup-link) {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-base);
  cursor: pointer;
}
:deep(.popup-link:hover) {
  text-decoration: underline;
}
:deep(.popup-type) {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}
:deep(.popup-resolved) {
  font-size: var(--font-xs);
  margin-top: 4px;
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 4px;
}
:deep(.match-exact),
:deep(.match-partial),
:deep(.match-ambiguous) {
  display: inline-block;
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  line-height: 1.4;
}
:deep(.match-exact) {
  background: var(--success-bg);
  color: var(--success-text);
}
:deep(.match-partial) {
  background: var(--warning-bg);
  color: var(--warning-text);
}
:deep(.match-ambiguous) {
  background: var(--error-bg);
  color: var(--error-text);
}
:deep(.match-path) {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-xs);
  margin-top: 2px;
}
:deep(.match-gazetteer) {
  display: block;
  color: var(--text-muted);
  font-size: var(--font-xs);
  margin-top: 2px;
}
:deep(.match-gazetteer code) {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.95em;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
</style>
