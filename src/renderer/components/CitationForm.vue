<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-citation">
      <h3 id="modal-title-citation">{{ $t('citations.addTitle') }}</h3>
      <form @submit.prevent="save">
        <CitationFields :model="form" />

        <div class="modal-actions">
          <AppButton variant="secondary" @click="$emit('close')">{{ $t('common.cancel') }}</AppButton>
          <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import CitationFields from './CitationFields.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';

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
const sourceSession = useSourceSession();

const form = reactive<CitationFieldsModel>({
  source_id: props.sourceId ?? null,
  page: '',
  confidence: 0,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

onMounted(() => {
  if (!props.sourceId && sourceSession.lastSourceId) {
    form.source_id = sourceSession.lastSourceId;
  }
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
    sourceSession.setLastUsed(form.source_id, form.page);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[CitationForm] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>
