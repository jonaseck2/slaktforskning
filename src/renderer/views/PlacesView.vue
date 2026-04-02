<template>
  <div class="places-view">
    <div class="list-header">
      <h2>{{ $t('places.title') }}</h2>
      <button class="btn-add" @click="showAddForm = true">{{ $t('places.addTitle') }}</button>
    </div>
    <div v-if="places.length === 0" class="empty">{{ $t('places.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('places.name') }}</th>
          <th>{{ $t('places.type') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="place in places"
          :key="place.id"
          class="clickable-row"
          @click="$router.push('/places/' + place.id)"
        >
          <td>{{ place.name }}</td>
          <td>{{ place.place_type ? $t('placeTypes.' + place.place_type) : '—' }}</td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click.stop="deletePlace(place.id)">
              {{ $t('common.delete') }}
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
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PlaceRow { id: string; name: string; place_type: string | null; }

useI18n();
const router = useRouter();
const places = ref<PlaceRow[]>([]);
const showAddForm = ref(false);
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

onMounted(load);
</script>

<style scoped>
.places-view { max-width: 700px; }
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.list-header h2 { margin: 0; }
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.empty { color: #999; padding: 40px; text-align: center; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th, .data-table td { padding: 8px 12px; border-bottom: 1px solid #eee; text-align: left; }
.data-table th { background: #f8f8f8; font-weight: 600; font-size: 12px; color: #666; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f4ff; }
.btn-sm { padding: 2px 8px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; }
.btn-delete { background: #fee; color: #c0392b; }
.actions-cell { display: flex; gap: 4px; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal {
  background: white; border-radius: 8px; padding: 24px;
  width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.modal h3 { margin: 0 0 16px; }
form { display: flex; flex-direction: column; gap: 12px; }
form > label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: #555; }
form input[type='text'], form select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.modal-actions button { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; }
.modal-actions button[type='submit'] { background: #2c3e50; color: white; }
.btn-cancel { background: #e0e0e0; color: #333; }
</style>
