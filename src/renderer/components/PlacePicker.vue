<template>
  <div class="place-picker">
    <input
      type="text"
      v-model="query"
      :placeholder="placeholder || $t('places.searchPlaceholder')"
      @input="onInput"
      @focus="showDropdown = true"
      @blur="onBlur"
      autocomplete="off"
    />
    <div v-if="showDropdown && (results.length > 0 || query.length > 1)" class="dropdown">
      <div
        v-for="place in results"
        :key="place.id"
        class="dropdown-item"
        @mousedown.prevent="select(place)"
      >
        <span class="place-name">{{ place.name }}</span>
        <span v-if="place.place_type" class="place-type">{{ $t('placeTypes.' + place.place_type) }}</span>
      </div>
      <div
        v-if="query.length > 1 && results.every(r => r.name.toLowerCase() !== query.toLowerCase())"
        class="dropdown-item create-new"
        @mousedown.prevent="createNew"
      >
        {{ $t('places.createNew', { name: query }) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PlaceRow { id: string; name: string; place_type: string | null; }

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  'select': [place: PlaceRow];
}>();

useI18n();
const query = ref('');
const results = ref<PlaceRow[]>([]);
const showDropdown = ref(false);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(() => props.modelValue, async (id) => {
  if (!id) { query.value = ''; return; }
  const place = (await window.api.places.get(id)) as PlaceRow | null;
  if (place) query.value = place.name;
}, { immediate: true });

function onInput() {
  clearTimeout(debounceTimer);
  if (query.value.length < 1) { results.value = []; return; }
  debounceTimer = setTimeout(async () => {
    results.value = (await window.api.places.search(query.value)) as PlaceRow[];
  }, 150);
}

function select(place: PlaceRow) {
  query.value = place.name;
  showDropdown.value = false;
  emit('update:modelValue', place.id);
  emit('select', place);
}

async function createNew() {
  const place = (await window.api.places.findOrCreate(query.value)) as PlaceRow;
  select(place);
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false; }, 150);
}
</script>

<style scoped>
.place-picker { position: relative; }
.place-picker input { font-size: 14px; }
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.dropdown-item:hover { background: #f0f4ff; }
.place-type {
  font-size: 12px;
  color: #999;
}
.create-new { color: #1d4ed8; font-style: italic; }
</style>
