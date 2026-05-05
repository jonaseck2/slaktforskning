<template>
  <div class="sources-view" ref="sourcesBodyRef">
    <div class="sources-list-sheet">
      <div class="header">
        <h2>{{ $t('sources.title') }}</h2>
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('sources.addSource') }}</AppButton>
      </div>
      <div v-if="total > 0 || searchQuery" class="list-filter">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('sources.filterSearch')"
          class="list-filter-input"
        />
      </div>
      <p v-if="total > 0" class="count-label">
        {{ sourceList.length }} / {{ total }} {{ $t('sources.title').toLowerCase() }}
      </p>
      <AppEmptyState v-if="total === 0 && !searchQuery" icon="📚" :title="$t('empty.sources')" :description="$t('empty.sourcesDesc')" :action-label="$t('empty.addSource')" @action="showAddForm = true" />
      <AppEmptyState v-else-if="sourceList.length === 0" icon="📚" :title="$t('empty.sources') + ' ' + $t('empty.withFilter')" />
      <div v-else class="sources-list-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable-th" @click="toggleSort('title')">
              {{ $t('sources.sourceTitle') }}
              <span v-if="sortBy === 'title'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable-th" @click="toggleSort('author')">
              {{ $t('sources.author') }}
              <span v-if="sortBy === 'author'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable-th" @click="toggleSort('source_type')">
              {{ $t('common.type') }}
              <span v-if="sortBy === 'source_type'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="actions-cell">{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="source in sourceList"
            :key="source.id"
            v-narrate="() => narrateSourceRow({
              title: source.title || '',
              source_type: source.source_type || '',
              citation_count: 0,
            }, t)"
            class="clickable-row"
            :class="{ 'selected-row': selectedSourceId === source.id }"
            tabindex="0"
            role="button"
            :aria-label="$t('a11y.editItem', { item: source.title || '—' })"
            @click="selectSource(source.id)"
            @keydown.enter="selectSource(source.id)"
            @keydown.space.prevent="selectSource(source.id)"
            @keydown.down.prevent="focusNextRow($event)"
            @keydown.up.prevent="focusPrevRow($event)"
          >
            <td><LinkedText :text="source.title" /></td>
            <td>{{ source.author || '—' }}</td>
            <td><AppBadge v-if="source.source_type" variant="event">{{ $t('sourceTypes.' + source.source_type) }}</AppBadge></td>
            <td class="actions-cell">
              <AppButton
                variant="ghost"
                size="sm"
                :aria-label="$t('a11y.deleteItem', { item: source.title })"
                @click.stop="removeSource(source.id)"
              >✕</AppButton>
            </td>
          </tr>
        </tbody>
      </table>
      <div ref="sentinel" class="scroll-sentinel"></div>
      </div>
      <button v-if="!panelOpen && selectedSourceId" class="panel-open-btn" @click="openPanel">◀</button>
    </div>

    <template v-if="panelOpen && selectedSourceId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, sourcesBodyRef!)"></div>
      <div class="sources-panel" :style="{ width: panelWidth + 'px' }">
        <SourcePanel :source-id="selectedSourceId" @close="closePanel" />
      </div>
    </template>

    <!-- Add Source Modal -->
    <SourceModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSourceSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('sources.removeConfirmTitle')"
      :message="$t('sources.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onActivated } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LinkedText from '../components/LinkedText.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import SourceModal from '../components/modals/SourceModal.vue';
import SourcePanel from '../components/SourcePanel.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { narrateSourceRow } from '../utils/screenReaderNarration';
import { useToast } from '../composables/useToast';
import { usePagedList } from '../composables/usePagedList';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'SourcesView' });

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const showAddForm = ref(false);

const sourcesBodyRef = ref<HTMLElement | null>(null);
const selectedSourceId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.sourcesSelectedId));
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.sourcesPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: STORAGE_KEYS.sourcesPanelWidth, maxWidthRatio: 0.5 });

type SourceSortBy = 'title' | 'author' | 'source_type';
const {
  items: sourceList,
  total,
  searchQuery,
  sortBy,
  sortDir,
  reload: load,
  toggleSort,
  attachSentinel,
} = usePagedList<SourceRow, SourceSortBy>({
  defaultSortBy: 'title',
  storageKey: 'sources',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    try {
      const result = await window.api.sources.listPage(limit, offset, sortBy, sortDir, query) as { items: SourceRow[]; total: number };
      return { items: result.items, total: result.total };
    } catch (err) {
      console.error('[SourcesView] fetchPage failed:', err);
      toast.error(t('errors.loadFailed'));
      return { items: [], total: 0 };
    }
  },
});
const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

function onSourceSaved() {
  showAddForm.value = false;
  load();
}

const del = useDeleteConfirm<string>(async (id) => {
  if (!window.api) return;
  try {
    await window.api.sources.delete(id);
    if (selectedSourceId.value === id) {
      selectedSourceId.value = null;
      localStorage.removeItem(STORAGE_KEYS.sourcesSelectedId);
    }
    await load();
  } catch (err) {
    console.error('[SourcesView] removeSource failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeSource(id: string) { del.ask(id); }

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

function selectSource(id: string) {
  selectedSourceId.value = id;
  localStorage.setItem(STORAGE_KEYS.sourcesSelectedId, id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.sourcesPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.sourcesPanelOpen, 'false');
}

onMounted(async () => {
  // usePagedList auto-subscribes to onDataChanged so the list reloads on
  // every mutation — the old loadedVersion/onActivated dance is redundant.
  await load();
  const id = route.params.id as string | undefined;
  if (id) selectSource(id);
  else if (selectedSourceId.value) openPanel();
});

onActivated(() => {
  const id = route.params.id as string | undefined;
  if (id) selectSource(id);
});
</script>

<style scoped>
.sources-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.sources-list-sheet {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-lg);
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.sources-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
/* Sticky table header is defined globally in shared.css `.data-table thead th`. */
.list-filter {
  flex-shrink: 0;
  padding: 0 0 var(--space-sm);
}
.list-filter-input {
  width: 100%;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  font-family: inherit;
}
.list-filter-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.sortable-th {
  cursor: pointer;
  user-select: none;
}
.sortable-th:hover {
  background: var(--surface-hover);
}
.sort-arrow {
  margin-left: 4px;
  font-size: var(--font-xs);
  color: var(--accent);
}
.sources-panel {
  flex-shrink: 0;
  min-width: 200px;
  max-width: 1040px;
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
  line-height: 1;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
