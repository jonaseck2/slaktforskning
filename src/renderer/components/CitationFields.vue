<template>
  <div class="citation-fields">
    <label>
      {{ $t('citations.source') }}
      <SourcePicker v-model="model.source_id" @create-new="createSourceInline" />
    </label>
    <label>
      {{ $t('citations.pageLocation') }}
      <input
        v-model="model.page"
        type="text"
        :placeholder="$t('citations.pagePlaceholder')"
      />
    </label>
    <label>
      {{ $t('citations.confidence') }}
      <select v-model.number="model.confidence">
        <option v-for="val in CONFIDENCE_LEVEL_VALUES" :key="val" :value="val">
          {{ val }} — {{ $t('confidenceLevels.' + val) }}
        </option>
      </select>
    </label>
    <label>
      {{ $t('citations.transcription') }}
      <textarea
        ref="transRef"
        v-model="model.transcription"
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
        v-model="model.notes"
        rows="2"
        :placeholder="$t('citations.notesPlaceholder')"
        :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
        @mouseup="persistNotesHeight"
      />
    </label>
    <label>
      {{ $t('citations.dateAccessed') }}
      <SimpleDateInput v-model="model.date_accessed" />
    </label>
  </div>
</template>

<script setup lang="ts">
import SourcePicker from './SourcePicker.vue';
import SimpleDateInput from './SimpleDateInput.vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';
import { useTextareaHeight } from '../composables/useTextareaHeight';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

export interface CitationFieldsModel {
  source_id: string | null;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
}

const props = defineProps<{
  model: CitationFieldsModel;
  storageKeyPrefix?: string;
}>();

const { textareaRef: transRef, storedHeight: transStoredHeight, persistHeight: persistTransHeight } = useTextareaHeight('citation-fields-transcription');
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('citation-fields-notes');

async function createSourceInline(title: string) {
  const source = (await window.api.sources.create({ title })) as { id: string };
  props.model.source_id = source.id;
}
</script>

<style scoped>
.citation-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.citation-fields > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
