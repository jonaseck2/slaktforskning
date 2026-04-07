<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ $t('citations.editTitle') }}</h3>
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
          <button type="submit">{{ $t('common.save') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';

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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-width: 95vw;
}
.modal h3 {
  margin: 0 0 16px;
  font-size: 16px;
}
.modal label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 12px;
}
.modal input, .modal select, .modal textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.modal textarea { resize: vertical; }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn-cancel {
  background: none;
  border: 1px solid #ccc;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
button[type="submit"] {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
