<template>
  <div class="research-tasks">
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
    <ResearchTasksTable v-else :tasks="filteredTasks" :show-person="true" @updated="load" />

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
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ResearchTaskModal from '../components/modals/ResearchTaskModal.vue';
import ResearchTasksTable from '../components/ResearchTasksTable.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';

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

async function onSaved() {
  showAddModal.value = false;
  await load();
}

onMounted(load);
</script>

