<template>
  <BaseSubPanel
    entity-type="place"
    :title="displayTitle"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.name') }}</span>
        <PlaceNameAutocomplete
          ref="nameRef"
          :model-value="form.name"
          :exclude-place-id="editingPlace?.id ?? null"
          @update:model-value="form.name = $event"
        />
      </div>

      <PlaceFormFields
        :form="form"
        :resolved-match="resolvedMatch"
        :resolved-type-label="resolvedTypeLabel"
        :resolved-parent-path="resolvedParentPath"
        @update:field="onFieldUpdate"
      />

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
import { reactive, ref, computed, onMounted, nextTick, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlaceFormFields, { type PlaceFormShape } from '../PlaceFormFields.vue';
import PlaceNameAutocomplete from '../PlaceNameAutocomplete.vue';
import { useResolvedPlace } from '../../composables/useResolvedPlace';

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

const { t } = useI18n();

const nameRef = ref<{ focus: () => void } | null>(null);

interface ModalForm extends PlaceFormShape {
  name: string;
  notes: string | null;
}

const form = reactive<ModalForm>({
  name: props.editingPlace?.name ?? '',
  place_type: props.editingPlace?.place_type ?? null,
  parent_place_id: props.editingPlace?.parent_place_id ?? props.parentPlaceId ?? null,
  latitude: props.editingPlace?.latitude ?? null,
  longitude: props.editingPlace?.longitude ?? null,
  notes: props.editingPlace?.notes ?? null,
});

// Track the parent's ancestor chain (leaf → root names) so the resolver sees
// "Chennai, India" when the user typed "Chennai" and picked India as parent.
const ancestorChain = ref<string[]>([]);
async function loadAncestorChain(parentId: string | null) {
  if (!parentId || !window.api) {
    ancestorChain.value = [];
    return;
  }
  try {
    const path = (await window.api.places.getPath(parentId)) as string | null;
    ancestorChain.value = path ? path.split(',').map(s => s.trim()).filter(Boolean) : [];
  } catch {
    ancestorChain.value = [];
  }
}
watch(() => form.parent_place_id, (id) => loadAncestorChain(id), { immediate: true });

const { resolvedMatch, resolvedTypeLabel, resolvedParentPath } = useResolvedPlace(
  toRef(form, 'name'),
  ancestorChain,
);

const parentPlaceName = ref('');
const displayTitle = computed(() => {
  if (form.name) return form.name;
  const base = t('places.newPlace');
  return parentPlaceName.value
    ? t('places.titleIn', { title: base, name: parentPlaceName.value })
    : base;
});
async function loadParentPlaceName() {
  if (!form.parent_place_id || !window.api) return;
  try {
    const place = (await window.api.places.get(form.parent_place_id)) as { name: string } | null;
    if (place) parentPlaceName.value = place.name;
  } catch { /* ignore */ }
}

function onFieldUpdate(field: keyof PlaceFormShape, value: unknown) {
  (form as Record<string, unknown>)[field] = value;
}

async function handleSave() {
  if (!window.api || !form.name.trim()) return;
  try {
    const payload = {
      name: form.name.trim(),
      place_type: form.place_type,
      parent_place_id: form.parent_place_id,
      latitude: form.latitude,
      longitude: form.longitude,
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

onMounted(async () => {
  await loadParentPlaceName();
  await nextTick();
  nameRef.value?.focus();
});
</script>
