<template>
  <div class="research-tasks">
    <div class="header">
      <h2>{{ $t('researchTasks.title') }}</h2>
      <button class="btn-add" @click="showAddModal = true">{{ $t('researchTasks.addTask') }}</button>
    </div>

    <p v-if="tasks.length > 0" class="count-label">
      {{ $t('researchTasks.summary', { count: tasks.length, open: openCount }) }}
    </p>

    <!-- Status filter chips -->
    <div class="filter-chips">
      <button
        v-for="f in filters"
        :key="f.value"
        :class="['chip', { active: activeFilter === f.value }]"
        @click="activeFilter = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Task list -->
    <div v-if="filteredTasks.length === 0" class="empty">{{ $t('researchTasks.noTasks') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('researchTasks.priority') }}</th>
          <th>{{ $t('researchTasks.status') }}</th>
          <th>{{ $t('persons.title') }}</th>
          <th>{{ $t('researchTasks.task') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="task in filteredTasks" :key="task.id">
          <tr class="clickable-row" @click="toggleExpand(task.id)">
            <td>
              <span :class="['priority-badge', 'priority-' + task.priority]">{{ task.priority }}</span>
            </td>
            <td>
              <span
                :class="['status-chip', 'status-' + task.status]"
                @click.stop="cycleStatus(task)"
                :title="$t('researchTasks.status')"
              >{{ $t('researchTasks.statuses.' + task.status) }}</span>
            </td>
            <td>
              <router-link
                v-if="task.person_id && (task.person_given_name || task.person_surname)"
                :to="'/persons/' + task.person_id"
                class="person-link"
                @click.stop
              ><PersonName :given-name="task.person_given_name ?? null" :surname="task.person_surname ?? null" :preferred-name="task.person_preferred_name ?? null" :nickname="task.person_nickname ?? null" /></router-link>
              <span v-else>—</span>
            </td>
            <td class="task-text">{{ task.task }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-delete" @click.stop="deleteTask(task.id)">✕</button>
            </td>
          </tr>
          <!-- Expanded inline edit row -->
          <tr v-if="expandedId === task.id" class="expanded-row">
            <td colspan="5">
              <div class="expanded-content">
                <label>
                  {{ $t('researchTasks.task') }} *
                  <input v-model="editForm.task" type="text" required />
                </label>
                <label>
                  {{ $t('persons.title') }}
                  <div class="person-edit-row">
                    <PersonPicker v-model="editForm.person_id" :placeholder="$t('researchTasks.selectPersonOptional')" />
                    <router-link v-if="editForm.person_id" :to="'/persons/' + editForm.person_id" class="person-link person-link-btn" @click.stop>{{ $t('common.view') }} →</router-link>
                  </div>
                </label>
                <label>
                  {{ $t('researchTasks.notes') }}
                  <textarea v-model="editForm.notes" rows="2" />
                </label>
                <label>
                  {{ $t('researchTasks.result') }}
                  <textarea v-model="editForm.result" rows="2" />
                </label>
                <div class="expanded-row-inline">
                  <label>
                    {{ $t('researchTasks.status') }}
                    <select v-model="editForm.status">
                      <option value="open">{{ $t('researchTasks.statuses.open') }}</option>
                      <option value="in_progress">{{ $t('researchTasks.statuses.in_progress') }}</option>
                      <option value="done">{{ $t('researchTasks.statuses.done') }}</option>
                      <option value="stopped">{{ $t('researchTasks.statuses.stopped') }}</option>
                    </select>
                  </label>
                  <label>
                    {{ $t('researchTasks.priority') }}
                    <select v-model="editForm.priority">
                      <option :value="0">0</option>
                      <option :value="1">1</option>
                      <option :value="2">2</option>
                      <option :value="3">3</option>
                    </select>
                  </label>
                </div>
                <div class="expanded-actions">
                  <button class="btn-cancel" @click="expandedId = null">{{ $t('common.cancel') }}</button>
                  <button class="btn-add" @click="saveEdit(task.id)">{{ $t('common.save') }}</button>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <!-- Add Task Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3>{{ $t('researchTasks.addTask') }}</h3>
        <form @submit.prevent="createTask">
          <label>
            {{ $t('researchTasks.task') }} *
            <input v-model="addForm.task" type="text" required autofocus />
          </label>
          <label>
            {{ $t('persons.title') }}
            <PersonPicker v-model="addForm.person_id" :placeholder="$t('researchTasks.selectPersonOptional')" />
          </label>
          <label>
            {{ $t('researchTasks.priority') }}
            <select v-model="addForm.priority">
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </label>
          <label>
            {{ $t('researchTasks.status') }}
            <select v-model="addForm.status">
              <option value="open">{{ $t('researchTasks.statuses.open') }}</option>
              <option value="in_progress">{{ $t('researchTasks.statuses.in_progress') }}</option>
              <option value="done">{{ $t('researchTasks.statuses.done') }}</option>
              <option value="stopped">{{ $t('researchTasks.statuses.stopped') }}</option>
            </select>
          </label>
          <label>
            {{ $t('researchTasks.notes') }}
            <textarea v-model="addForm.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddModal = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import PersonName from '../components/PersonName.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();

interface ResearchTask {
  id: string;
  task: string;
  notes?: string;
  result?: string;
  person_id?: string;
  person_given_name?: string | null;
  person_surname?: string | null;
  person_preferred_name?: string | null;
  person_nickname?: string | null;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
  created_at: string;
}

const tasks = ref<ResearchTask[]>([]);
const activeFilter = ref('all');

const openCount = computed(() =>
  tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress').length
);
const expandedId = ref<string | null>(null);
const showAddModal = ref(false);

const STATUS_CYCLE: Array<'open' | 'in_progress' | 'done' | 'stopped'> = ['open', 'in_progress', 'done', 'stopped'];

const filters = computed(() => [
  { value: 'all',         label: `${t('researchTasks.filterAll')} (${tasks.value.length})` },
  { value: 'open',        label: `${t('researchTasks.statuses.open')} (${tasks.value.filter(t => t.status === 'open').length})` },
  { value: 'in_progress', label: `${t('researchTasks.statuses.in_progress')} (${tasks.value.filter(t => t.status === 'in_progress').length})` },
  { value: 'done',        label: `${t('researchTasks.statuses.done')} (${tasks.value.filter(t => t.status === 'done').length})` },
  { value: 'stopped',     label: `${t('researchTasks.statuses.stopped')} (${tasks.value.filter(t => t.status === 'stopped').length})` },
]);

const filteredTasks = computed(() => {
  if (activeFilter.value === 'all') return tasks.value;
  return tasks.value.filter(t => t.status === activeFilter.value);
});

const addForm = reactive({
  task: '',
  person_id: null as string | null,
  priority: 1,
  status: 'open' as 'open' | 'in_progress' | 'done' | 'stopped',
  notes: '',
});

const editForm = reactive({
  task: '',
  notes: '',
  result: '',
  status: 'open' as 'open' | 'in_progress' | 'done' | 'stopped',
  priority: 1,
  person_id: null as string | null,
});

async function load() {
  const raw = (await window.api.researchTasks.list()) as ResearchTask[];
  // Enrich with person names using getNames (persons.get returns no name fields)
  const enriched = await Promise.all(raw.map(async (task) => {
    if (task.person_id) {
      try {
        const names = (await window.api.persons.getNames(task.person_id)) as Array<{ given_name?: string | null; surname?: string | null; preferred_name?: string | null; nickname?: string | null }>;
        if (names.length > 0) {
          const n = names[0];
          return { ...task, person_given_name: n.given_name ?? null, person_surname: n.surname ?? null, person_preferred_name: n.preferred_name ?? null, person_nickname: n.nickname ?? null };
        }
      } catch { /* ignore */ }
    }
    return task;
  }));
  tasks.value = enriched;
}

function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null;
    return;
  }
  const task = tasks.value.find(t => t.id === id);
  if (!task) return;
  editForm.task = task.task;
  editForm.notes = task.notes ?? '';
  editForm.result = task.result ?? '';
  editForm.status = task.status;
  editForm.priority = task.priority;
  editForm.person_id = task.person_id ?? null;
  expandedId.value = id;
}

async function cycleStatus(task: ResearchTask) {
  const idx = STATUS_CYCLE.indexOf(task.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await window.api.researchTasks.update(task.id, { status: next });
  task.status = next;
}

async function saveEdit(id: string) {
  await window.api.researchTasks.update(id, {
    task: editForm.task,
    notes: editForm.notes,
    result: editForm.result,
    status: editForm.status,
    priority: editForm.priority,
    person_id: editForm.person_id || undefined,
  });
  expandedId.value = null;
  await load();
}

async function deleteTask(id: string) {
  if (!confirm('Ta bort denna uppgift?')) return;
  await window.api.researchTasks.delete(id);
  await load();
}

async function createTask() {
  if (!addForm.task.trim()) return;
  await window.api.researchTasks.create({
    task: addForm.task,
    notes: addForm.notes || undefined,
    person_id: addForm.person_id || undefined,
    priority: addForm.priority,
    status: addForm.status,
  });
  addForm.task = '';
  addForm.person_id = null;
  addForm.priority = 1;
  addForm.status = 'open';
  addForm.notes = '';
  showAddModal.value = false;
  await load();
}

onMounted(load);
</script>

<style scoped>
/* Unique to ResearchTasksView */
.priority-badge {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  text-align: center;
  line-height: 24px;
  font-size: 12px;
  font-weight: 700;
  color: white;
}
.priority-0 { background: #9ca3af; }
.priority-1 { background: #60a5fa; }
.priority-2 { background: #f59e0b; }
.priority-3 { background: #ef4444; }

.status-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}
.status-chip:hover { opacity: 0.8; }
.status-open { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #fef3c7; color: #92400e; }
.status-done { background: #d1fae5; color: #065f46; }
.status-stopped { background: #f3f4f6; color: #6b7280; }

.task-text {
  max-width: 380px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.person-edit-row { display: flex; align-items: center; gap: 8px; }
.person-edit-row > :first-child { flex: 1; }
.person-link-btn { white-space: nowrap; font-size: 13px; }
.actions-cell { text-align: right; white-space: nowrap; }

.expanded-row td { background: #f8fafc; padding: 0; }
.expanded-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.expanded-content label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #374151;
}
.expanded-content input,
.expanded-content textarea,
.expanded-content select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}
.expanded-row-inline { display: flex; gap: 16px; }
.expanded-row-inline label { flex: 1; }
.expanded-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
