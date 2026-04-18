<template>
  <div class="event-list">
    <div v-if="!props.hideHeader" class="section-header">
      <h4>{{ $t('events.title') }} <span v-if="events.length" class="section-count">({{ events.length }})</span></h4>
      <AppButton v-if="!props.readonly" variant="soft" size="sm" @click="showForm = true">+ {{ $t('events.addEvent') }}</AppButton>
    </div>
    <div v-if="events.length === 0" class="empty-hint">{{ $t('events.noEvents') }}</div>
    <table v-else class="data-table events-table">
      <thead v-if="props.showPersons">
        <tr>
          <th v-if="props.showPersons">{{ $t('persons.title') }}</th>
          <th>{{ $t('common.type') }}</th>
          <th class="th-date">{{ $t('events.date') }}</th>
          <th>{{ $t('places.title') }}</th>
          <th>{{ $t('events.description') }}</th>
          <th v-if="!props.readonly">{{ $t('events.citeSources') }}</th>
          <th v-if="!props.readonly" class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="event in events"
          :key="event.id"
          :class="['clickable-row', { 'non-interactive': props.readonly }]"
          :tabindex="props.readonly ? undefined : 0"
          :role="props.readonly ? undefined : 'button'"
          :aria-label="props.readonly ? undefined : $t('a11y.editItem', { item: $t('eventTypes.' + event.event_type) })"
          @click="!props.readonly && editEvent(event)"
          @keydown.enter="!props.readonly && editEvent(event)"
          @keydown.space.prevent="!props.readonly && editEvent(event)"
        >
          <td v-if="props.showPersons" class="td-persons">{{ event.participant_names || '—' }}</td>
          <td><span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span></td>
          <td class="td-date">{{ formatDate(event) }}</td>
          <td class="td-place">
            <router-link v-if="event.place_id" :to="'/places/' + event.place_id" class="person-link" @click.stop>{{ event.place_name || '—' }}</router-link>
          </td>
          <td>{{ event.description }}<span v-if="event.cause" class="event-cause"> ({{ $t('events.cause') }}: {{ event.cause }})</span></td>
          <td v-if="!props.readonly" class="cite-cell">
            <span v-if="event.citation_count" class="cite-badge">
              {{ event.citation_count }}
            </span>
            <button class="btn-sm btn-cite"
              @click.stop="openCiteModal(event)"
              :title="$t('events.addCitation')">
              {{ $t('events.cite') }}
            </button>
          </td>
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
      :default-event-type="defaultEventType"
      @close="closeForm"
      @saved="onSaved"
    />

    <CitationForm
      v-if="citingEventId"
      :event-id="citingEventId"
      @close="citingEventId = null"
      @saved="onCitationSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import EventForm from './EventForm.vue';
import CitationForm from './CitationForm.vue';
import { useToast } from '../composables/useToast';

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  description: string;
  cause: string | null;
  citation_count: number;
  participant_names?: string;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  placeId?: string;
  readonly?: boolean;
  hideHeader?: boolean;
  showPersons?: boolean;
}>();

const { t } = useI18n();
const toast = useToast();
const events = ref<EventRow[]>([]);
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);
const citingEventId = ref<string | null>(null);

function openCiteModal(event: { id: string }) {
  citingEventId.value = event.id;
}

async function onCitationSaved() {
  citingEventId.value = null;
  await load();
}

async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    } else if (props.placeId) {
      events.value = (await window.api.events.forPlace(props.placeId)) as EventRow[];
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

watch(
  () => props.personId ?? props.relationshipId ?? props.placeId,
  () => load(),
  { immediate: true }
);

const defaultEventType = ref('');

function openAddForm(eventType?: string) {
  editingEvent.value = null;
  defaultEventType.value = eventType || '';
  showForm.value = true;
}

defineExpose({ reload: load, openAddForm, count: computed(() => events.value.length) });
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
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
}
.section-count {
  font-weight: var(--font-weight-normal);
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.event-badge {
  background: var(--surface-hover);
  color: var(--text-secondary);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}
.td-persons {
  font-size: var(--font-xs);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.th-date,
.td-date {
  white-space: nowrap;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
tr.non-interactive { cursor: default; }
tr.non-interactive:hover td { background: transparent; }
.event-cause {
  color: var(--color-text-subtle);
  font-style: italic;
  font-size: var(--font-xs);
}
.cite-cell {
  white-space: nowrap;
}
.cite-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 0 4px;
  margin-right: 4px;
}
.btn-cite {
  font-size: var(--font-xs);
  padding: 2px 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-bg-subtle, #f8fafc);
  border-radius: 4px;
  cursor: pointer;
}
.btn-cite:hover {
  background: var(--color-bg-hover, #f1f5f9);
}
</style>
