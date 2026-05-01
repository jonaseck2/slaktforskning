<template>
  <div class="places-view" ref="placesBodyRef">
    <!-- Permanent left list column -->
    <template v-if="listOpen">
      <div class="places-list-column list-column" :style="{ width: listWidth + 'px' }">
        <h3 class="places-list-title">{{ $t('places.listTitle') }}</h3>
        <div class="places-list-body">
          <div v-if="totalPlaces > 0 || searchQuery" class="list-filter">
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="$t('places.filterSearch')"
              class="list-filter-input"
            />
          </div>
          <AppEmptyState v-if="totalPlaces === 0 && !searchQuery" icon="📍" :title="$t('empty.places')" :description="$t('empty.placesDesc')" :action-label="isStaticMode ? undefined : $t('empty.addPlace')" @action="showAddForm = true" />
          <AppEmptyState v-else-if="placesPage.length === 0" icon="📍" :title="$t('empty.places') + ' ' + $t('empty.withFilter')" />
          <div v-else class="places-list-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="sortable-th" @click="toggleSort('name')">
                    {{ $t('places.name') }}
                    <span v-if="sortBy === 'name'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                  </th>
                  <th class="sortable-th type-col" @click="toggleSort('place_type')">
                    {{ $t('places.type') }}
                    <span v-if="sortBy === 'place_type'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="place in placesPage"
                  :key="place.id"
                  v-narrate="() => narratePlaceRow({
                    name: place.name || '',
                    place_type: place.place_type || '',
                    path: '',
                  }, t)"
                  class="clickable-row"
                  :class="{ 'selected-row': selectedPlaceId === place.id }"
                  tabindex="0"
                  role="button"
                  :aria-label="$t('a11y.editItem', { item: place.name })"
                  @click="selectPlace(place.id)"
                  @keydown.enter="selectPlace(place.id)"
                  @keydown.space.prevent="selectPlace(place.id)"
                  @keydown.down.prevent="focusNextRow($event)"
                  @keydown.up.prevent="focusPrevRow($event)"
                >
                  <td>
                    <div>{{ place.name }}</div>
                    <div v-if="resolvedPathFor(place.id)" class="resolved-subline">{{ resolvedPathFor(place.id) }}</div>
                  </td>
                  <td class="type-col info-cell">{{ place.place_type ? $t('placeTypes.' + place.place_type) : '' }}</td>
                </tr>
              </tbody>
            </table>
            <div ref="sentinel" class="scroll-sentinel"></div>
          </div>
          <p v-if="totalPlaces > 0" class="places-list-footer count-label">
            {{ $t('places.showingOf', { shown: placesPage.length, total: totalPlaces }) }}
          </p>
        </div>
        <button class="list-collapse-btn" :aria-label="$t('common.close')" title="Dölj listan" @click="closeList">◀</button>
      </div>
      <div class="list-drag-handle" @mousedown="(e: MouseEvent) => startListResize(e, placesBodyRef!)"></div>
    </template>
    <button v-else class="list-open-btn" :aria-label="$t('common.open') ?? 'Open'" title="Visa listan" @click="openList">▶</button>

    <!-- Map (always shown in center) -->
    <MapView no-panel :search-text="searchQuery" :country-filter="activeCountryFilter" style="flex: 1; min-width: 0" @select-place="selectPlace" @reopen-panel="openPanel">
      <template #header>
        <div class="header">
          <h2>{{ $t('places.title') }}</h2>
          <div class="header-right">
            <AppButton v-if="!isStaticMode" variant="soft" @click="showAddForm = true">+ {{ $t('places.addTitle') }}</AppButton>
          </div>
        </div>
        <FilterChips
          v-if="places.length > 0"
          class="map-type-filter"
          :options="countryFilters"
          :model-value="activeCountryFilter"
          @update:model-value="activeCountryFilter = $event"
        />
      </template>
    </MapView>

    <!-- Reopen panel button when panel is closed -->
    <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>

    <!-- Panel: shared across list and map modes — never unmounts on view switch -->
    <template v-if="panelOpen && selectedPlaceId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, placesBodyRef!)"></div>
      <div class="places-panel" :style="{ width: panelWidth + 'px' }">
        <PlacePanel :place-id="selectedPlaceId" :readonly="isStaticMode" @close="closePanel" @select-place="selectPlace" @place-updated="reloadAll" />
      </div>
    </template>

    <!-- Add modal -->
    <PlaceModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onPlaceSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppButton from '../components/ui/AppButton.vue';
import PlaceModal from '../components/modals/PlaceModal.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import MapView from './MapView.vue';
import PlacePanel from '../components/PlacePanel.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { narratePlaceRow } from '../utils/screenReaderNarration';
import { usePagedList } from '../composables/usePagedList';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'PlacesView' });

interface PlaceRow { id: string; name: string; place_type: string | null; parent_place_id?: string | null; }

const { t } = useI18n();
const route = useRoute();
const places = ref<PlaceRow[]>([]);
const placesBodyRef = ref<HTMLElement | null>(null);

// Persistent left list column. Replaces the old list/map tab toggle —
// list and map are now always visible side-by-side, with the list
// collapsible via a ▶/◀ button.
const listOpen = ref(localStorage.getItem(STORAGE_KEYS.placesListOpen) !== 'false');
function openList() {
  listOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.placesListOpen, 'true');
}
function closeList() {
  listOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.placesListOpen, 'false');
}
const activeCountryFilter = ref<string>('all');

// The left list column is server-paged; the map keeps a separate full list
// (see `places` below) since the map needs every pin and the chip counts
// need every type. The list filter input drives both: it's the composable's
// `searchQuery` and we also pass it to the map as `:search-text`.
type PlaceSortBy = 'name' | 'place_type';
const {
  items: placesPage,
  total: totalPlaces,
  searchQuery,
  sortBy,
  sortDir,
  reload: reloadPaged,
  toggleSort,
  attachSentinel,
} = usePagedList<PlaceRow, PlaceSortBy>({
  defaultSortBy: 'name',
  storageKey: 'places',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    const result = await window.api.places.listPage(limit, offset, sortBy, sortDir, query) as { items: PlaceRow[]; total: number };
    return { items: result.items, total: result.total };
  },
});
const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

// If /places/:id or ?place= is in the URL, write to localStorage now (before MapView setup runs) so
// MapView picks it up when it initializes its own selectedPlaceId from the same key.
const paramId = route.params.id;
const queryPlace = route.query.place;
const initialPlaceId =
  (typeof paramId === 'string' && paramId) ? paramId :
  (typeof queryPlace === 'string' && queryPlace) ? queryPlace : null;
if (initialPlaceId) {
  localStorage.setItem(STORAGE_KEYS.mapSelectedPlace, initialPlaceId);
  localStorage.setItem(STORAGE_KEYS.mapPanelOpen, 'true');
}

// Panel state (shared keys with MapView so switching modes preserves selection)
const selectedPlaceId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.mapSelectedPlace));
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.mapPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: STORAGE_KEYS.mapPanelWidth, maxWidthRatio: 0.5 });
const { panelWidth: listWidth, startResize: startListResize } = usePanelResize({
  storageKey: STORAGE_KEYS.placesListWidth,
  side: 'left',
  defaultWidth: 280,
  minWidth: 200,
  maxWidthRatio: 0.4,
});

function selectPlace(id: string) {
  selectedPlaceId.value = id;
  localStorage.setItem(STORAGE_KEYS.mapSelectedPlace, id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.mapPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.mapPanelOpen, 'false');
}

// Show the gazetteer-resolved path under each row. We build the place's full
// hierarchy ("Leaf, Parent, GrandParent") from the already-loaded `places`
// list, run it through the resolver, and render `matchedPath` joined with ›.
const { ready: resolverReady, ensureLoaded: ensureResolverLoaded, resolve } = usePlaceResolver();
ensureResolverLoaded();

const placesById = computed(() => {
  const map = new Map<string, PlaceRow>();
  for (const p of places.value) map.set(p.id, p);
  return map;
});

function pathString(id: string): string {
  const parts: string[] = [];
  let cur: string | null | undefined = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = placesById.value.get(cur);
    if (!row) break;
    parts.push(row.name);
    cur = row.parent_place_id ?? null;
  }
  return parts.join(', ');
}

function resolvedPathFor(id: string): string | null {
  if (!resolverReady.value) return null;
  const path = pathString(id);
  if (!path) return null;
  const match = resolve(path);
  if (!match) return null;
  return match.matchedPath.join(' › ');
}

// Country filter — derived at render time from gazetteer resolution. The DB
// only stores user-authored hierarchy (name + parent_place_id); country is
// recomputed every render against the current gazetteers (Prime Directive).
function countryFor(id: string): string | null {
  if (!resolverReady.value) return null;
  const path = pathString(id);
  if (!path) return null;
  return resolve(path)?.matchedPath[0] ?? null;
}

const countryCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  if (!resolverReady.value) return counts;
  for (const place of places.value) {
    const key = countryFor(place.id) ?? '__unresolved__';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

const UNRESOLVED = '__unresolved__';

const countryFilters = computed(() => {
  const total = places.value.length;
  if (!resolverReady.value) {
    return [{ value: 'all', label: t('common.loading'), count: total }];
  }
  const entries = Object.entries(countryCounts.value);
  entries.sort((a, b) => {
    if (a[0] === UNRESOLVED) return 1;
    if (b[0] === UNRESOLVED) return -1;
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
  return [
    { value: 'all', label: t('common.all'), count: total },
    ...entries.map(([country, count]) => ({
      value: country,
      label: country === UNRESOLVED ? t('places.unresolvedCountry') : country,
      count,
    })),
  ];
});

const showAddForm = ref(false);

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

async function load() {
  places.value = (await window.api.places.list()) as PlaceRow[];
}

async function reloadAll() {
  await Promise.all([load(), reloadPaged()]);
}

function onPlaceSaved() {
  showAddForm.value = false;
  void reloadAll();
}

watch(() => route.params.id, (id) => {
  if (typeof id === 'string' && id) selectPlace(id);
});

watch(() => route.query.place, (id) => {
  if (typeof id === 'string' && id) selectPlace(id);
});

onMounted(async () => {
  // The paged list (left column) and `places` full list (map / chip counts)
  // both load here. usePagedList auto-subscribes to onDataChanged so the
  // left list refreshes after any mutation on its own; the full `places`
  // list is refreshed via reloadAll() on user-driven save flows
  // (`place-updated` from PlacePanel, `onPlaceSaved` from add modal) which
  // is enough for the chip counts and map.
  await reloadAll();
  const id = route.params.id as string | undefined;
  if (id) selectPlace(id);
  // selectedPlaceId was pre-set from query/params in setup; just ensure panel is open
  if (selectedPlaceId.value) openPanel();
});

onActivated(() => {
  const id = route.params.id as string | undefined;
  if (id) selectPlace(id);
});
</script>

<style scoped>
/* Unique to PlacesView */
.places-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
  position: relative;
}
/* Layout, surface, and `padding-right: 28px` for the collapse tab come
   from `.list-column` in shared.css. */
.places-list-title {
  margin: 0;
  padding: var(--space-md) var(--space-md) var(--space-sm);
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
}
.places-list-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
}
.list-filter {
  flex-shrink: 0;
  padding: 0 0 var(--space-sm);
}
.list-filter-input {
  width: 100%;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  font-family: inherit;
}
.list-filter-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.map-type-filter {
  padding: 0 var(--space-lg) var(--space-sm);
}
.places-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
.places-list-scroll .data-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
  box-shadow: inset 0 -1px 0 var(--surface-border-subtle);
}
.sortable-th {
  cursor: pointer;
  user-select: none;
}
.sortable-th:hover {
  background: var(--surface-hover);
}
.sort-arrow {
  margin-left: 4px;
  font-size: var(--font-xs);
  color: var(--accent);
}
.places-list-footer {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-sm) 0 0 0;
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
.type-col {
  width: 6em;
  white-space: nowrap;
}
.info-cell {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.resolved-subline {
  color: var(--text-muted);
  font-size: var(--font-xs);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-collapse-btn {
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
}
.list-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-open-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.list-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.list-drag-handle:hover { background: var(--surface-border); }
.places-panel {
  flex-shrink: 0;
  min-width: 200px;
  max-width: 1040px;
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
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
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
</style>
