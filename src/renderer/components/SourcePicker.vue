<template>
  <div class="source-picker">
    <input
      type="text"
      v-model="query"
      :placeholder="placeholder || $t('citations.selectSource')"
      role="combobox"
      :aria-expanded="showDropdown && totalOptions() > 0"
      aria-autocomplete="list"
      :aria-controls="pickerId + '-listbox'"
      :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + highlightIndex : undefined"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      autocomplete="off"
    />
    <ul
      v-if="showDropdown && totalOptions() > 0"
      :id="pickerId + '-listbox'"
      role="listbox"
      class="dropdown"
    >
      <li
        v-for="(source, idx) in results"
        :key="source.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="dropdown-item"
        :class="{ highlighted: idx === highlightIndex }"
        @mousedown.prevent="select(source)"
      >
        <div class="source-main">
          <span class="source-title">{{ source.title }}</span>
          <span v-if="source.source_type" class="source-type">{{ $t('sourceTypes.' + source.source_type) }}</span>
        </div>
        <div v-if="source.author" class="source-subtitle">{{ source.author }}</div>
      </li>
      <li
        v-if="query.length > 1 && results.every(r => r.title.toLowerCase() !== query.toLowerCase())"
        :id="pickerId + '-option-' + results.length"
        role="option"
        :aria-selected="results.length === highlightIndex"
        class="dropdown-item create-new"
        :class="{ highlighted: results.length === highlightIndex }"
        @mousedown.prevent="createNew"
      >
        {{ $t('sources.createNew', { name: query }) }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const pickerId = 'source-picker-' + Math.random().toString(36).slice(2, 8);

interface SourceRow { id: string; title: string; author: string | null; source_type: string | null; }

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  'select': [source: SourceRow];
  'create-new': [title: string];
}>();

const { t } = useI18n();
const query = ref('');
const results = ref<SourceRow[]>([]);
const showDropdown = ref(false);
const highlightIndex = ref(-1);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(results, () => { highlightIndex.value = -1; });

watch(() => props.modelValue, async (id) => {
  if (!id) { query.value = ''; return; }
  const source = (await window.api.sources.get(id)) as SourceRow | null;
  if (source) query.value = source.title;
}, { immediate: true });

function onInput() {
  clearTimeout(debounceTimer);
  if (query.value.length < 1) { results.value = []; return; }
  debounceTimer = setTimeout(async () => {
    results.value = (await window.api.sources.search(query.value)) as SourceRow[];
  }, 150);
}

function onFocus() {
  showDropdown.value = true;
  // Show all sources if the field is empty or short
  if (query.value.length < 2) {
    (async () => {
      results.value = (await window.api.sources.list()) as SourceRow[];
    })();
  }
}

function hasCreateNew(): boolean {
  return query.value.length > 1 && results.value.every(r => r.title.toLowerCase() !== query.value.toLowerCase());
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

function select(source: SourceRow) {
  query.value = source.title;
  showDropdown.value = false;
  emit('update:modelValue', source.id);
  emit('select', source);
}

function createNew() {
  emit('create-new', query.value);
  showDropdown.value = false;
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false; }, 150);
}
</script>

<style scoped>
.source-picker { position: relative; width: 100%; box-sizing: border-box; }
.source-picker input { font-size: var(--font-base); width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; }
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
.source-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.source-subtitle {
  font-size: var(--font-xs);
  color: #999;
  margin-top: 2px;
}
.dropdown-item:hover { background: var(--color-row-hover); }
.dropdown-item.highlighted { background: var(--color-row-hover); }
.source-type {
  font-size: var(--font-xs);
  color: #999;
}
.create-new { color: #1d4ed8; font-style: italic; }
</style>
