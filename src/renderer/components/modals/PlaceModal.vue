<template>
  <BaseSubPanel
    entity-type="place"
    :title="form.name || $t('places.newPlace')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.name') }}</span>
        <input
          ref="nameRef"
          class="ep-input"
          v-model="form.name"
          required
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.type') }}</span>
        <select class="ep-input" v-model="form.place_type">
          <option value="">—</option>
          <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">
            {{ $t('placeTypes.' + pt) }}
          </option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.parentPlace') }}</span>
        <PlacePicker
          :model-value="form.parent_place_id"
          :placeholder="$t('places.searchPlaceholder')"
          @update:model-value="form.parent_place_id = $event"
        />
      </div>
      <div class="ep-field ep-field--row">
        <div class="ep-field-half">
          <span class="ep-field-label">{{ $t('places.latitude') }}</span>
          <input
            class="ep-input"
            v-model="form.latitude"
            type="text"
            inputmode="decimal"
            :placeholder="$t('places.latitude')"
          />
        </div>
        <div class="ep-field-half">
          <span class="ep-field-label">{{ $t('places.longitude') }}</span>
          <input
            class="ep-input"
            v-model="form.longitude"
            type="text"
            inputmode="decimal"
            :placeholder="$t('places.longitude')"
          />
        </div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.notes') }}</span>
        <textarea
          class="ep-textarea"
          v-model="form.notes"
          rows="3"
        />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, nextTick } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';
import PlacePicker from '../PlacePicker.vue';
import { PLACE_TYPE_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Place {
  id: string;
  name: string;
  place_type: string | null;
  parent_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingPlace?: Place | null;
  parentPlaceId?: string | null;
}>(), {
  mode: 'standalone',
  editingPlace: null,
  parentPlaceId: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [place: Place];
}>();

const nameRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  name: props.editingPlace?.name ?? '',
  place_type: props.editingPlace?.place_type ?? '',
  parent_place_id: props.editingPlace?.parent_place_id ?? props.parentPlaceId ?? null,
  latitude: props.editingPlace?.latitude != null ? String(props.editingPlace.latitude) : '',
  longitude: props.editingPlace?.longitude != null ? String(props.editingPlace.longitude) : '',
  notes: props.editingPlace?.notes ?? '',
});

function parseCoord(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function handleSave() {
  if (!window.api || !form.name.trim()) return;
  try {
    const payload = {
      name: form.name.trim(),
      place_type: form.place_type || null,
      parent_place_id: form.parent_place_id,
      latitude: parseCoord(form.latitude),
      longitude: parseCoord(form.longitude),
      notes: form.notes || null,
    };
    let place: Place;
    if (props.editingPlace) {
      place = (await window.api.places.update(props.editingPlace.id, payload)) as Place;
    } else {
      place = (await window.api.places.create(payload)) as Place;
    }
    emit('saved', place);
  } catch (err) {
    console.error('[PlaceModal] save failed:', err);
  }
}

onMounted(() => nextTick(() => nameRef.value?.focus()));
</script>

<style scoped>
.ep-field--row {
  display: flex;
  gap: var(--space-sm);
}
.ep-field-half {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
