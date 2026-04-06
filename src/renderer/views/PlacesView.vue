<template>
  <div>
    <div class="header">
      <h2>{{ $t('places.title') }}</h2>
      <button class="btn-add" @click="showAddForm = true">{{ $t('places.addTitle') }}</button>
    </div>
    <p v-if="places.length > 0" class="count-label">{{ places.length }} {{ $t('places.title').toLowerCase() }}</p>
    <div v-if="places.length > 0" class="filter-chips">
      <button
        v-for="f in typeFilters"
        :key="f.value"
        :class="['chip', { active: activeTypeFilter === f.value }]"
        @click="activeTypeFilter = f.value"
      >{{ f.label }}</button>
    </div>
    <div v-if="places.length === 0" class="empty">{{ $t('places.none') }}</div>
    <div v-else-if="filteredPlaces.length === 0" class="empty">{{ $t('places.noMatchingFilter') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('places.name') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="place in filteredPlaces"
          :key="place.id"
          class="clickable-row"
          @click="$router.push('/places/' + place.id)"
        >
          <td>{{ place.name }}</td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click.stop="deletePlace(place.id)">✕
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('places.addTitle') }}</h3>
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
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PlaceRow { id: string; name: string; place_type: string | null; }

const { t } = useI18n();
const router = useRouter();
const places = ref<PlaceRow[]>([]);
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
  { value: 'all', label: `${t('common.all')} (${places.value.length})` },
  ...PLACE_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: `${t('placeTypes.' + type)} (${typeCounts.value[type] ?? 0})`,
    })),
]);

const filteredPlaces = computed(() =>
  activeTypeFilter.value === 'all'
    ? places.value
    : places.value.filter(p => (p.place_type ?? 'other') === activeTypeFilter.value)
);
const showAddForm = ref(false);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const newPlace = reactive({ name: '', place_type: '' });

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
.actions-cell { white-space: nowrap; }
</style>
