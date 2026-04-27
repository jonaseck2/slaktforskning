<template>
  <div class="sources-view" ref="sourcesBodyRef">
    <div class="sources-list-sheet">
      <div class="header">
        <h2>{{ $t('sources.title') }}</h2>
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('sources.addSource') }}</AppButton>
      </div>
      <p v-if="sourceList.length > 0" class="count-label">{{ sourceList.length }} {{ $t('sources.title').toLowerCase() }}</p>
      <AppEmptyState v-if="sourceList.length === 0" icon="📚" :title="$t('empty.sources')" :description="$t('empty.sourcesDesc')" :action-label="$t('empty.addSource')" @action="showAddForm = true" />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('sources.sourceTitle') }}</th>
            <th>{{ $t('sources.author') }}</th>
            <th>{{ $t('common.type') }}</th>
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
import { ref, onMounted, onActivated } from 'vue';
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
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';

defineOptions({ name: 'SourcesView' });

const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const sourceList = ref<SourceRow[]>([]);
const showAddForm = ref(false);

const sourcesBodyRef = ref<HTMLElement | null>(null);
const selectedSourceId = ref<string | null>(localStorage.getItem('sources-selected-id'));
const panelOpen = ref(localStorage.getItem('sources-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: 'sources-panel-width', maxWidthRatio: 0.5 });


async function load() {
  if (!window.api) return;
  try {
    sourceList.value = (await window.api.sources.list()) as SourceRow[];
  } catch (err) {
    console.error('[SourcesView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

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
      localStorage.removeItem('sources-selected-id');
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
  localStorage.setItem('sources-selected-id', id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('sources-panel-open', 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('sources-panel-open', 'false');
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
  const id = route.params.id as string | undefined;
  if (id) selectSource(id);
  else if (selectedSourceId.value) openPanel();
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
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
  overflow-y: auto;
  padding: var(--space-lg);
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
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
