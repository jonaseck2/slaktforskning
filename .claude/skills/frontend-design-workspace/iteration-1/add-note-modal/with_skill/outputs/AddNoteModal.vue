<!-- src/renderer/components/AddNoteModal.vue -->
<template>
  <BaseModal @close="$emit('close')">
    <h3>{{ $t('personDetail.addNote') }}</h3>
    <form @submit.prevent="handleSubmit">
      <label>
        {{ $t('common.notes') }}
        <textarea
          v-model="noteText"
          rows="5"
          :placeholder="$t('personDetail.notesPlaceholder')"
          autofocus
        />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="$emit('close')">
          {{ $t('common.cancel') }}
        </button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import BaseModal from './BaseModal.vue';

const props = defineProps<{
  personId: string;
  initialNotes?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [notes: string];
}>();

const { t } = useI18n();
const toast = useToast();

const noteText = ref(props.initialNotes ?? '');

async function handleSubmit() {
  try {
    await window.api.persons.update(props.personId, { notes: noteText.value });
    emit('saved', noteText.value);
    emit('close');
  } catch (err) {
    console.error('[AddNoteModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>
