<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-citation">
      <h3 id="modal-title-citation">{{ $t('citations.addTitle') }}</h3>
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
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';

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

const { t } = useI18n();
const toast = useToast();
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
    if (props.placeId) data.place_id = props.placeId;

    await window.api.citations.create(data);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[CitationForm] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>

<style scoped>
</style>
