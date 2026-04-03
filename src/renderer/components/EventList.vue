<template>
  <div class="event-list">
    <div class="section-header">
      <h4>{{ $t('events.title') }}</h4>
      <button type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
    </div>
    <div v-if="events.length === 0" class="empty-hint">{{ $t('events.noEvents') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.type') }}</th>
          <th>{{ $t('events.date') }}</th>
          <th>{{ $t('events.description') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.id" class="clickable-row" @click="editEvent(event)">
          <td>
            <span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span>
            <span
              v-if="citationCounts[event.id] > 0"
              class="source-count-badge"
            >{{ citationCounts[event.id] }} {{ $t('events.sources', citationCounts[event.id]) }}</span>
            <span v-else class="unsourced-badge">{{ $t('events.unsourced') }}</span>
          </td>
          <td>{{ formatDate(event) }}</td>
          <td>{{ event.description }}</td>
          <td class="actions-cell">
            <button type="button" class="btn-sm btn-cite" @click.stop="openCiteForm(event.id)">{{ $t('events.citeSources') }}</button>
            <button type="button" class="btn-sm btn-delete" @click.stop="removeEvent(event.id)">{{ $t('common.delete') }}</button>
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

    <CitationForm
      v-if="citingEventId"
      :event-id="citingEventId"
      @close="closeCiteForm"
      @saved="onCiteSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import EventForm from './EventForm.vue';
import CitationForm from './CitationForm.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface EventRow {
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
  relationshipId?: string;
}>();

const { t } = useI18n();
const events = ref<EventRow[]>([]);
const citationCounts = ref<Record<string, number>>({});
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);
const citingEventId = ref<string | null>(null);

async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    }
    await loadCitationCounts();
  } catch (err) {
    console.error('[EventList] load failed:', err);
  }
}

async function loadCitationCounts() {
  const counts: Record<string, number> = {};
  await Promise.all(
    events.value.map(async (ev) => {
      const cits = (await window.api.citations.forEvent(ev.id)) as unknown[];
      counts[ev.id] = cits.length;
    }),
  );
  citationCounts.value = counts;
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

function openCiteForm(eventId: string) {
  citingEventId.value = eventId;
}

function closeCiteForm() {
  citingEventId.value = null;
}

function onCiteSaved() {
  closeCiteForm();
  loadCitationCounts();
}

onMounted(load);

defineExpose({ reload: load });
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
  font-size: 15px;
}
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.empty-hint {
  color: #999;
  font-size: 13px;
  padding: 12px 0;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th,
.data-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eee;
  text-align: left;
}
.data-table th {
  background: #f8f8f8;
  font-weight: 600;
  font-size: 12px;
  color: #666;
}
.event-badge {
  background: #eef2ff;
  color: #3b5bdb;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover td {
  background: #f5f5f5;
}
.actions-cell {
  white-space: nowrap;
}
.btn-sm {
  padding: 2px 8px;
  font-size: 12px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  margin-right: 4px;
}
.btn-delete {
  background: #fee;
  color: #c0392b;
}
.source-count-badge {
  background: #dcfce7;
  color: #166534;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 6px;
}
.unsourced-badge {
  background: #fef9c3;
  color: #854d0e;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 6px;
}
.btn-cite {
  background: #eff6ff;
  color: #1d4ed8;
}
</style>
