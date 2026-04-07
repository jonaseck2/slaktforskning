<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ editingEvent ? $t('events.editEvent') : $t('events.addEventTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('events.eventType') }}
          <select v-model="form.event_type" required>
            <option value="" disabled>{{ $t('events.selectType') }}</option>
            <option v-for="et in eventTypeValues" :key="et" :value="et">{{ $t('eventTypes.' + et) }}</option>
          </select>
        </label>

        <label>{{ $t('events.date') }}</label>
        <DateInput
          v-model:dateType="form.date_type"
          v-model:dateValue="form.date_value"
          v-model:dateValueEnd="form.date_value_end"
          v-model:dateOriginal="form.date_original"
        />

        <label>
          {{ $t('events.place') }}
          <PlacePicker v-model="form.place_id" :placeholder="$t('events.placePlaceholder')" />
        </label>

        <label>
          {{ $t('events.description') }}
          <textarea v-model="form.description" rows="2" :placeholder="$t('events.descriptionPlaceholder')" />
        </label>

        <label v-if="CAUSE_APPLICABLE_TYPES.includes(form.event_type)">
          {{ $t('events.cause') }}
          <input v-model="form.cause" type="text" :placeholder="$t('events.causePlaceholder')" />
        </label>

        <!-- Citations section when editing -->
        <div v-if="editingEvent" class="citations-section">
          <div class="citations-label">{{ $t('citations.title') }}</div>
          <div v-if="existingCitations.length === 0" class="citations-empty">{{ $t('citations.none') }}</div>
          <div v-for="cit in existingCitations" :key="cit.id" class="citation-row">
            <span class="citation-source">{{ cit.sourceTitle }}</span>
            <span v-if="cit.page" class="citation-page">{{ cit.page }}</span>
            <button type="button" class="btn-sm btn-delete" @click="deleteCitation(cit.id)">✕</button>
          </div>
        </div>

        <!-- Source toggle — for both create and edit -->
        <div class="source-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="addSource" />
            {{ $t('events.addSourceOptional') }}
          </label>
        </div>
        <template v-if="addSource">
          <label>
            {{ $t('citations.source') }}
            <select v-model="sourceForm.source_id">
              <option value="" disabled>{{ $t('citations.selectSource') }}</option>
              <option v-for="src in sources" :key="src.id" :value="src.id">{{ src.title }}</option>
            </select>
          </label>
          <label>
            {{ $t('citations.pageLocation') }}
            <input v-model="sourceForm.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
          </label>
        </template>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit">{{ editingEvent ? $t('common.save') : $t('events.addEventTitle') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DateInput from './DateInput.vue';
import PlacePicker from './PlacePicker.vue';
import { PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES } from '../constants/eventTypes';
import type { EventTypeValue } from '../constants/eventTypes';

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death', 'birth', 'emigration', 'probate', 'will', 'other'];

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

interface SourceRow {
  id: string;
  title: string;
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
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

useI18n();

const eventTypeValues = props.relationshipId ? RELATIONSHIP_EVENT_TYPE_VALUES : PERSON_EVENT_TYPE_VALUES;

const form = reactive({
  event_type: props.editingEvent?.event_type ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_id: (props.editingEvent?.place_id ?? null) as string | null,
  description: props.editingEvent?.description ?? '',
  cause: props.editingEvent?.cause ?? '',
});

const addSource = ref(false);
const sources = ref<SourceRow[]>([]);
const sourceForm = reactive({ source_id: '', page: '' });
const existingCitations = ref<CitationRow[]>([]);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  if (!window.api) return;
  sources.value = (await window.api.sources.list()) as SourceRow[];
  if (props.editingEvent) {
    await loadCitations();
  }
});
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

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
  await window.api.citations.delete(id);
  await loadCitations();
}

async function save() {
  if (!window.api) return;
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

    if (addSource.value && sourceForm.source_id && eventId) {
      const citData: Record<string, unknown> = {
        source_id: sourceForm.source_id,
        page: sourceForm.page,
        confidence: 2,
        event_id: eventId,
      };
      if (props.personId) citData.person_id = props.personId;
      await window.api.citations.create(citData);
    }

    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[EventForm] save failed:', err);
  }
}
</script>

<style scoped>
.source-toggle {
  border-top: 1px solid #eee;
  padding-top: 8px;
}
.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.citations-section {
  border-top: 1px solid #eee;
  padding-top: 8px;
  margin-bottom: 4px;
}
.citations-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.citations-empty {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 4px;
}
.citation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}
.citation-source {
  flex: 1;
  font-weight: 500;
  color: #333;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.citation-page {
  color: #666;
  flex-shrink: 0;
}
</style>
