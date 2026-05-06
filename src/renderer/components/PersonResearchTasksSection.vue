<template>
  <div>
    <SectionEmpty v-if="tasks.length === 0" :message="$t('empty.researchTasks')" />
    <ResearchTasksTable
      v-else
      :tasks="tasks"
      :readonly="props.readonly"
      @updated="reload"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import { useEntityData } from '../composables/useEntityData';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface ResearchTaskRow {
  id: string;
  task: string;
  notes?: string | null;
  result?: string | null;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
  priority: number;
  created_at: string;
  updated_at: string;
}

const props = withDefaults(defineProps<{
  personId: string;
  readonly?: boolean;
}>(), { readonly: false });

const emit = defineEmits<{
  /** Row click — parent decides whether to open the edit modal here or
   * route to the ResearchTasksView. */
  select: [task: ResearchTaskRow];
  /** Internal data changed (status cycle, delete). Parent may reload its
   * own count caches. */
  updated: [];
}>();

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<ResearchTaskRow[]>(idRef, async (id) => {
  return (await window.api.researchTasks.forPerson(id)) as ResearchTaskRow[];
});

const tasks = computed(() => data.value ?? []);
const count = computed(() => tasks.value.length);

function onSelect(id: string) {
  const task = tasks.value.find(t => t.id === id);
  if (task) emit('select', task);
}

defineExpose({
  /** Surface contract: the parent's `+ Task` CTA may need to know how
   * many tasks exist for the count badge. */
  count,
  reload,
});
</script>
