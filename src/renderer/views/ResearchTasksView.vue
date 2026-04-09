<template>
  <div class="research-tasks">
    <div class="header">
      <h2>{{ $t('researchTasks.title') }}</h2>
      <button class="btn-add" @click="showAddModal = true">{{ $t('researchTasks.addTask') }}</button>
    </div>

    <h1 class="sr-page-title" tabindex="-1">{{ $t('researchTasks.title') }}</h1>

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
    <ResearchTasksTable v-else :tasks="filteredTasks" :show-person="true" @updated="load" />

    <!-- Add Task Modal -->
    <BaseModal v-if="showAddModal" @close="showAddModal = false" title-id="modal-title-add-research-task">
        <h3 id="modal-title-add-research-task">{{ $t('researchTasks.addTask') }}</h3>
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
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import PersonPicker from '../components/PersonPicker.vue';
import ResearchTasksTable from '../components/ResearchTasksTable.vue';

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
const showAddModal = ref(false);

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

