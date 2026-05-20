<template>
  <BaseSubPanel
    entity-type="note"
    :title="$t('notes.pickerTitle')"
    :mode="mode"
    hide-save
    @cancel="$emit('cancel')"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <input
          ref="inputEl"
          type="text"
          class="ep-input list-filter-input"
          v-model="searchQuery"
          :placeholder="$t('notes.pickerTitle')"
          :aria-label="$t('notes.pickerTitle')"
        />
      </div>

      <p class="count-label">
        {{ $t('notes.countLabel', { shown: filtered.length, total: allNotes.length }) }}
      </p>

      <div v-if="loading" class="loading-row">{{ $t('common.loading') }}</div>

      <SectionEmpty
        v-else-if="filtered.length === 0"
        :message="$t('notes.pickerEmpty')"
      />

      <ul v-else class="picker-list" role="listbox">
        <li
          v-for="(n, idx) in filtered"
          :key="n.id"
          role="option"
          :aria-selected="idx === highlightIndex"
          class="picker-row"
          :class="{ highlighted: idx === highlightIndex }"
          @click="pick(n)"
        >
          <span class="picker-text">{{ previewOf(n.text) }}</span>
          <span v-if="n.language" class="picker-lang">[{{ n.language }}]</span>
        </li>
      </ul>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';
import SectionEmpty from '../ui/SectionEmpty.vue';
import type { Note } from '../../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  /** Note ids already linked to the host — filtered out so the user can't double-link. */
  excludeIds?: string[];
}>(), {
  mode: 'standalone',
  excludeIds: () => [],
});

const emit = defineEmits<{
  picked: [noteId: string];
  cancel: [];
  close: [];
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const allNotes = ref<Note[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const highlightIndex = ref(-1);

const excludeSet = computed(() => new Set(props.excludeIds));

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return allNotes.value.filter(n => {
    if (excludeSet.value.has(n.id)) return false;
    if (!q) return true;
    return n.text.toLowerCase().includes(q) || (n.language ?? '').toLowerCase().includes(q);
  });
});

function previewOf(text: string): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= 120) return flat;
  return flat.slice(0, 120) + '…';
}

function pick(n: Note) {
  emit('picked', n.id);
}

onMounted(async () => {
  try {
    allNotes.value = (await window.api.notes.list()) as Note[];
  } catch (err) {
    console.error('[NotePicker] list failed:', err);
  } finally {
    loading.value = false;
  }
  await nextTick();
  inputEl.value?.focus();
});
</script>

<style scoped>
.list-filter-input {
  width: 100%;
}
.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-height: 50vh;
  overflow-y: auto;
}
.picker-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  cursor: pointer;
}
.picker-row:hover, .picker-row.highlighted { background: var(--surface-hover); }
.picker-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-sm);
}
.picker-lang {
  flex-shrink: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--surface-hover);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.loading-row {
  padding: var(--space-md);
  color: var(--text-muted);
  font-size: var(--font-sm);
}
</style>
