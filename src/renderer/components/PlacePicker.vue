<template>
  <div class="place-picker">
    <input
      type="text"
      v-model="query"
      :placeholder="placeholder || $t('places.searchPlaceholder')"
      role="combobox"
      :aria-expanded="showDropdown && (results.length > 0 || query.length > 1)"
      aria-autocomplete="list"
      :aria-controls="pickerId + '-listbox'"
      :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + highlightIndex : undefined"
      @input="onInput"
      @focus="showDropdown = true"
      @blur="onBlur"
      @keydown="onKeydown"
      autocomplete="off"
    />
    <ul
      v-if="showDropdown && (results.length > 0 || query.length > 1)"
      :id="pickerId + '-listbox'"
      role="listbox"
      class="dropdown"
    >
      <li
        v-for="(place, idx) in results"
        :key="place.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="dropdown-item"
        :class="{ highlighted: idx === highlightIndex }"
        @mousedown.prevent="select(place)"
      >
        <div class="place-main">
          <span class="place-name">{{ place.name }}</span>
          <span v-if="place.place_type" class="place-type">{{ $t('placeTypes.' + place.place_type) }}</span>
        </div>
        <div v-if="place.parent_name || place.postal_code || place.city" class="place-subtitle">{{ place.parent_name || [place.postal_code, place.city].filter(Boolean).join(' ') }}</div>
      </li>
      <li
        v-if="query.length > 1 && results.every(r => r.name.toLowerCase() !== query.toLowerCase())"
        :id="pickerId + '-option-' + results.length"
        role="option"
        :aria-selected="results.length === highlightIndex"
        class="dropdown-item create-new"
        :class="{ highlighted: results.length === highlightIndex }"
        @mousedown.prevent="createNew"
      >
        {{ $t('places.createNew', { name: query }) }}
      </li>
    </ul>
    <div v-if="showDropdown && results.length > 0" class="sr-only" aria-live="polite">
      {{ $t('a11y.searchResults', { count: results.length }, results.length) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const pickerId = 'place-picker-' + Math.random().toString(36).slice(2, 8);

interface PlaceRow { id: string; name: string; place_type: string | null; postal_code: string | null; city: string | null; parent_name?: string | null; }

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
const highlightIndex = ref(-1);
let debounceTimer: ReturnType<typeof setTimeout>;

// Reset highlight when results change
watch(results, () => { highlightIndex.value = -1; });

watch(() => props.modelValue, async (id) => {
  if (!id) { query.value = ''; return; }
  const path = await window.api.places.getPath(id);
  if (path) query.value = path;
}, { immediate: true });

function onInput() {
  clearTimeout(debounceTimer);
  if (query.value.length < 1) { results.value = []; return; }
  debounceTimer = setTimeout(async () => {
    results.value = (await window.api.places.search(query.value)) as PlaceRow[];
  }, 150);
}

// Whether the "create new" option is currently shown
function hasCreateNew(): boolean {
  return query.value.length > 1 && results.value.every(r => r.name.toLowerCase() !== query.value.toLowerCase());
}

function totalOptions(): number {
  return results.value.length + (hasCreateNew() ? 1 : 0);
}

function onKeydown(e: KeyboardEvent) {
  if (!showDropdown.value) return;
  const total = totalOptions();
  if (total === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, total - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    if (highlightIndex.value < results.value.length) {
      select(results.value[highlightIndex.value]);
    } else {
      createNew();
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false;
  }
}

async function select(place: PlaceRow) {
  const path = await window.api.places.getPath(place.id);
  query.value = path || place.name;
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
.place-picker { position: relative; width: 100%; box-sizing: border-box; }
.place-picker input { font-size: var(--font-base); width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; }
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border-input);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-size: var(--font-base);
}
.place-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.place-subtitle {
  font-size: var(--font-xs);
  color: #999;
  margin-top: 2px;
}
.dropdown-item:hover { background: var(--color-row-hover); }
.dropdown-item.highlighted { background: var(--color-row-hover); }
.place-type {
  font-size: var(--font-xs);
  color: #999;
}
.create-new { color: #1d4ed8; font-style: italic; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
