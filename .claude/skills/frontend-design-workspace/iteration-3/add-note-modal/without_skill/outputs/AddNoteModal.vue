<template>
  <BaseModal @close="$emit('close')">
    <h3>{{ $t('personDetail.addNoteTitle') }}</h3>
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
        <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseModal from './BaseModal.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  currentNotes?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const noteText = ref(props.currentNotes ?? '');

async function handleSubmit() {
  await window.api.persons.update(props.personId, { notes: noteText.value });
  emit('saved');
  emit('close');
}
</script>
