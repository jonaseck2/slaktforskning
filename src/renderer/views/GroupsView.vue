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
import { ref, onMounted, onActivated, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import GroupsTable from '../components/GroupsTable.vue';
import GroupModal from '../components/modals/GroupModal.vue';
import GroupPanel from '../components/GroupPanel.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'GroupsView' });

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
  // Per-row getLinks; one failing row mustn't kill the whole list. Fall back
  // to memberCount=0 + log so the row still shows. Past failure: a stale
  // group_links row pointing at a deleted entity threw inside getLinks and
  // load() bailed mid-loop, leaving the table at its previous (often empty)
  // state — user-reported "groups read as 0 after add".
  const enriched: GroupRow[] = await Promise.all(raw.map(async (g) => {
    try {
      const links = (await window.api.groups.getLinks(g.id)) as Array<{ entity_type: string }>;
      return { ...g, memberCount: links.length };
    } catch (err) {
      console.error('[GroupsView] getLinks failed for group', g.id, err);
      return { ...g, memberCount: 0 };
    }
  }));
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

// GroupsView doesn't yet use usePagedList (it loads everything in one shot).
// Until it does, subscribe directly to onDataChanged so the list refreshes
// after any mutation. Debounced to coalesce bursts. This is the documented
// "list view that hasn't been migrated to usePagedList yet" exception to the
// composable-owns-reactivity rule (see .claude/rules/renderer.md).
let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
const onMutation = () => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  mutationDebounce = setTimeout(() => { void load(); }, 200);
};

onMounted(async () => {
  await load();
  const id = route.params.id as string | undefined;
  if (id) selectGroup(id);
  else if (selectedGroupId.value) openPanel();
  window.api?.onDataChanged?.(onMutation);
});

onUnmounted(() => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  window.api?.offDataChanged?.(onMutation);
});

onActivated(() => {
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
