<template>
  <div class="places-view" ref="placesBodyRef">
    <!-- List mode: list sheet -->
    <div v-if="viewMode === 'list'" class="places-list-sheet" style="position: relative;">
      <div class="header">
        <h2>{{ $t('places.title') }}</h2>
        <div class="header-right">
          <div class="view-toggle">
            <AppButton :variant="viewMode === 'list' ? 'soft' : 'ghost'" size="sm" @click="viewMode = 'list'">{{ $t('places.listView') }}</AppButton>
            <AppButton :variant="viewMode === 'map' ? 'soft' : 'ghost'" size="sm" @click="viewMode = 'map'">{{ $t('places.mapView') }}</AppButton>
          </div>
          <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('places.addTitle') }}</AppButton>
        </div>
      </div>
      <div class="places-list-content">
        <p v-if="places.length > 0" class="count-label">{{ $t('places.showingOf', { shown: filteredPlaces.length, total: places.length }) }}</p>
        <FilterChips v-if="places.length > 0" :options="typeFilters" :model-value="activeTypeFilter" @update:model-value="activeTypeFilter = $event" />
        <AppEmptyState v-if="places.length === 0" icon="📍" :title="$t('empty.places')" :description="$t('empty.placesDesc')" :action-label="$t('empty.addPlace')" @action="showAddForm = true" />
        <AppEmptyState v-else-if="filteredPlaces.length === 0" icon="📍" :title="$t('empty.places') + ' ' + $t('empty.withFilter')" />
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>{{ $t('places.name') }}</th>
              <th class="actions-cell">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="place in filteredPlaces"
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
              <td>{{ place.name }}</td>
              <td class="actions-cell">
                <AppButton variant="ghost" size="sm" @click.stop="deletePlace(place.id)">✕</AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" @click="openPanel">▶</button>
    </div>

    <!-- Map mode: MapView (panel managed by PlacesView) -->
    <MapView v-else no-panel style="flex: 1; min-width: 0" @select-place="selectPlace" @reopen-panel="openPanel">
      <template #header>
        <div class="header">
          <h2>{{ $t('places.title') }}</h2>
          <div class="header-right">
            <div class="view-toggle">
              <AppButton :variant="viewMode === 'list' ? 'soft' : 'ghost'" size="sm" @click="viewMode = 'list'">{{ $t('places.listView') }}</AppButton>
              <AppButton :variant="viewMode === 'map' ? 'soft' : 'ghost'" size="sm" @click="viewMode = 'map'">{{ $t('places.mapView') }}</AppButton>
            </div>
            <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('places.addTitle') }}</AppButton>
          </div>
        </div>
      </template>
    </MapView>

    <!-- Panel: shared across list and map modes — never unmounts on view switch -->
    <template v-if="panelOpen && selectedPlaceId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, placesBodyRef!)"></div>
      <div class="places-panel" :style="{ width: panelWidth + 'px' }">
        <PlacePanel :place-id="selectedPlaceId" @close="closePanel" @select-place="selectPlace" @place-updated="load" />
      </div>
    </template>

    <!-- Add modal -->
    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-add-place">
        <h3 id="modal-title-add-place">{{ $t('common.add') }} {{ $t('places.addTitle') }}</h3>
        <form @submit.prevent="addPlace">
          <label>
            {{ $t('places.name') }}
            <input v-model="newPlace.name" type="text" required />
          </label>
          <label>
            {{ $t('places.type') }}
            <select v-model="newPlace.place_type">
              <option value="">—</option>
              <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">
                {{ $t('placeTypes.' + pt) }}
              </option>
            </select>
          </label>
          <div class="modal-actions">
            <AppButton variant="secondary" @click="showAddForm = false">{{ $t('common.cancel') }}</AppButton>
            <AppButton variant="primary" type="submit">{{ $t('common.save') }}</AppButton>
          </div>
        </form>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import MapView from './MapView.vue';
import PlacePanel from '../components/PlacePanel.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import { narratePlaceRow } from '../utils/screenReaderNarration';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface PlaceRow { id: string; name: string; place_type: string | null; }

const { t } = useI18n();
const route = useRoute();
const places = ref<PlaceRow[]>([]);
const placesBodyRef = ref<HTMLElement | null>(null);

const LS_KEY = 'slaktforskning-places-view';
const viewMode = ref<'list' | 'map'>((localStorage.getItem(LS_KEY) as 'list' | 'map') ?? 'map');
watch(viewMode, (v) => {
  localStorage.setItem(LS_KEY, v);
  if (v === 'list') {
    // Sync selection and panel state from MapView's localStorage on return to list mode
    selectedPlaceId.value = localStorage.getItem('map-selected-place');
    panelOpen.value = localStorage.getItem('map-panel-open') !== 'false';
    const stored = parseInt(localStorage.getItem('map-panel-width') ?? '', 10);
    if (!isNaN(stored) && stored >= 200) panelWidth.value = stored;
  }
});
const activeTypeFilter = ref<string>('all');

// If ?place= is in the URL, write to localStorage now (before MapView setup runs) so
// MapView picks it up when it initializes its own selectedPlaceId from the same key.
const queryPlace = route.query.place;
if (typeof queryPlace === 'string' && queryPlace) {
  localStorage.setItem('map-selected-place', queryPlace);
  localStorage.setItem('map-panel-open', 'true');
}

// Panel state (shared keys with MapView so switching modes preserves selection)
const selectedPlaceId = ref<string | null>(localStorage.getItem('map-selected-place'));
const panelOpen = ref(localStorage.getItem('map-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: 'map-panel-width', maxWidthRatio: 0.5 });

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
}

const typeCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const place of places.value) {
    const key = place.place_type ?? 'other';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

const typeFilters = computed(() => [
  { value: 'all', label: t('common.all'), count: places.value.length },
  ...PLACE_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: t('placeTypes.' + type),
      count: typeCounts.value[type] ?? 0,
    })),
]);

const filteredPlaces = computed(() =>
  activeTypeFilter.value === 'all'
    ? places.value
    : places.value.filter(p => (p.place_type ?? 'other') === activeTypeFilter.value)
);
const showAddForm = ref(false);

const newPlace = reactive({ name: '', place_type: '' });

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

async function addPlace() {
  await window.api.places.create({
    name: newPlace.name,
    place_type: newPlace.place_type || null,
  });
  showAddForm.value = false;
  Object.assign(newPlace, { name: '', place_type: '' });
  await load();
}

async function deletePlace(id: string) {
  await window.api.places.delete(id);
  await load();
}

watch(() => route.query.place, (id) => {
  if (typeof id === 'string' && id) selectPlace(id);
});

onMounted(async () => {
  if (route.query.view === 'map') viewMode.value = 'map';
  await load();
  loadedVersion = dataVersionStore.version;
  // selectedPlaceId was pre-set from query in setup; just ensure panel is open
  if (selectedPlaceId.value) openPanel();
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
</script>

<style scoped>
/* Unique to PlacesView */
.places-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.places-list-sheet {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.places-list-sheet > .header {
  padding: var(--space-lg) var(--space-lg) 0;
  margin-bottom: var(--space-sm);
}
.places-list-content {
  flex: 1;
  min-height: 0;
  padding: 0 var(--space-lg) var(--space-lg);
  overflow-y: auto;
  position: relative;
}
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
