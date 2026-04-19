<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-research-task">
    <h3 id="modal-title-research-task">{{ $t('researchTasks.addTask') }}</h3>
    <form @submit.prevent="save">
      <label>
        {{ $t('researchTasks.task') }} *
        <textarea
          ref="taskRef"
          v-model="form.task"
          rows="3"
          required
          autofocus
          :style="taskStoredHeight ? { height: taskStoredHeight + 'px' } : undefined"
          @mouseup="persistTaskHeight"
        />
      </label>
      <label>
        {{ $t('researchTasks.status') }}
        <select v-model="form.status">
          <option v-for="s in RESEARCH_TASK_STATUS_VALUES" :key="s" :value="s">{{ $t('researchTasks.statuses.' + s) }}</option>
        </select>
      </label>
      <label>
        {{ $t('researchTasks.priority') }}
        <select v-model="form.priority">
          <option :value="0">0</option>
          <option :value="1">1</option>
          <option :value="2">2</option>
          <option :value="3">3</option>
        </select>
      </label>
      <label>
        {{ $t('researchTasks.notes') }}
        <textarea
          ref="notesRef"
          v-model="form.notes"
          rows="2"
          :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
          @mouseup="persistNotesHeight"
        />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import BaseModal from './BaseModal.vue';
import { RESEARCH_TASK_STATUS_VALUES } from '../constants/eventTypes';

const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('research-task-modal-notes');
const { textareaRef: taskRef, storedHeight: taskStoredHeight, persistHeight: persistTaskHeight } = useTextareaHeight('research-task-modal-task');

const props = defineProps<{
  personId: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();

const form = reactive({
  task: '',
  status: 'open' as string,
  priority: 1,
  notes: '',
});

async function save() {
  if (!form.task.trim()) return;
  try {
    await window.api.researchTasks.create({
      task: form.task,
      status: form.status,
      priority: form.priority,
      notes: form.notes || null,
      person_id: props.personId,
    });
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[AddResearchTaskModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>
