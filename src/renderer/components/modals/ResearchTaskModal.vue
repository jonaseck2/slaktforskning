<template>
  <BaseSubPanel
    entity-type="task"
    :title="displayTitle"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <!-- Task -->
      <div class="ep-field">
        <label class="ep-field-label" for="researchtask-field-1">{{ $t('researchTasks.task') }} *</label>
        <textarea id="researchtask-field-1"
          ref="taskRef"
          class="ep-textarea"
          v-model="form.task"
          rows="3"
          autofocus
        />
      </div>

      <!-- Priority segmented -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('researchTasks.priority') }}</span>
        <div class="ep-seg">
          <button
            v-for="opt in PRIORITY_OPTIONS"
            :key="opt.value"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.priority === opt.value }"
            @click="form.priority = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- Status segmented -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('researchTasks.status') }}</span>
        <div class="ep-seg">
          <button
            v-for="s in RESEARCH_TASK_STATUS_VALUES"
            :key="s"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.status === s }"
            @click="form.status = s"
          >{{ $t('researchTasks.statuses.' + s) }}</button>
        </div>
      </div>

      <!-- Notes -->
      <div class="ep-field">
        <label class="ep-field-label" for="researchtask-field-2">{{ $t('researchTasks.notes') }}</label>
        <textarea id="researchtask-field-2"
          class="ep-textarea"
          v-model="form.notes"
          rows="2"
        />
      </div>

      <!-- Result (only when done/stopped) -->
      <div v-if="form.status === 'done' || form.status === 'stopped'" class="ep-field">
        <label class="ep-field-label" for="researchtask-field-3">{{ $t('researchTasks.result') }}</label>
        <textarea id="researchtask-field-3"
          class="ep-textarea"
          v-model="form.result"
          rows="2"
        />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseSubPanel from './BaseSubPanel.vue';
import { RESEARCH_TASK_STATUS_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface ResearchTask {
  id: string;
  task: string;
  notes?: string | null;
  result?: string | null;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string;
  placeId?: string;
  editingTask?: ResearchTask | null;
}>(), {
  mode: 'standalone',
  personId: undefined,
  placeId: undefined,
  editingTask: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [task: ResearchTask];
}>();

const { t } = useI18n();
const toast = useToast();

const taskRef = ref<HTMLTextAreaElement | null>(null);

const PRIORITY_OPTIONS = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

const form = reactive({
  task: props.editingTask?.task ?? '',
  priority: props.editingTask?.priority ?? 1,
  status: (props.editingTask?.status ?? 'open') as 'open' | 'in_progress' | 'done' | 'stopped',
  notes: props.editingTask?.notes ?? '',
  result: props.editingTask?.result ?? '',
});

const personName = ref('');

const displayTitle = computed(() => {
  if (form.task.trim()) return form.task.trim();
  const base = props.editingTask ? t('researchTasks.editTask') : t('researchTasks.newTask');
  return personName.value ? t('researchTasks.titleFor', { title: base, name: personName.value }) : base;
});

async function loadPersonName() {
  if (!props.personId || !window.api) return;
  try {
    const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    if (primary) personName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
  } catch { /* ignore */ }
}

async function handleSave() {
  if (!form.task.trim()) return;
  try {
    const payload = {
      task: form.task.trim(),
      status: form.status,
      priority: form.priority,
      notes: form.notes.trim(),
      result: (form.status === 'done' || form.status === 'stopped') ? form.result.trim() : '',
    };
    let saved: ResearchTask;
    if (props.editingTask) {
      saved = (await window.api.researchTasks.update(props.editingTask.id, payload)) as ResearchTask;
    } else {
      saved = (await window.api.researchTasks.create(payload)) as ResearchTask;
      // When opened from a person's panel, link the new task to that person.
      if (saved && props.personId) {
        await window.api.researchTasks.addLink(saved.id, 'person', props.personId);
      }
      if (saved && props.placeId) {
        await window.api.researchTasks.addLink(saved.id, 'place', props.placeId);
      }
    }
    emit('saved', saved);
    emit('close');
  } catch (err) {
    console.error('[ResearchTaskModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  await loadPersonName();
  await nextTick();
  taskRef.value?.focus();
});
</script>
