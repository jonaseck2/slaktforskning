<template>
  <div class="groups-view" ref="groupsBodyRef">
    <div class="groups-list-sheet">
      <div class="header">
        <h2>{{ $t('groups.title') }}</h2>
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('groups.addGroup') }}</AppButton>
      </div>
      <p v-if="groups.length > 0" class="count-label">{{ groups.length }} {{ $t('groups.title').toLowerCase() }}</p>
      <AppEmptyState v-if="groups.length === 0" icon="🏷️" :title="$t('empty.groups')" :description="$t('empty.groupsDesc')" :action-label="$t('empty.addGroup')" @action="showAddForm = true" />
      <GroupsTable
        v-else
        :groups="groups"
        :show-members="true"
        :selected-id="selectedGroupId"
        @remove="deleteGroup"
        @select="selectGroup"
      />
      <button v-if="!panelOpen && selectedGroupId" class="panel-open-btn" @click="openPanel">◀</button>
    </div>

    <template v-if="panelOpen && selectedGroupId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, groupsBodyRef!)"></div>
      <div class="groups-panel" :style="{ width: panelWidth + 'px' }">
        <GroupPanel :group-id="selectedGroupId" @close="closePanel" />
      </div>
    </template>

    <GroupModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('groups.removeConfirmTitle')"
      :message="$t('groups.confirmDelete')"
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
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { useDataVersionStore } from '../stores/dataVersion';
import GroupsTable from '../components/GroupsTable.vue';
import GroupModal from '../components/modals/GroupModal.vue';
import GroupPanel from '../components/GroupPanel.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'GroupsView' });

const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface GroupRow {
  id: string;
  name: string;
  notes: string;
  memberCount: number;
}

const { t } = useI18n();
const route = useRoute();
const groups = ref<GroupRow[]>([]);
const showAddForm = ref(false);

const groupsBodyRef = ref<HTMLElement | null>(null);
const selectedGroupId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.groupsSelectedId));
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.groupsPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: STORAGE_KEYS.groupsPanelWidth, maxWidthRatio: 0.5 });

async function load() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string; notes: string }>;
  const enriched: GroupRow[] = [];
  for (const g of raw) {
    const links = (await window.api.groups.getLinks(g.id)) as Array<{ entity_type: string }>;
    enriched.push({ ...g, memberCount: links.length });
  }
  groups.value = enriched;
}

function onSaved(group?: { id: string }) {
  showAddForm.value = false;
  load();
  if (group?.id) selectGroup(group.id);
}

const del = useDeleteConfirm<string>(async (id) => {
  await window.api.groups.delete(id);
  if (selectedGroupId.value === id) {
    selectedGroupId.value = null;
    localStorage.removeItem(STORAGE_KEYS.groupsSelectedId);
  }
  await load();
});
function deleteGroup(id: string) { del.ask(id); }

function selectGroup(id: string) {
  selectedGroupId.value = id;
  localStorage.setItem(STORAGE_KEYS.groupsSelectedId, id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.groupsPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.groupsPanelOpen, 'false');
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
  const id = route.params.id as string | undefined;
  if (id) selectGroup(id);
  else if (selectedGroupId.value) openPanel();
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
  const id = route.params.id as string | undefined;
  if (id) selectGroup(id);
});
</script>

<style scoped>
.groups-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.groups-list-sheet {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-lg);
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.groups-panel {
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
</style>
