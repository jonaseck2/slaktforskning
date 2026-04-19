<template>
  <div class="places-view">
    <div v-if="viewMode === 'list'" class="places-list-sheet">
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
      <p v-if="places.length > 0" class="count-label">{{ $t('places.showingOf', { shown: filteredPlaces.length, total: places.length }) }}</p>
      <FilterChips v-if="places.length > 0" :options="typeFilters" :model-value="activeTypeFilter" @update:model-value="activeTypeFilter = $event" />
      <AppEmptyState v-if="places.length === 0" icon="📍" :title="$t('empty.places')" />
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
            tabindex="0"
            role="button"
            :aria-label="$t('a11y.editItem', { item: place.name })"
            @click="$router.push('/places/' + place.id)"
            @keydown.enter="$router.push('/places/' + place.id)"
            @keydown.space.prevent="$router.push('/places/' + place.id)"
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

    <MapView v-else>
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

    <!-- Add modal -->
    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-add-place">
        <h3 id="modal-title-add-place">{{ $t('places.addTitle') }}</h3>
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
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import MapView from './MapView.vue';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import { narratePlaceRow } from '../utils/screenReaderNarration';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface PlaceRow { id: string; name: string; place_type: string | null; }

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const places = ref<PlaceRow[]>([]);

const LS_KEY = 'slaktforskning-places-view';
const viewMode = ref<'list' | 'map'>((localStorage.getItem(LS_KEY) as 'list' | 'map') ?? 'map');
watch(viewMode, (v) => localStorage.setItem(LS_KEY, v));
const activeTypeFilter = ref<string>('all');

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

onMounted(async () => {
  if (route.query.view === 'map') viewMode.value = 'map';
  await load();
  loadedVersion = dataVersionStore.version;
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
.places-view { height: 100%; }
.places-list-sheet {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
</style>
