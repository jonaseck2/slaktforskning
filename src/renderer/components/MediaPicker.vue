<template>
  <div class="media-picker">
    <div class="picker-input-wrap">
      <input
        ref="inputEl"
        type="text"
        :value="searchQuery"
        :placeholder="placeholder"
        role="combobox"
        :aria-expanded="open && results.length > 0"
        aria-autocomplete="list"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <button v-if="modelValue" type="button" class="picker-clear" :aria-label="$t('a11y.clearSearch')" @click="clear">&times;</button>
    </div>
    <ul v-if="open && results.length > 0" role="listbox" class="picker-dropdown">
      <li
        v-for="(item, idx) in results"
        :key="item.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        @mousedown.prevent="select(item)"
      >
        <span class="picker-name">{{ displayTitle(item) }}</span>
        <span v-if="item.format" class="picker-format">{{ item.format.toUpperCase() }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { mediaDisplayName } from '../utils/mediaUtils';

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
}

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [item: MediaItem];
}>();

const searchQuery = ref('');
const allMedia = ref<MediaItem[]>([]);
const results = ref<MediaItem[]>([]);
const open = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const highlightIndex = ref(-1);

watch(results, () => { highlightIndex.value = -1; });

watch(
  () => props.modelValue,
  async (id) => {
    if (id && window.api) {
      const m = (await window.api.media.get(id)) as MediaItem | null;
      if (m) searchQuery.value = displayTitle(m);
    } else if (!id) {
      searchQuery.value = '';
    }
  },
  { immediate: true },
);

function displayTitle(m: MediaItem): string {
  return mediaDisplayName(m.title, m.file_ref);
}

async function loadAll() {
  if (allMedia.value.length > 0 || !window.api) return;
  allMedia.value = (await window.api.media.list()) as MediaItem[];
}

function filter(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    results.value = allMedia.value.slice(0, 20);
    return;
  }
  results.value = allMedia.value
    .filter(m => displayTitle(m).toLowerCase().includes(q))
    .slice(0, 20);
}

async function onFocus() {
  await loadAll();
  filter(searchQuery.value);
  open.value = true;
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  searchQuery.value = val;
  open.value = true;
  filter(val);
}

function select(item: MediaItem) {
  searchQuery.value = displayTitle(item);
  emit('update:modelValue', item.id);
  emit('select', item);
  open.value = false;
}

function clear() {
  searchQuery.value = '';
  emit('update:modelValue', null);
  results.value = [];
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value || results.value.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, results.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    select(results.value[highlightIndex.value]);
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

function onBlur() {
  setTimeout(() => { open.value = false; }, 200);
}
</script>

<style scoped>
.media-picker {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}
.picker-input-wrap {
  display: flex;
  align-items: center;
}
.picker-input-wrap input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  background: var(--surface);
  color: var(--text-primary);
}
.picker-clear {
  background: none;
  border: none;
  font-size: var(--font-lg);
  cursor: pointer;
  color: var(--text-muted);
  padding: 0 6px;
  line-height: 1;
}
.picker-clear:hover { color: var(--text-primary); }
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: var(--shadow-md);
}
.picker-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}
.picker-option:hover,
.picker-option.highlighted { background: var(--surface-hover); }
.picker-name {
  font-size: var(--font-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.picker-format {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
