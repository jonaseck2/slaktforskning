<template>
  <div class="group-picker">
    <input
      ref="inputEl"
      type="text"
      v-model="query"
      :placeholder="$t('groups.searchOrCreate')"
      role="combobox"
      :aria-expanded="open && (filtered.length > 0 || !!query.trim())"
      aria-autocomplete="list"
      :aria-controls="pickerId + '-listbox'"
      :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + highlightIndex : undefined"
      @input="onInput"
      @focus="open = true"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul
      v-if="open && (filtered.length > 0 || query.trim())"
      :id="pickerId + '-listbox'"
      role="listbox"
      class="picker-dropdown"
    >
      <li
        v-for="(g, idx) in filtered"
        :key="g.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        @mousedown.prevent="select(g)"
      >
        {{ g.name }}
        <span class="picker-count">{{ g.memberCount }}</span>
      </li>
      <li
        v-if="query.trim() && !exactMatch"
        :id="pickerId + '-option-' + filtered.length"
        role="option"
        :aria-selected="filtered.length === highlightIndex"
        class="picker-option picker-create"
        :class="{ highlighted: filtered.length === highlightIndex }"
        @mousedown.prevent="createAndAdd"
      >
        ＋ {{ $t('groups.createNew') }} "{{ query.trim() }}"
      </li>
    </ul>
    <div v-if="open && filtered.length > 0" class="sr-only" aria-live="polite">
      {{ $t('a11y.searchResults', { count: filtered.length }, filtered.length) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';

const pickerId = 'group-picker-' + Math.random().toString(36).slice(2, 8);

interface GroupOption { id: string; name: string; memberCount: number; }

const props = defineProps<{
  personId: string;
  excludeIds: string[];
}>();

const emit = defineEmits<{
  added: [];
  cancel: [];
}>();

const query = ref('');
const open = ref(false);
const allGroups = ref<GroupOption[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);
const highlightIndex = ref(-1);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allGroups.value.filter(
    g => !props.excludeIds.includes(g.id) && (!q || g.name.toLowerCase().includes(q))
  );
});

const exactMatch = computed(() =>
  allGroups.value.some(g => g.name.toLowerCase() === query.value.trim().toLowerCase())
);

// Reset highlight when filtered list changes
watch(filtered, () => { highlightIndex.value = -1; });

async function loadGroups() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string }>;
  const options: GroupOption[] = [];
  for (const g of raw) {
    const links = (await window.api.groups.getLinks(g.id)) as Array<{ entity_type: string }>;
    const memberCount = links.filter(l => l.entity_type === 'person').length;
    options.push({ id: g.id, name: g.name, memberCount });
  }
  allGroups.value = options;
}

function onInput() {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadGroups, 150);
}

function onBlur() {
  setTimeout(() => { open.value = false; }, 200);
}

function hasCreateNew(): boolean {
  return !!query.value.trim() && !exactMatch.value;
}

function totalOptions(): number {
  return filtered.value.length + (hasCreateNew() ? 1 : 0);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    open.value = false;
    emit('cancel');
    return;
  }
  if (!open.value) return;
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
    if (highlightIndex.value < filtered.value.length) {
      select(filtered.value[highlightIndex.value]);
    } else {
      createAndAdd();
    }
  }
}

async function select(g: GroupOption) {
  await window.api.groups.addLink(g.id, 'person', props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

async function createAndAdd() {
  const name = query.value.trim();
  if (!name) return;
  const created = (await window.api.groups.create({ name, notes: '' })) as { id: string };
  await window.api.groups.addLink(created.id, 'person', props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

onMounted(async () => {
  await loadGroups();
  await nextTick();
  inputEl.value?.focus();
});
</script>

<style scoped>
.group-picker { position: relative; }
.group-picker input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  box-sizing: border-box;
  font-family: inherit;
}
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border-input);
  border-top: none;
  border-radius: 0 0 4px 4px;
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
.picker-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-base);
}
.picker-option:hover { background: var(--color-row-hover); }
.picker-option.highlighted { background: var(--color-row-hover); }
.picker-create { color: #059669; }
.picker-create:hover { background: var(--color-row-hover); }
.picker-count { font-size: var(--font-xs); color: #aaa; }
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
