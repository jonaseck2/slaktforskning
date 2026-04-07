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
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';

interface SourceRow {
  id: string;
  title: string;
}

const props = defineProps<{
  sourceId?: string;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
  placeId?: string;
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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  if (!window.api) return;
  sources.value = (await window.api.sources.list()) as SourceRow[];
});
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

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
    if (props.placeId) data.place_id = props.placeId;

    await window.api.citations.create(data);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[CitationForm] save failed:', err);
  }
}
</script>

<style scoped>
</style>
