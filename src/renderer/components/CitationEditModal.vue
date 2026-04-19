<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-citation-edit">
      <h3 id="modal-title-citation-edit">{{ $t('citations.editTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('citations.pageLocation') }}
          <input v-model="form.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
        </label>
        <label>
          {{ $t('citations.confidence') }}
          <select v-model.number="form.confidence">
            <option v-for="c in CONFIDENCE_LEVEL_VALUES" :key="c" :value="c">
              {{ $t('confidenceLevels.' + c) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('citations.transcription') }}
          <textarea
            ref="transRef"
            v-model="form.transcription"
            rows="3"
            :placeholder="$t('citations.transcriptionPlaceholder')"
            :style="transStoredHeight ? { height: transStoredHeight + 'px' } : undefined"
            @mouseup="persistTransHeight"
          />
        </label>
        <label>
          {{ $t('citations.notes') }}
          <textarea
            ref="notesRef"
            v-model="form.notes"
            rows="2"
            :placeholder="$t('citations.notesPlaceholder')"
            :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
            @mouseup="persistNotesHeight"
          />
        </label>
        <label>
          {{ $t('citations.dateAccessed') }}
          <input v-model="form.date_accessed" type="date" />
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
import BaseModal from './BaseModal.vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';
import { useTextareaHeight } from '../composables/useTextareaHeight';

const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('citation-edit-notes');
const { textareaRef: transRef, storedHeight: transStoredHeight, persistHeight: persistTransHeight } = useTextareaHeight('citation-edit-transcription');

const props = defineProps<{
  citation: {
    id: string;
    page: string;
    confidence: number;
    transcription: string;
    notes: string;
    date_accessed: string;
  };
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const form = reactive({
  page: props.citation.page || '',
  confidence: props.citation.confidence ?? 2,
  transcription: props.citation.transcription || '',
  notes: props.citation.notes || '',
  date_accessed: props.citation.date_accessed || '',
});

async function save() {
  await window.api.citations.update(props.citation.id, { ...form });
  emit('saved');
}

</script>

