<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-event">
      <h3 id="modal-title-event">{{ editingEvent ? $t('events.editEvent') : $t('events.addEventTitle') }}</h3>
      <form @submit.prevent="save">
        <EventFormBody
          v-model:event="form"
          v-model:citation="citationForm"
          :context="relationshipId ? 'relationship' : 'person'"
        />

        <!-- Citations section when editing -->
        <div v-if="editingEvent" class="citations-section">
          <div class="citations-label">{{ $t('citations.title') }}</div>
          <div v-if="existingCitations.length === 0" class="citations-empty">{{ $t('empty.citations') }}</div>
          <div v-for="cit in existingCitations" :key="cit.id" class="citation-row">
            <span class="citation-source">{{ cit.sourceTitle }}</span>
            <span v-if="cit.page" class="citation-page">{{ cit.page }}</span>
            <AppButton variant="ghost" size="sm" @click="deleteCitation(cit.id)">✕</AppButton>
          </div>
        </div>

        <div class="modal-actions">
          <span v-if="addedCount > 0" class="added-badge">
            {{ $t('events.eventsAdded', addedCount) }}
          </span>
          <AppButton variant="secondary" @click="$emit('close')">
            {{ $t('common.cancel') }}
          </AppButton>
          <AppButton v-if="!editing" variant="secondary" @click="saveAndAnother">
            {{ $t('events.saveAndAnother') }}
          </AppButton>
          <AppButton variant="primary" type="submit">
            {{ editing ? $t('common.save') : $t('events.addEvent') }}
          </AppButton>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import EventFormBody from './EventFormBody.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
import type { EventTypeValue } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death'];

interface EventData {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  description: string;
  cause: string | null;
}

interface CitationRow {
  id: string;
  source_id: string;
  sourceTitle: string;
  page: string | null;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const editing = computed(() => !!props.editingEvent);
const addedCount = ref(0);

const form = reactive({
  event_type: props.editingEvent?.event_type ?? props.defaultEventType ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_id: (props.editingEvent?.place_id ?? null) as string | null,
  description: props.editingEvent?.description ?? '',
  cause: props.editingEvent?.cause ?? '',
});

const citationForm = reactive<CitationFieldsModel>({
  source_id: null,
  page: '',
  confidence: 0,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});
const existingCitations = ref<CitationRow[]>([]);

onMounted(async () => {
  if (!window.api) return;
  if (sourceSession.lastSourceId) {
    citationForm.source_id = sourceSession.lastSourceId;
    if (sourceSession.lastPage) citationForm.page = sourceSession.lastPage;
  }
  if (props.editingEvent) {
    await loadCitations();
  }
});

async function loadCitations() {
  if (!props.editingEvent || !window.api) return;
  const raw = (await window.api.citations.forEvent(props.editingEvent.id)) as Array<{
    id: string; source_id: string; page: string | null;
  }>;
  existingCitations.value = await Promise.all(
    raw.map(async (c) => {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      return { id: c.id, source_id: c.source_id, sourceTitle: src?.title ?? c.source_id, page: c.page };
    }),
  );
}

async function deleteCitation(id: string) {
  if (!window.api) return;
  try {
    await window.api.citations.delete(id);
    await loadCitations();
  } catch (err) {
    console.error('[EventForm] deleteCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

async function doSave(): Promise<boolean> {
  if (!window.api) return false;
  try {
    const data: Record<string, unknown> = {
      event_type: form.event_type,
      date_type: form.date_type,
      date_value: form.date_value || null,
      date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
      date_original: form.date_original,
      place_id: form.place_id || null,
      description: form.description,
      cause: CAUSE_APPLICABLE_TYPES.includes(form.event_type as EventTypeValue) ? (form.cause || null) : null,
    };

    if (props.relationshipId) data.relationship_id = props.relationshipId;

    let eventId: string;
    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
      eventId = props.editingEvent.id;
    } else {
      const event = (await window.api.events.create(data)) as { id: string };
      eventId = event.id;
      if (props.personId && eventId) {
        await window.api.eventParticipants.add({
          event_id: eventId,
          person_id: props.personId,
          role: 'primary',
        });
      }
    }

    if (citationForm.source_id && eventId) {
      const citData: Record<string, unknown> = {
        source_id: citationForm.source_id,
        page: citationForm.page,
        confidence: citationForm.confidence,
        transcription: citationForm.transcription,
        notes: citationForm.notes,
        date_accessed: citationForm.date_accessed,
        event_id: eventId,
      };
      if (props.personId) citData.person_id = props.personId;
      await window.api.citations.create(citData);
      sourceSession.setLastUsed(citationForm.source_id, citationForm.page);
    }

    return true;
  } catch (err) {
    console.error('[EventForm] save failed:', err);
    toast.error(t('errors.saveFailed'));
    return false;
  }
}

async function save() {
  if (await doSave()) {
    emit('saved');
    emit('close');
  }
}

async function saveAndAnother() {
  if (await doSave()) {
    emit('saved');
    // Reset event-specific fields but keep place, source, page for rapid entry
    form.event_type = '';
    form.date_type = 'exact';
    form.date_value = '';
    form.date_value_end = '';
    form.date_original = '';
    form.description = '';
    form.cause = '';
    // Keep: form.place_id, citationForm state
    existingCitations.value = [];
    addedCount.value++;
  }
}
</script>

<style scoped>
.citations-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
  margin-bottom: 4px;
}
.citations-label {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.citations-empty {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}
.citation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  margin-bottom: 4px;
}
.citation-source {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.citation-page {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.added-badge {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-right: auto;
}
</style>
