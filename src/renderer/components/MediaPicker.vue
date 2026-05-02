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
      <button
        type="button"
        class="picker-attach"
        :aria-label="$t('media.attachFromFile')"
        :title="$t('media.attachFromFile')"
        @mousedown.prevent="onAttachClick"
      >📎</button>
    </div>
    <ul v-if="open" role="listbox" class="picker-dropdown">
      <li
        v-for="(item, idx) in results"
        :key="item.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="() => narrateMedia({ title: displayTitle(item), format: item.format ?? undefined }, labels)"
        @mousedown.prevent="select(item)"
      >
        <span class="picker-name">{{ displayTitle(item) }}</span>
        <span v-if="item.format" class="picker-format">{{ item.format.toUpperCase() }}</span>
      </li>
      <li
        role="option"
        class="picker-option picker-option-attach"
        :class="{ highlighted: highlightIndex === results.length }"
        @mousedown.prevent="onAttachClick"
      >
        <span class="picker-name">📎 {{ searchQuery.trim() ? $t('media.attachFromFileWithQuery', { query: searchQuery.trim() }) : $t('media.attachFromFile') }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { mediaDisplayName } from '../utils/mediaUtils';
import { narrateMedia, narrationLabelsFromI18n } from '../utils/narration';

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
}

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
  excludeIds?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [item: MediaItem];
  'attach-file': [suggestedTitle: string];
}>();

const { t } = useI18n();
const labels = narrationLabelsFromI18n(t);
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
  const excluded = new Set(props.excludeIds ?? []);
  const pool = allMedia.value.filter(m => !excluded.has(m.id));
  const q = query.trim().toLowerCase();
  if (!q) {
    results.value = pool.slice(0, 20);
    return;
  }
  results.value = pool
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

function onAttachClick() {
  emit('attach-file', searchQuery.value.trim());
  open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  const max = results.value.length;  // last index = footer
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, max);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    if (highlightIndex.value === max) {
      onAttachClick();
    } else {
      select(results.value[highlightIndex.value]);
    }
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
  background: var(--surface-bg);
  color: var(--text-primary);
}
.picker-input-wrap input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
  background: var(--surface);
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
.picker-input-wrap { gap: 0; }
.picker-attach {
  background: none;
  border: none;
  font-size: var(--font-base);
  cursor: pointer;
  padding: 0 6px;
  line-height: 1;
}
.picker-attach:hover { color: var(--accent); }
.picker-option-attach {
  border-top: 1px solid var(--surface-border-subtle);
  color: var(--text-secondary);
  font-style: italic;
}
</style>
