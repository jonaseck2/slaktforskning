<template>
  <div class="event-list">
    <div class="section-header">
      <h4>{{ $t('events.title') }}</h4>
      <button v-if="!props.readonly" type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
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
        <template v-for="event in events" :key="event.id">
          <tr :class="['clickable-row', { 'non-interactive': props.readonly }]" @click="!props.readonly && editEvent(event)">
            <td>
              <span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span>
              <button
                type="button"
                class="badge-btn"
                @click.stop="toggleCitations(event.id)"
              >
                <CitationBadge :count="citationCounts[event.id] ?? 0" />
              </button>
            </td>
            <td>{{ formatDate(event) }}</td>
            <td>{{ event.description }}</td>
            <td class="actions-cell">
              <template v-if="!props.readonly">
                <button type="button" class="btn-sm btn-cite" @click.stop="openCiteForm(event.id)">{{ $t('events.citeSources') }}</button>
                <button type="button" class="btn-sm btn-delete" @click.stop="removeEvent(event.id)">{{ $t('common.delete') }}</button>
              </template>
            </td>
          </tr>
          <tr v-if="expandedEventId === event.id" class="citations-expansion-row">
            <td colspan="4">
              <div v-if="expandedCitations.length === 0" class="citations-empty">{{ $t('citations.none') }}</div>
              <div v-else class="citations-list">
                <div v-for="cit in expandedCitations" :key="cit.id" class="citation-item">
                  <a class="citation-source-link" @click.prevent="router.push('/sources/' + cit.source_id)">{{ cit.sourceTitle }}</a>
                  <span v-if="cit.page" class="citation-detail">{{ cit.page }}</span>
                  <span class="citation-confidence">{{ $t('confidenceLevels.' + cit.confidence) }}</span>
                  <button type="button" class="btn-sm btn-delete" @click="removeCitation(cit.id, event.id)">{{ $t('common.delete') }}</button>
                </div>
              </div>
            </td>
          </tr>
        </template>
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
import { useRouter } from 'vue-router';
import EventForm from './EventForm.vue';
import CitationForm from './CitationForm.vue';
import CitationBadge from './CitationBadge.vue';

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
  readonly?: boolean;
}>();

interface CitationDetail {
  id: string;
  source_id: string;
  sourceTitle: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
}

const { t } = useI18n();
const router = useRouter();
const events = ref<EventRow[]>([]);
const citationCounts = ref<Record<string, number>>({});
const expandedEventId = ref<string | null>(null);
const expandedCitations = ref<CitationDetail[]>([]);
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

async function loadExpandedCitations(eventId: string) {
  const rawCits = (await window.api.citations.forEvent(eventId)) as Array<{
    id: string; source_id: string; page: string; confidence: number; transcription: string; notes: string;
  }>;
  expandedCitations.value = await Promise.all(
    rawCits.map(async (c) => {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      return {
        id: c.id,
        source_id: c.source_id,
        sourceTitle: src?.title ?? c.source_id,
        page: c.page,
        confidence: c.confidence,
        transcription: c.transcription,
        notes: c.notes,
      };
    }),
  );
}

async function toggleCitations(eventId: string) {
  if (expandedEventId.value === eventId) {
    expandedEventId.value = null;
    expandedCitations.value = [];
    return;
  }
  expandedEventId.value = eventId;
  expandedCitations.value = [];
  await loadExpandedCitations(eventId);
}

async function removeCitation(citationId: string, eventId: string) {
  if (!window.api) return;
  if (!confirm(t('citations.confirmDelete'))) return;
  await window.api.citations.delete(citationId);
  await loadCitationCounts();
  await loadExpandedCitations(eventId);
}

function openCiteForm(eventId: string) {
  citingEventId.value = eventId;
}

function closeCiteForm() {
  citingEventId.value = null;
}

async function onCiteSaved() {
  closeCiteForm();
  await loadCitationCounts();
  if (expandedEventId.value) await loadExpandedCitations(expandedEventId.value);
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
.btn-cite {
  background: #eff6ff;
  color: #1d4ed8;
}
.badge-btn {
  background: none;
  border: none;
  padding: 0;
  margin-left: 6px;
  cursor: pointer;
  vertical-align: middle;
}
.citations-expansion-row td {
  background: #f8faff;
  padding: 8px 10px 10px 24px;
  border-bottom: 1px solid #e0e8ff;
}
.citations-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.citation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.citation-source-link {
  color: #1d4ed8;
  cursor: pointer;
  text-decoration: underline;
  font-weight: 600;
}
.citation-detail {
  color: #555;
}
.citation-confidence {
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
}
.citations-empty {
  font-size: 12px;
  color: #999;
}
tr.non-interactive { cursor: default; }
tr.non-interactive:hover { background: transparent; }
</style>
