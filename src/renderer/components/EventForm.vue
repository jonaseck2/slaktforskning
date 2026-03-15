<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ editingEvent ? 'Edit Event' : 'Add Event' }}</h3>
      <form @submit.prevent="save">
        <label>
          Event Type
          <select v-model="form.event_type" required>
            <option value="" disabled>Select type...</option>
            <option v-for="et in eventTypes" :key="et.value" :value="et.value">{{ et.label }}</option>
          </select>
        </label>

        <label>Date</label>
        <DateInput
          v-model:dateType="form.date_type"
          v-model:dateValue="form.date_value"
          v-model:dateValueEnd="form.date_value_end"
          v-model:dateOriginal="form.date_original"
        />

        <label>
          Place
          <input v-model="form.place_name" type="text" placeholder="e.g. Stockholm, Sweden" />
        </label>

        <label>
          Description
          <textarea v-model="form.description" rows="2" placeholder="Optional details..." />
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">Cancel</button>
          <button type="submit">{{ editingEvent ? 'Save' : 'Add Event' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import DateInput from './DateInput.vue';
import { PERSON_EVENT_TYPES, FAMILY_EVENT_TYPES } from '../constants/eventTypes';

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
}

const props = defineProps<{
  personId?: string;
  familyId?: string;
  editingEvent?: EventData | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const eventTypes = props.familyId ? FAMILY_EVENT_TYPES : PERSON_EVENT_TYPES;

const form = reactive({
  event_type: props.editingEvent?.event_type ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_name: '',
  description: props.editingEvent?.description ?? '',
});

async function save() {
  if (!window.api) return;
  try {
    const data: Record<string, unknown> = {
      event_type: form.event_type,
      date_type: form.date_type,
      date_value: form.date_value || null,
      date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
      date_original: form.date_original,
      description: form.description,
    };

    if (props.personId) data.person_id = props.personId;
    if (props.familyId) data.family_id = props.familyId;

    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
    } else {
      await window.api.events.create(data);
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
</style>
