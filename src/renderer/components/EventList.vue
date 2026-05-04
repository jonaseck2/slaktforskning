<template>
  <div class="event-list">
    <div v-if="!props.hideHeader" class="section-header">
      <h4>{{ $t('events.title') }} <span v-if="events.length" class="section-count">({{ events.length }})</span></h4>
      <AppButton v-if="!props.readonly" variant="soft" size="sm" @click="openAddForm()">+ {{ $t('events.event') }}</AppButton>
    </div>
    <SectionEmpty v-if="events.length === 0" :message="$t('empty.events')" />
    <table v-else class="data-table events-table">
      <thead v-if="props.showPersons">
        <tr>
          <th v-if="props.showPersons">{{ $t('persons.title') }}</th>
          <th>{{ $t('common.type') }}</th>
          <th class="th-date">{{ $t('events.date') }}</th>
          <th>{{ $t('places.title') }}</th>
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
          <td v-if="props.showPersons" class="td-persons" :title="event.participant_names || ''">{{ event.participant_names || '—' }}</td>
          <td class="td-badge"><span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span></td>
          <td class="td-date">{{ formatDate(event) }}</td>
          <td class="td-place" :title="event.place_name || ''">
            <router-link v-if="event.place_id" :to="{ path: '/places', query: { place: event.place_id } }" class="person-link" @click.stop>{{ event.place_name || '—' }}</router-link>
          </td>
          <td v-if="!props.readonly" class="actions-cell">
            <button
              type="button"
              class="btn-sm btn-delete"
              :aria-label="$t('a11y.deleteItem', { item: $t('eventTypes.' + event.event_type) })"
              :title="$t('common.deleteTooltip')"
              @click.stop="removeEvent(event.id)"
            >
              <IconTrash :size="14" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <EventModal
      v-if="showForm"
      mode="standalone"
      :person-id="personId"
      :relationship-id="relationshipId"
      :default-place-id="placeId"
      :editing-event="editingEvent || undefined"
      :default-event-type="defaultEventType"
      @cancel="closeForm"
      @close="closeForm"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('events.removeConfirmTitle')"
      :message="$t('events.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import EventModal from './modals/EventModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useToast } from '../composables/useToast';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { suggestNextEventType } from '../utils/eventDefaults';
import { isSpanEventType } from '../constants/eventTypes';
import { useEntityData } from '../composables/useEntityData';

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  value: string | null;
  notes: string;
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
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);
const smartDefaultsEnabled = ref(true);

async function loadSmartDefaultsSetting() {
  if (!window.api) return;
  try {
    const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
    if (raw) {
      const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
      smartDefaultsEnabled.value = parsed.smartDefaults !== false;
    } else {
      smartDefaultsEnabled.value = true;
    }
  } catch {
    smartDefaultsEnabled.value = true;
  }
}

const idRef = computed(() => props.personId ?? props.relationshipId ?? props.placeId ?? null);
const { data: eventsData, reload } = useEntityData<EventRow[]>(idRef, async (_id) => {
  if (!window.api) return [];
  try {
    if (props.personId) {
      return (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      return (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    } else if (props.placeId) {
      return (await window.api.events.forPlace(props.placeId)) as EventRow[];
    }
    return [];
  } catch (err) {
    console.error('[EventList] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return [];
  }
});
const events = computed(() => eventsData.value ?? []);

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
  // Range when date_type=between OR when a span event has an end date set
  // (BENGT #28a — residence/education/occupation/military/travel).
  if (event.date_value_end &&
      (event.date_type === 'between' || isSpanEventType(event.event_type))) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

function editEvent(event: EventRow) {
  editingEvent.value = event;
  showForm.value = true;
}

const del = useDeleteConfirm<string>(async (id) => {
  if (!window.api) return;
  try {
    await window.api.events.delete(id);
    await reload();
  } catch (err) {
    console.error('[EventList] removeEvent failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeEvent(id: string) { del.ask(id); }

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function onSaved() {
  closeForm();
  reload();
}

// Load smart defaults once — it's a global setting that never changes between person switches.
onMounted(loadSmartDefaultsSetting);

const defaultEventType = ref('');

function openAddForm(eventType?: string) {
  editingEvent.value = null;
  if (eventType) {
    defaultEventType.value = eventType;
  } else if (props.personId) {
    const existing = events.value.map(e => e.event_type);
    defaultEventType.value = suggestNextEventType(existing, smartDefaultsEnabled.value);
  } else {
    defaultEventType.value = '';
  }
  showForm.value = true;
}

defineExpose({ reload, openAddForm, count: computed(() => events.value.length) });
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
.td-badge {
  width: 1px;
  max-width: none;
  white-space: nowrap;
}
.th-date,
.td-date {
  width: 1px;
  max-width: none;
  white-space: nowrap;
}
.td-place {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; vertical-align: middle; }
tr.non-interactive { cursor: default; }
tr.non-interactive:hover td { background: transparent; }
</style>
