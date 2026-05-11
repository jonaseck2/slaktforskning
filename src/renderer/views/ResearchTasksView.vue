<template>
  <div class="research-tasks-view" ref="tasksBodyRef">
    <div class="tasks-list-sheet">
      <div class="header">
        <h2>{{ $t('nav.researchTasks') }}</h2>
        <AppButton variant="soft" @click="showAddModal = true">+ {{ $t('researchTasks.addTask') }}</AppButton>
      </div>

      <p v-if="tasks.length > 0" class="count-label">
        {{ $t('researchTasks.summary', { count: tasks.length, open: openCount }) }}
      </p>

      <!-- Status filter chips -->
      <FilterChips :options="filters" :model-value="activeFilter" @update:model-value="activeFilter = $event" />

      <!-- Task list -->
      <AppEmptyState v-if="filteredTasks.length === 0" icon="🔬" :title="$t('empty.researchTasks')" :description="$t('empty.researchTasksDesc')" :action-label="$t('empty.addTask')" @action="showAddModal = true" />
      <ResearchTasksTable
        v-else
        :tasks="filteredTasks"
        :selected-id="selectedTaskId"
        @updated="load"
        @select="selectTask"
      />

      <button v-if="!panelOpen && selectedTaskId" class="panel-open-btn" @click="openPanel">◀</button>
    </div>

    <template v-if="panelOpen && selectedTaskId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, tasksBodyRef!)"></div>
      <div class="tasks-panel" :style="{ width: panelWidth + 'px' }">
        <ResearchTaskPanel :task-id="selectedTaskId" @close="closePanel" @updated="load" />
      </div>
    </template>

    <!-- Add Task Modal -->
    <ResearchTaskModal
      v-if="showAddModal"
      mode="standalone"
      @cancel="showAddModal = false"
      @close="showAddModal = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ResearchTaskModal from '../components/modals/ResearchTaskModal.vue';
import ResearchTasksTable from '../components/ResearchTasksTable.vue';
import ResearchTaskPanel from '../components/ResearchTaskPanel.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { STORAGE_KEYS } from '../utils/storage-keys';

defineOptions({ name: 'ResearchTasksView' });

const { t } = useI18n();
const route = useRoute();

interface ResearchTask {
  id: string;
  task: string;
  notes?: string;
  result?: string;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
  created_at: string;
}

const tasks = ref<ResearchTask[]>([]);
const activeFilter = ref('all');

const openCount = computed(() =>
  tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress').length
);
const showAddModal = ref(false);

const filters = computed(() => [
  { value: 'all',         label: t('researchTasks.filterAll'), count: tasks.value.length },
  { value: 'open',        label: t('researchTasks.statuses.open'), count: tasks.value.filter(t => t.status === 'open').length },
  { value: 'in_progress', label: t('researchTasks.statuses.in_progress'), count: tasks.value.filter(t => t.status === 'in_progress').length },
  { value: 'done',        label: t('researchTasks.statuses.done'), count: tasks.value.filter(t => t.status === 'done').length },
  { value: 'stopped',     label: t('researchTasks.statuses.stopped'), count: tasks.value.filter(t => t.status === 'stopped').length },
]);

const filteredTasks = computed(() => {
  if (activeFilter.value === 'all') return tasks.value;
  return tasks.value.filter(t => t.status === activeFilter.value);
});

const tasksBodyRef = ref<HTMLElement | null>(null);
const selectedTaskId = ref<string | null>(localStorage.getItem(STORAGE_KEYS.tasksSelectedId));
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.tasksPanelOpen) !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: STORAGE_KEYS.tasksPanelWidth, maxWidthRatio: 0.5 });

function selectTask(id: string) {
  selectedTaskId.value = id;
  localStorage.setItem(STORAGE_KEYS.tasksSelectedId, id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.tasksPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.tasksPanelOpen, 'false');
}


async function load() {
  tasks.value = (await window.api.researchTasks.list()) as ResearchTask[];
}

async function onSaved(newTask?: { id: string }) {
  showAddModal.value = false;
  await load();
  if (newTask?.id) selectTask(newTask.id);
}

// Same shape as GroupsView: subscribe to onDataChanged so the list refreshes
// after any mutation (modal save, MCP call, second window, db.switchTo).
// Debounced to coalesce bursts. Documented "list view that hasn't been
// migrated to usePagedList yet" exception per .claude/rules/renderer.md.
let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
const onMutation = () => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  mutationDebounce = setTimeout(() => { void load(); }, 200);
};

onMounted(async () => {
  await load();
  const id = route.params.id as string | undefined;
  if (id) selectTask(id);
  else if (selectedTaskId.value) openPanel();
  window.api?.onDataChanged?.(onMutation);
});

onUnmounted(() => {
  if (mutationDebounce) clearTimeout(mutationDebounce);
  window.api?.offDataChanged?.(onMutation);
});

onActivated(() => {
  const id = route.params.id as string | undefined;
  if (id) selectTask(id);
});
</script>

<style scoped>
.research-tasks-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.tasks-list-sheet {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-lg);
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.tasks-panel {
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
