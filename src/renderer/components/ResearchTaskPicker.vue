<template>
  <div class="task-picker">
    <input
      ref="inputEl"
      type="text"
      v-model="query"
      :placeholder="$t('researchTasks.searchOrCreate')"
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
        v-for="(t, idx) in filtered"
        :key="t.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="t.task + ' — ' + $t('researchTasks.statuses.' + t.status)"
        @mousedown.prevent="select(t)"
      >
        <span class="picker-task">{{ truncate(t.task) }}</span>
        <span class="picker-status" :class="'status-' + t.status">{{ $t('researchTasks.statuses.' + t.status) }}</span>
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
        ＋ {{ $t('researchTasks.createNew') }} "{{ query.trim() }}"
      </li>
    </ul>
    <div v-if="open && filtered.length > 0" class="sr-only" aria-live="polite">
      {{ $t('a11y.searchResults', { count: filtered.length }, filtered.length) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';

const pickerId = 'task-picker-' + Math.random().toString(36).slice(2, 8);

interface TaskOption {
  id: string;
  task: string;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
  priority: number;
}

const props = defineProps<{
  /** The host entity. The picker links the chosen task to this person —
   * mirrors GroupPicker's surface contract: the panel's host entity flows
   * in as a default. */
  personId: string;
  /** Tasks already linked to this person — excluded from results so the
   * user can't double-add. */
  excludeIds: string[];
}>();

const emit = defineEmits<{
  added: [];
  cancel: [];
}>();

const query = ref('');
const open = ref(false);
const allTasks = ref<TaskOption[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);
const highlightIndex = ref(-1);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allTasks.value.filter(
    t => !props.excludeIds.includes(t.id) && (!q || t.task.toLowerCase().includes(q))
  );
});

const exactMatch = computed(() =>
  allTasks.value.some(t => t.task.toLowerCase() === query.value.trim().toLowerCase())
);

watch(filtered, () => { highlightIndex.value = -1; });

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

async function loadTasks() {
  if (!window.api) return;
  const raw = (await window.api.researchTasks.list()) as TaskOption[];
  allTasks.value = raw;
}

function onInput() {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadTasks, 150);
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

async function select(t: TaskOption) {
  await window.api.researchTasks.addLink(t.id, 'person', props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

async function createAndAdd() {
  const taskText = query.value.trim();
  if (!taskText) return;
  const created = (await window.api.researchTasks.create({
    task: taskText,
    status: 'open',
    priority: 1,
    notes: '',
    result: '',
  })) as { id: string };
  await window.api.researchTasks.addLink(created.id, 'person', props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

onMounted(async () => {
  await loadTasks();
  await nextTick();
  inputEl.value?.focus();
});
</script>

<style scoped>
.task-picker { position: relative; }
.task-picker input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: var(--font-base);
  box-sizing: border-box;
  font-family: inherit;
  background: var(--surface-bg);
  color: var(--text-primary);
}
.task-picker input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
  background: var(--surface);
}
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-top: none;
  border-radius: 0 0 4px 4px;
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
  font-size: var(--font-base);
}
.picker-option:hover { background: var(--surface-hover); }
.picker-option.highlighted { background: var(--surface-hover); }
.picker-create { color: var(--success-text, #059669); }
.picker-create:hover { background: var(--surface-hover); }
.picker-task {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.picker-status {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
}
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
