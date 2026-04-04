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

        <!-- Optional source — only on create -->
        <div v-if="!editingEvent" class="source-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="addSource" />
            {{ $t('events.addSourceOptional') }}
          </label>
        </div>
        <template v-if="addSource && !editingEvent">
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

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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
const sourceForm = reactive({
  source_id: '',
  page: '',
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

    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
    } else {
      const event = (await window.api.events.create(data)) as { id: string };
      if (props.personId && event.id) {
        await window.api.eventParticipants.add({
          event_id: event.id,
          person_id: props.personId,
          role: 'primary',
        });
      }
      if (addSource.value && sourceForm.source_id && event.id) {
        const citData: Record<string, unknown> = {
          source_id: sourceForm.source_id,
          page: sourceForm.page,
          confidence: 2,
          event_id: event.id,
        };
        if (props.personId) citData.person_id = props.personId;
        await window.api.citations.create(citData);
      }
    }
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[EventForm] save failed:', err);
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
</style>
