<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ $t('citations.addTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('citations.source') }}
          <select v-model="form.source_id" required>
            <option value="" disabled>{{ $t('citations.selectSource') }}</option>
            <option v-for="src in sources" :key="src.id" :value="src.id">{{ src.title }}</option>
          </select>
        </label>

        <label>
          {{ $t('citations.pageLocation') }}
          <input v-model="form.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
        </label>

        <label>
          {{ $t('citations.confidence') }}
          <select v-model.number="form.confidence">
            <option v-for="val in CONFIDENCE_LEVEL_VALUES" :key="val" :value="val">
              {{ val }} — {{ $t('confidenceLevels.' + val) }}
            </option>
          </select>
        </label>

        <label>
          {{ $t('citations.transcription') }}
          <textarea v-model="form.transcription" rows="3" :placeholder="$t('citations.transcriptionPlaceholder')" />
        </label>

        <label>
          {{ $t('citations.notes') }}
          <textarea v-model="form.notes" rows="2" :placeholder="$t('citations.notesPlaceholder')" />
        </label>

        <label>
          {{ $t('citations.dateAccessed') }}
          <input v-model="form.date_accessed" type="date" />
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit">{{ $t('citations.addTitle') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface SourceRow {
  id: string;
  title: string;
}

const props = defineProps<{
  sourceId?: string;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

useI18n();
const sources = ref<SourceRow[]>([]);

const form = reactive({
  source_id: props.sourceId ?? '',
  page: '',
  confidence: 0,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

onMounted(async () => {
  if (!window.api) return;
  sources.value = (await window.api.sources.list()) as SourceRow[];
});

async function save() {
  if (!window.api || !form.source_id) return;
  try {
    const data: Record<string, unknown> = {
      source_id: form.source_id,
      page: form.page,
      confidence: form.confidence,
      transcription: form.transcription,
      notes: form.notes,
      date_accessed: form.date_accessed,
    };
    if (props.eventId) data.event_id = props.eventId;
    if (props.personId) data.person_id = props.personId;
    if (props.relationshipId) data.relationship_id = props.relationshipId;

    await window.api.citations.create(data);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[CitationForm] save failed:', err);
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
select,
input[type='text'],
input[type='date'],
textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
textarea {
  resize: vertical;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
}
</style>
