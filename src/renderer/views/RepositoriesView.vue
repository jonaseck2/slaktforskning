<template>
  <div class="repositories-view" ref="bodyRef">
    <div class="repositories-list-sheet">
      <div class="header">
        <h2>{{ $t('repositories.title') }}</h2>
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('repositories.singular') }}</AppButton>
      </div>
      <div v-if="repositories.length > 0 || searchQuery" class="list-filter">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('repositories.filterSearch')"
          class="list-filter-input"
        />
      </div>
      <p v-if="repositories.length > 0" class="count-label">
        {{ filteredRepositories.length }} / {{ repositories.length }} {{ $t('repositories.title').toLowerCase() }}
      </p>
      <AppEmptyState
        v-if="repositories.length === 0 && !searchQuery"
        icon="🏛️"
        :title="$t('repositories.empty')"
        :description="$t('repositories.emptyDesc')"
        :action-label="'+ ' + $t('repositories.singular')"
        @action="showAddForm = true"
      />
      <AppEmptyState
        v-else-if="filteredRepositories.length === 0"
        icon="🏛️"
        :title="$t('repositories.empty') + ' ' + $t('empty.withFilter')"
      />
      <div v-else class="repositories-list-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('repositories.name') }}</th>
              <th>{{ $t('repositories.city') }}</th>
              <th>{{ $t('repositories.country') }}</th>
              <th class="actions-cell">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="repo in filteredRepositories"
              :key="repo.id"
              class="clickable-row"
              :class="{ 'selected-row': selectedId === repo.id }"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: repo.name })"
              @click="selectRepository(repo.id)"
              @keydown.enter="selectRepository(repo.id)"
              @keydown.space.prevent="selectRepository(repo.id)"
            >
              <td>{{ repo.name }}</td>
              <td>{{ repo.city || '—' }}</td>
              <td>{{ repo.country || '—' }}</td>
              <td class="actions-cell">
                <AppButton
                  variant="ghost"
                  size="sm"
                  :aria-label="$t('a11y.deleteItem', { item: repo.name })"
                  @click.stop="askDelete(repo.id)"
                >✕</AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="!panelOpen && selectedId" class="panel-open-btn" @click="openPanel">◀</button>
    </div>

    <template v-if="panelOpen && selectedId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, bodyRef!)"></div>
      <div class="repositories-panel" :style="{ width: panelWidth + 'px' }">
        <RepositoryPanel :repository-id="selectedId" @close="closePanel" />
      </div>
    </template>

    <RepositoryModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('repositories.removeConfirmTitle')"
      :message="$t('repositories.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import RepositoryModal from '../components/modals/RepositoryModal.vue';
import RepositoryPanel from '../components/RepositoryPanel.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'RepositoriesView' });

interface RepositoryRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  notes: string;
}

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const repositories = ref<RepositoryRow[]>([]);
const showAddForm = ref(false);
const searchQuery = ref('');

const bodyRef = ref<HTMLElement | null>(null);
const selectedId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.repositoriesSelectedId));
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.repositoriesPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({
  storageKey: STORAGE_KEYS.repositoriesPanelWidth,
  maxWidthRatio: 0.5,
});

const filteredRepositories = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return repositories.value;
  return repositories.value.filter(r =>
    r.name.toLowerCase().includes(q)
    || (r.city ?? '').toLowerCase().includes(q)
    || (r.country ?? '').toLowerCase().includes(q),
  );
});

async function load() {
  if (!window.api) return;
  try {
    repositories.value = (await window.api.repositories.list()) as RepositoryRow[];
  } catch (err) {
    console.error('[RepositoriesView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

function onSaved(repo?: { id: string }) {
  showAddForm.value = false;
  void load();
  if (repo?.id) selectRepository(repo.id);
}

const del = useDeleteConfirm<string>(async (id) => {
  try {
    await window.api.repositories.delete(id);
    if (selectedId.value === id) {
      selectedId.value = null;
      localStorage.removeItem(STORAGE_KEYS.repositoriesSelectedId);
    }
    await load();
  } catch (err) {
    console.error('[RepositoriesView] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function askDelete(id: string) { del.ask(id); }

function selectRepository(id: string) {
  selectedId.value = id;
  localStorage.setItem(STORAGE_KEYS.repositoriesSelectedId, id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.repositoriesPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.repositoriesPanelOpen, 'false');
}

// Reactive refresh — same pattern as GroupsView (load-everything view).
let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
const onMutation = () => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  mutationDebounce = setTimeout(() => { void load(); }, 200);
};

onMounted(async () => {
  await load();
  const id = route.params.id as string | undefined;
  if (id) selectRepository(id);
  else if (selectedId.value) openPanel();
  window.api?.onDataChanged?.(onMutation);
});

onUnmounted(() => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  window.api?.offDataChanged?.(onMutation);
});

onActivated(() => {
  const id = route.params.id as string | undefined;
  if (id) selectRepository(id);
});
</script>

<style scoped>
.repositories-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.repositories-list-sheet {
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
.repositories-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
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
.repositories-panel {
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
