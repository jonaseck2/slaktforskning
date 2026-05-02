<template>
  <div class="person-timeline">
    <SectionEmpty v-if="loading" :message="$t('common.loading')" />
    <SectionEmpty v-else-if="datedEvents.length === 0 && undatedEvents.length === 0" :message="$t('personTimeline.empty')" />
    <template v-else>
      <!-- Dated events -->
      <div class="timeline-track">
        <template v-for="(item) in datedEvents" :key="item.event.id + ':' + item.relationshipLabel + ':' + item.personId">
          <!-- Gap indicator -->
          <div v-if="item.gapYears" class="timeline-gap">
            <span class="gap-label">{{ $t('personTimeline.gap', { years: item.gapYears }) }}</span>
          </div>
          <!-- Event entry -->
          <div
            class="timeline-entry"
            :class="{
              'is-approximate': item.isApproximate,
              'is-family': item.relationshipLabel !== 'self',
            }"
            tabindex="0"
            role="button"
            :aria-label="entryAriaLabel(item)"
            @click="handleEntryClick(item)"
            @keydown.enter="handleEntryClick(item)"
            @keydown.space.prevent="handleEntryClick(item)"
          >
            <div class="timeline-date">{{ item.dateDisplay }}</div>
            <div class="timeline-dot" :class="'dot-' + item.event.event_type"></div>
            <div class="timeline-content">
              <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
              <template v-if="item.relationshipLabel !== 'self'">
                <!-- Display only — see plan birth-name-display-and-quality-check. -->
                <span class="timeline-family-name">{{ displayPersonName(item) || $t('common.unknown') }}</span>
                <span class="timeline-relationship">({{ $t('timelineLabels.' + item.relationshipLabel) }})</span>
              </template>
              <span v-if="item.placeName" class="timeline-place">{{ item.placeName }}</span>
              <span v-if="item.age !== null" class="timeline-age">({{ item.age }})</span>
              <span v-if="item.event.description" class="timeline-desc">{{ item.event.description }}</span>
              <span v-if="item.event.citation_count" class="cite-badge" :title="$t('events.citeSources')">{{ item.event.citation_count }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Undated events -->
      <div v-if="undatedEvents.length > 0" class="timeline-undated">
        <div class="undated-label">{{ $t('personTimeline.undated') }}</div>
        <div
          v-for="item in undatedEvents"
          :key="item.event.id + ':' + item.relationshipLabel + ':' + item.personId"
          class="timeline-entry is-undated"
          :class="{ 'is-family': item.relationshipLabel !== 'self' }"
          tabindex="0"
          role="button"
          :aria-label="entryAriaLabel(item)"
          @click="handleEntryClick(item)"
          @keydown.enter="handleEntryClick(item)"
          @keydown.space.prevent="handleEntryClick(item)"
        >
          <div class="timeline-date">????</div>
          <div class="timeline-dot dot-undated"></div>
          <div class="timeline-content">
            <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
            <template v-if="item.relationshipLabel !== 'self'">
              <!-- Display only — see plan birth-name-display-and-quality-check. -->
              <span class="timeline-family-name">{{ displayPersonName(item) || $t('common.unknown') }}</span>
              <span class="timeline-relationship">({{ $t('timelineLabels.' + item.relationshipLabel) }})</span>
            </template>
            <span v-if="item.placeName" class="timeline-place">{{ item.placeName }}</span>
            <span v-if="item.event.description" class="timeline-desc">{{ item.event.description }}</span>
            <span v-if="item.event.citation_count" class="cite-badge">{{ item.event.citation_count }}</span>
          </div>
        </div>
      </div>
    </template>

    <EventModal
      v-if="showForm"
      mode="standalone"
      :person-id="personId"
      :editing-event="editingEvent"
      @cancel="closeForm"
      @close="closeForm"
      @saved="onSaved"
    />

    <PersonNameModal
      v-if="editingNameRow"
      mode="standalone"
      :person-id="personId"
      :editing-name="editingNameRow"
      @cancel="closeNameForm"
      @close="closeNameForm"
      @saved="onNameSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import EventModal from './modals/EventModal.vue';
import PersonNameModal from './modals/PersonNameModal.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { isSpanEventType } from '../constants/eventTypes';
import { useEntityData } from '../composables/useEntityData';
import { formatFullName } from '../utils/nameUtils';
import { usePersonNameOptions } from '../stores/personNameOptions';
import type { TimelineEntry, TimelineRelationshipLabel } from '../../api/report_data';
import type { NameRow } from './PersonNamesTable.vue';

const SYNTHETIC_NAME_CHANGE_PREFIX = 'name-change-';

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  description: string;
  cause: string | null;
  citation_count: number;
}

interface TimelineItem {
  event: EventRow;
  relationshipLabel: TimelineRelationshipLabel;
  personId: string;
  /**
   * Plain "Given Surname" — birth-name parenthetical is appended at render
   * time in `displayPersonName(item)` so the global toggle re-renders the
   * timeline without a data reload.
   */
  personName: string;
  /** Display only — see plan birth-name-display-and-quality-check. */
  personBirthSurname: string | null;
  dateDisplay: string;
  placeName: string | null;
  isApproximate: boolean;
  year: number | null;
  age: number | null;
  gapYears: number | null;
}

const props = defineProps<{ personId: string }>();
const { t } = useI18n();
const router = useRouter();
// Display only — see plan birth-name-display-and-quality-check.
const personNameOptions = usePersonNameOptions();

const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);
const editingNameRow = ref<NameRow | null>(null);

interface TimelineData {
  dated: TimelineItem[];
  undated: TimelineItem[];
}

// Event type sort priority: birth first, death last
const TYPE_PRIORITY: Record<string, number> = {
  birth: 0,
  baptism: 1,
  death: 98,
  burial: 99,
};

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function formatDate(event: EventRow): string {
  if (event.date_original) return event.date_original;
  if (!event.date_value) return '';
  const prefix =
    event.date_type === 'about' ? t('datePrefix.about') :
    event.date_type === 'before' ? t('datePrefix.before') :
    event.date_type === 'after' ? t('datePrefix.after') : '';
  if (event.date_value_end &&
      (event.date_type === 'between' || isSpanEventType(event.event_type))) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

function resolvePlaceName(event: EventRow): string | null {
  if (event.place_name) return event.place_name;
  if (event.place_address) return event.place_address;
  return null;
}

function entryAriaLabel(item: TimelineItem): string {
  const eventLabel = t('eventTypes.' + item.event.event_type);
  if (item.relationshipLabel === 'self') {
    return t('a11y.editItem', { item: eventLabel });
  }
  // Family entries: read out as "<event> – <person> (<relationship>)"
  const rel = t('timelineLabels.' + item.relationshipLabel);
  const name = displayPersonName(item) || t('common.unknown');
  return `${eventLabel} – ${name} (${rel})`;
}

/**
 * Plain-string display name with optional birth-surname parenthetical.
 * Reads `personNameOptions.showBirthNameParenthetical` at call time so the
 * global toggle re-renders the timeline without a data reload.
 * Display only — see plan birth-name-display-and-quality-check.
 */
function displayPersonName(item: TimelineItem): string {
  const base = item.personName;
  if (!personNameOptions.showBirthNameParenthetical) return base;
  const b = (item.personBirthSurname ?? '').trim();
  if (!b) return base;
  return `${base} (${t('common.bornAbbrev')} ${b})`;
}

const idRef = computed(() => props.personId ?? null);
const { data, loading, error, reload } = useEntityData<TimelineData>(idRef, async (id) => {
  const entries = (await window.api.reports.timeline(id)) as TimelineEntry[] | null;
  if (!entries) return { dated: [], undated: [] };

  // Find the subject's birth year (used for age column on the subject's own
  // events). Family events do not show an age — the age column is "this
  // person's age at the time of the event" and only makes sense for `self`.
  const ownBirthEntry = entries.find(
    e => e.relationship_label === 'self' && e.event.event_type === 'birth',
  );
  const birthYear = extractYear(ownBirthEntry?.event.date_value ?? null);

  const dated: TimelineItem[] = [];
  const undated: TimelineItem[] = [];

  for (const entry of entries) {
    // The TimelineEntry.event from reports.timeline carries every field
    // EventRow needs (it goes through getEventsForPerson which adds
    // citation_count, then resolveEventPlace which adds place_name). Cast.
    const event = entry.event as unknown as EventRow;
    const year = extractYear(event.date_value);
    const isApproximate = ['about', 'before', 'after', 'between', 'calculated'].includes(event.date_type);
    const age = (
      year !== null && birthYear !== null
      && entry.relationship_label === 'self'
      && event.event_type !== 'birth'
    )
      ? year - birthYear
      : null;

    // Display only — see plan birth-name-display-and-quality-check.
    // Birth-name parenthetical is appended at render time so toggling the
    // global setting re-renders the timeline without a data reload.
    const baseName = formatFullName({
      given_name: entry.person_given_name,
      surname: entry.person_surname,
    });
    const item: TimelineItem = {
      event,
      relationshipLabel: entry.relationship_label,
      personId: entry.person_id,
      personName: baseName,
      personBirthSurname: entry.person_birth_surname ?? null,
      dateDisplay: formatDate(event),
      placeName: resolvePlaceName(event),
      isApproximate,
      year,
      age,
      gapYears: null,
    };

    if (year !== null) dated.push(item);
    else undated.push(item);
  }

  // Sort dated chronologically (server already sorts, but keep client sort
  // + birth-first / death-last priority on same-date ties).
  dated.sort((a, b) => {
    const dateA = a.event.date_value ?? '';
    const dateB = b.event.date_value ?? '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const prioA = TYPE_PRIORITY[a.event.event_type] ?? 50;
    const prioB = TYPE_PRIORITY[b.event.event_type] ?? 50;
    return prioA - prioB;
  });

  // Calculate gaps (>20 years between consecutive dated entries).
  for (let i = 1; i < dated.length; i++) {
    const prevYear = dated[i - 1].year!;
    const currYear = dated[i].year!;
    const gap = currYear - prevYear;
    if (gap > 20) dated[i].gapYears = gap;
  }

  return { dated, undated };
});

const datedEvents = computed<TimelineItem[]>(() => data.value?.dated ?? []);
const undatedEvents = computed<TimelineItem[]>(() => data.value?.undated ?? []);

watch(error, (err) => {
  if (err) console.error('[PersonTimeline] load failed:', err);
});

async function handleEntryClick(item: TimelineItem) {
  if (item.relationshipLabel !== 'self') {
    // Family event: route to that person's panel where the event can be
    // edited in the right context. Editing a child's birth from the parent's
    // panel is confusing — the user expects the click to take them to that
    // person.
    void router.push({ name: 'persons', params: { personId: item.personId } });
    return;
  }
  // Synthetic name-change entry: open PersonNameModal on the underlying
  // person_names row, NOT EventModal (the synthetic event has no real DB id).
  if (item.event.event_type === 'name_change' && item.event.id.startsWith(SYNTHETIC_NAME_CHANGE_PREFIX)) {
    const nameId = item.event.id.slice(SYNTHETIC_NAME_CHANGE_PREFIX.length);
    try {
      const names = (await window.api.persons.getNames(props.personId)) as NameRow[];
      const match = names.find(n => n.id === nameId);
      if (match) editingNameRow.value = match;
    } catch (err) {
      console.error('[PersonTimeline] failed to load name for editing:', err);
    }
    return;
  }
  editingEvent.value = item.event;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function closeNameForm() {
  editingNameRow.value = null;
}

function onSaved() {
  closeForm();
  reload();
}

function onNameSaved() {
  closeNameForm();
  reload();
}

defineExpose({ reload });
</script>

<style scoped>
.person-timeline {
  padding: 4px 0;
}

.timeline-track {
  position: relative;
  padding-left: 80px;
}

.timeline-track::before {
  content: '';
  position: absolute;
  left: 74px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--color-border, #e2e8f0);
}

.timeline-entry {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 8px 6px 0;
  margin-left: -80px;
  cursor: pointer;
  border-radius: 4px;
}

.timeline-entry:hover {
  background: var(--color-bg-hover, #f8fafc);
}

.timeline-entry:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

/* Family-context entries (parent/spouse/child events) — slightly de-emphasised
   so the eye picks out the subject's own events first while still seeing the
   surrounding life story. */
.timeline-entry.is-family {
  opacity: 0.95;
}

.timeline-date {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  font-size: var(--font-xs);
  color: var(--color-text-muted, #64748b);
  font-variant-numeric: tabular-nums;
  padding-top: 2px;
}

.is-approximate .timeline-date {
  font-style: italic;
}

.timeline-dot {
  position: relative;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  border: 2px solid var(--color-bg, #fff);
  box-shadow: 0 0 0 2px var(--color-border, #e2e8f0);
  margin-top: 3px;
  z-index: 1;
}

.dot-birth { background: #22c55e; box-shadow: 0 0 0 2px #bbf7d0; }
.dot-death { background: #6b7280; box-shadow: 0 0 0 2px #d1d5db; }
.dot-baptism { background: #60a5fa; box-shadow: 0 0 0 2px #bfdbfe; }
.dot-burial { background: #9ca3af; box-shadow: 0 0 0 2px #e5e7eb; }
.dot-marriage { background: #f472b6; box-shadow: 0 0 0 2px #fbcfe8; }
.dot-name_change { background: #a78bfa; box-shadow: 0 0 0 2px #ddd6fe; }
.dot-undated { background: transparent; border: 2px dashed var(--color-text-faint, #94a3b8); box-shadow: none; }

.is-approximate .timeline-dot {
  border-style: dashed;
}

.timeline-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-top: 1px;
}

.event-badge {
  background: var(--color-event-badge-bg, #f1f5f9);
  color: var(--color-event-badge-text, #475569);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}

.timeline-family-name {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-text, #1e293b);
}

.timeline-relationship {
  font-size: var(--font-xs);
  color: var(--color-text-muted, #64748b);
  font-style: italic;
}

.timeline-place {
  font-size: var(--font-sm);
  color: var(--color-text, #1e293b);
}

.timeline-age {
  font-size: var(--font-xs);
  color: var(--color-text-muted, #64748b);
}

.timeline-desc {
  font-size: var(--font-xs);
  color: var(--color-text-subtle, #94a3b8);
  font-style: italic;
}

.cite-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--accent);
  color: var(--accent-text);
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 0 3px;
}

/* Gap indicator */
.timeline-gap {
  position: relative;
  padding: 4px 0 4px 80px;
}

.timeline-gap::before {
  content: '';
  position: absolute;
  left: 74px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--color-border, #e2e8f0) 0,
    var(--color-border, #e2e8f0) 3px,
    transparent 3px,
    transparent 6px
  );
}

.gap-label {
  display: inline-block;
  font-size: var(--font-xs);
  color: var(--color-text-faint, #94a3b8);
  background: var(--color-bg, #fff);
  padding: 0 6px;
  position: relative;
  left: 8px;
}

/* Undated section */
.timeline-undated {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.undated-label {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--color-text-faint, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  padding-left: 4px;
}

.is-undated {
  margin-left: 0;
  padding-left: 4px;
}

.is-undated .timeline-date {
  color: var(--color-text-faint, #94a3b8);
}
</style>
