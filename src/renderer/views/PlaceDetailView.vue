<template>
  <div v-if="place" class="place-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.back()" :aria-label="$t('a11y.goBack')">← {{ $t('common.back') }}</button>
      <h2>{{ place.name }}</h2>
      <span v-if="place.place_type" class="type-badge">{{ $t('placeTypes.' + place.place_type) }}</span>
    </div>

    <section class="detail-section" aria-labelledby="section-place-details">
      <div class="section-header">
        <h4 id="section-place-details">{{ $t('places.detailsTitle') }}</h4>
      </div>
      <div class="field-grid">
        <label>{{ $t('places.name') }}
          <input v-model="editName" type="text" @blur="save({ name: editName })" />
        </label>
        <label>{{ $t('places.type') }}
          <select v-model="editType" @change="save({ place_type: editType || null })">
            <option value="">—</option>
            <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">
              {{ $t('placeTypes.' + pt) }}
            </option>
          </select>
        </label>
        <label>{{ $t('places.parentPlace') }}
          <PlacePicker v-model="editParentId" @update:model-value="save({ parent_place_id: $event })" />
        </label>
        <label>{{ $t('places.latitude') }}
          <input v-model.number="editLat" type="number" step="0.000001" @blur="save({ latitude: editLat || null })" />
        </label>
        <label>{{ $t('places.longitude') }}
          <input v-model.number="editLon" type="number" step="0.000001" @blur="save({ longitude: editLon || null })" />
        </label>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="section-place-address">
      <div class="section-header">
        <h4 id="section-place-address">{{ $t('places.address') }}</h4>
      </div>
      <div class="field-grid">
        <label>{{ $t('places.street') }}
          <input v-model="editStreet" type="text" @blur="save({ street: editStreet || null })" />
        </label>
        <label>{{ $t('places.postalCode') }}
          <input v-model="editPostalCode" type="text" @blur="save({ postal_code: editPostalCode || null })" />
        </label>
        <label>{{ $t('places.city') }}
          <input v-model="editCity" type="text" @blur="save({ city: editCity || null })" />
        </label>
        <label>{{ $t('places.country') }}
          <input v-model="editCountry" type="text" @blur="save({ country: editCountry || null })" />
        </label>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="section-place-notes">
      <h4 id="section-place-notes">{{ $t('common.notes') }}</h4>
      <textarea v-model="editNotes" rows="3" @blur="save({ notes: editNotes })" />
    </section>

    <section v-if="children.length" class="detail-section" aria-labelledby="section-place-children">
      <h4 id="section-place-children">{{ $t('places.childPlaces') }}</h4>
      <ul class="child-list">
        <li v-for="child in children" :key="child.id">
          <a href="#" @click.prevent="$router.push('/places/' + child.id)">{{ child.name }}</a>
          <span v-if="child.place_type" class="type-badge">{{ $t('placeTypes.' + child.place_type) }}</span>
        </li>
      </ul>
    </section>
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PlacePicker from '../components/PlacePicker.vue';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';

interface PlaceRow { id: string; name: string; place_type: string | null; parent_place_id: string | null; latitude: number | null; longitude: number | null; notes: string; street: string | null; postal_code: string | null; city: string | null; country: string | null; }

useI18n();
const route = useRoute();
const placeId = route.params.id as string;
const place = ref<PlaceRow | null>(null);
const children = ref<PlaceRow[]>([]);
const editName = ref('');
const editType = ref('');
const editParentId = ref<string | null>(null);
const editLat = ref<number | null>(null);
const editLon = ref<number | null>(null);
const editNotes = ref('');
const editStreet = ref('');
const editPostalCode = ref('');
const editCity = ref('');
const editCountry = ref('');
async function load() {
  place.value = (await window.api.places.get(placeId)) as PlaceRow | null;
  if (!place.value) return;
  editName.value = place.value.name;
  editType.value = place.value.place_type ?? '';
  editParentId.value = place.value.parent_place_id;
  editLat.value = place.value.latitude;
  editLon.value = place.value.longitude;
  editNotes.value = place.value.notes;
  editStreet.value = place.value.street ?? '';
  editPostalCode.value = place.value.postal_code ?? '';
  editCity.value = place.value.city ?? '';
  editCountry.value = place.value.country ?? '';
  const all = (await window.api.places.list()) as PlaceRow[];
  children.value = all.filter(p => p.parent_place_id === placeId);
}

async function save(data: Record<string, unknown>) {
  await window.api.places.update(placeId, data);
  await load();
}

onMounted(load);
</script>

<style scoped>
.place-detail { max-width: 700px; }
.detail-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.detail-header h2 { margin: 0; }
.btn-back { background: none; border: none; color: var(--color-primary); cursor: pointer; padding: 4px 0; font-size: var(--font-base); }
.btn-back:hover { text-decoration: underline; }
.type-badge { background: var(--color-bg-muted); color: var(--color-text-subtle); padding: 2px 8px; border-radius: 10px; font-size: var(--font-xs); }
.detail-section { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
.detail-section h4 { margin: 0 0 8px; font-size: var(--font-md); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-header h4 { margin: 0; font-size: var(--font-md); }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.full-width { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: #555; }
input[type='text'], input[type='number'], select, textarea {
  padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: var(--font-base); font-family: inherit;
}
textarea { resize: vertical; width: 100%; box-sizing: border-box; }
.child-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.child-list li { display: flex; align-items: center; gap: 8px; }
.child-list a { color: var(--color-primary); text-decoration: none; font-size: var(--font-base); }
.child-list a:hover { text-decoration: underline; }
.empty { color: #999; padding: 40px; text-align: center; }
</style>
