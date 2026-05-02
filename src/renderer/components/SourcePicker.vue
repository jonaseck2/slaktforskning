<template>
  <div class="source-picker">
    <div class="picker-input-row">
      <input
        ref="inputRef"
        type="text"
        v-model="query"
        :placeholder="placeholder || $t('citations.selectSource')"
        :disabled="disabled"
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
        :class="{ 'has-edit-btn': modelValue }"
      />
      <button
        v-if="modelValue"
        type="button"
        class="edit-source-btn"
        :aria-label="$t('common.edit')"
        :title="$t('common.edit')"
        @click="$emit('edit-source')"
      >✎</button>
    </div>
    <Teleport to="body">
    <ul
      v-if="showDropdown && totalOptions() > 0"
      :id="pickerId + '-listbox'"
      role="listbox"
      class="dropdown"
      :style="dropdownStyle"
    >
      <li
        v-for="(source, idx) in results"
        :key="source.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="dropdown-item"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="() => narrateSource({ title: source.title, author: source.author ?? undefined, citationCount: 0 }, labels)"
        @mousedown.prevent="select(source)"
      >
        <div class="source-main">
          <span class="source-title">{{ source.title }}</span>
          <span v-if="source.source_type" class="source-type">{{ $t('sourceTypes.' + source.source_type) }}</span>
        </div>
        <div v-if="source.author" class="source-subtitle">{{ source.author }}</div>
      </li>
      <li
        v-if="showCreateNew"
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { narrateSource, narrationLabelsFromI18n } from '../utils/narration';

const pickerId = 'source-picker-' + Math.random().toString(36).slice(2, 8);

interface SourceRow { id: string; title: string; author: string | null; source_type: string | null; }

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  'select': [source: SourceRow];
  'create-new': [title: string];
  'edit-source': [];
}>();

const { t } = useI18n();
const labels = narrationLabelsFromI18n(t);
const query = ref('');
const results = ref<SourceRow[]>([]);
const showDropdown = ref(false);
const highlightIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});
let debounceTimer: ReturnType<typeof setTimeout>;

function updateDropdownPosition() {
  const el = inputRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  dropdownStyle.value = {
    position: 'fixed',
    top: `${r.bottom + 2}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
  };
}

function onScroll() { if (showDropdown.value) updateDropdownPosition(); }

onMounted(() => {
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onScroll);
});

watch(showDropdown, (open) => {
  if (open) nextTick(updateDropdownPosition);
});
watch(results, () => {
  highlightIndex.value = -1;
  if (showDropdown.value) nextTick(updateDropdownPosition);
});

// Tracks the title set after a successful select. When the user edits the
// input so it no longer matches, we drop the resolved modelValue so the
// query becomes a clean search again (mirrors PlacePicker's behaviour).
const lastResolvedTitle = ref('');

watch(() => props.modelValue, async (id) => {
  if (!id) { query.value = ''; lastResolvedTitle.value = ''; return; }
  const source = (await window.api.sources.get(id)) as SourceRow | null;
  if (source) {
    query.value = source.title;
    lastResolvedTitle.value = source.title;
  }
}, { immediate: true });

function onInput() {
  clearTimeout(debounceTimer);
  // Editing away from the resolved title clears the previously picked source
  // so the user can search/create against the new query freely.
  if (props.modelValue && query.value !== lastResolvedTitle.value) {
    emit('update:modelValue', null);
    lastResolvedTitle.value = '';
  }
  if (query.value.length < 1) { results.value = []; return; }
  debounceTimer = setTimeout(async () => {
    results.value = (await window.api.sources.search(query.value)) as SourceRow[];
  }, 150);
}

async function onFocus() {
  showDropdown.value = true;
  // Always populate results on focus so the dropdown is useful even when the
  // input shows a pre-selected source title.
  if (query.value.length < 2) {
    results.value = (await window.api.sources.list()) as SourceRow[];
  } else {
    results.value = (await window.api.sources.search(query.value)) as SourceRow[];
  }
}

// Suppress the "create new" affordance when (a) input is too short, or (b) a
// source is already resolved (modelValue is set), or (c) the query exactly
// matches an existing result.
const showCreateNew = computed(() => {
  if (query.value.length <= 1) return false;
  if (props.modelValue) return false;
  const q = query.value.toLowerCase();
  return results.value.every(r => r.title.toLowerCase() !== q);
});

function totalOptions(): number {
  return results.value.length + (showCreateNew.value ? 1 : 0);
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
  lastResolvedTitle.value = source.title;
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
.picker-input-row { position: relative; width: 100%; }
.source-picker input { font-size: var(--font-base); width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--surface-border); border-radius: 4px; font-family: inherit; background: var(--surface-bg); color: var(--text-primary); }
.source-picker input.has-edit-btn { padding-right: 32px; }
.source-picker input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); background: var(--surface); }
.source-picker input:disabled { background: var(--surface); cursor: default; opacity: 0.85; }
.edit-source-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
}
.edit-source-btn:hover { background: var(--surface-hover); color: var(--text-primary); }
.edit-source-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
/* Position is set inline (computed from input's bounding rect) since the
   dropdown is teleported to <body>. Scoped styles still reach the teleported
   element because Vue keeps the data-v-* attribute on it. */
.dropdown {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  box-shadow: var(--shadow-md);
  z-index: 1000;
  max-height: 240px;
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
