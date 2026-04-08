<template>
  <div class="event-list">
    <div v-if="!props.hideHeader" class="section-header">
      <h4>{{ $t('events.title') }}</h4>
      <button v-if="!props.readonly" type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
    </div>
    <div v-if="events.length === 0" class="empty-hint">{{ $t('events.noEvents') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.type') }}</th>
          <th class="th-date">{{ $t('events.date') }}</th>
          <th>{{ $t('events.description') }}</th>
          <th v-if="!props.readonly" class="th-actions">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="event in events"
          :key="event.id"
          :class="['clickable-row', { 'non-interactive': props.readonly }]"
          @click="!props.readonly && editEvent(event)"
        >
          <td><span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span></td>
          <td class="td-date">{{ formatDate(event) }}</td>
          <td>{{ event.description }}<span v-if="event.cause" class="event-cause"> ({{ $t('events.cause') }}: {{ event.cause }})</span></td>
          <td v-if="!props.readonly" class="actions-cell">
            <button type="button" class="btn-sm btn-delete" @click.stop="removeEvent(event.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <EventForm
      v-if="showForm"
      :person-id="personId"
      :relationship-id="relationshipId"
      :editing-event="editingEvent"
      @close="closeForm"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import EventForm from './EventForm.vue';
import { useToast } from '../composables/useToast';

interface EventRow {
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

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  readonly?: boolean;
  hideHeader?: boolean;
}>();

const { t } = useI18n();
const toast = useToast();
const events = ref<EventRow[]>([]);
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);

async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    }
  } catch (err) {
    console.error('[EventList] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

function formatDate(event: EventRow): string {
  if (event.date_original) return event.date_original;
  if (!event.date_value) return '';
  const prefix =
    event.date_type === 'about'
      ? t('datePrefix.about')
      : event.date_type === 'before'
        ? t('datePrefix.before')
        : event.date_type === 'after'
          ? t('datePrefix.after')
          : '';
  if (event.date_type === 'between' && event.date_value_end) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

function editEvent(event: EventRow) {
  editingEvent.value = event;
  showForm.value = true;
}

async function removeEvent(id: string) {
  if (!window.api) return;
  if (!confirm(t('events.confirmDelete'))) return;
  try {
    await window.api.events.delete(id);
    await load();
  } catch (err) {
    console.error('[EventList] removeEvent failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function onSaved() {
  closeForm();
  load();
}

onMounted(load);

function openAddForm() {
  editingEvent.value = null;
  showForm.value = true;
}

defineExpose({ reload: load, openAddForm });
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.section-header h4 {
  margin: 0;
  font-size: var(--font-md);
}
.event-badge {
  background: var(--color-event-badge-bg);
  color: var(--color-event-badge-text);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.th-date,
.td-date {
  white-space: nowrap;
}
.actions-cell {
  vertical-align: middle;
}
tr.non-interactive { cursor: default; }
tr.non-interactive:hover td { background: transparent; }
.event-cause {
  color: var(--color-text-subtle);
  font-style: italic;
  font-size: var(--font-xs);
}
</style>
