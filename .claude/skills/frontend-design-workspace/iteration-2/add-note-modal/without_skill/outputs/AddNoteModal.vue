<template>
  <BaseModal @close="$emit('close')">
    <h3>{{ $t('personDetail.addNoteTitle') }}</h3>
    <form @submit.prevent="save">
      <label>
        {{ $t('common.notes') }}
        <textarea
          v-model="notesText"
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

const props = defineProps<{
  personId: string;
  currentNotes?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const notesText = ref(props.currentNotes ?? '');

async function save() {
  await window.api.persons.update(props.personId, { notes: notesText.value });
  emit('saved');
  emit('close');
}
</script>
