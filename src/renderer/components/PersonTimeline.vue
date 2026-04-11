<template>
  <div class="person-timeline">
    <div v-if="loading" class="empty-hint">{{ $t('common.loading') }}</div>
    <div v-else-if="datedEvents.length === 0 && undatedEvents.length === 0" class="empty-hint">{{ $t('personTimeline.empty') }}</div>
    <template v-else>
      <!-- Dated events -->
      <div class="timeline-track">
        <template v-for="(item, idx) in datedEvents" :key="item.event.id">
          <!-- Gap indicator -->
          <div v-if="item.gapYears" class="timeline-gap">
            <span class="gap-label">{{ $t('personTimeline.gap', { years: item.gapYears }) }}</span>
          </div>
          <!-- Event entry -->
          <div
            class="timeline-entry"
            :class="{ 'is-approximate': item.isApproximate }"
            tabindex="0"
            role="button"
            :aria-label="$t('a11y.editItem', { item: $t('eventTypes.' + item.event.event_type) })"
            @click="editEvent(item.event)"
            @keydown.enter="editEvent(item.event)"
            @keydown.space.prevent="editEvent(item.event)"
          >
            <div class="timeline-date">{{ item.dateDisplay }}</div>
            <div class="timeline-dot" :class="'dot-' + item.event.event_type"></div>
            <div class="timeline-content">
              <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
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
          :key="item.event.id"
          class="timeline-entry is-undated"
          tabindex="0"
          role="button"
          :aria-label="$t('a11y.editItem', { item: $t('eventTypes.' + item.event.event_type) })"
          @click="editEvent(item.event)"
          @keydown.enter="editEvent(item.event)"
          @keydown.space.prevent="editEvent(item.event)"
        >
          <div class="timeline-date">????</div>
          <div class="timeline-dot dot-undated"></div>
          <div class="timeline-content">
            <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
            <span v-if="item.placeName" class="timeline-place">{{ item.placeName }}</span>
            <span v-if="item.event.description" class="timeline-desc">{{ item.event.description }}</span>
            <span v-if="item.event.citation_count" class="cite-badge">{{ item.event.citation_count }}</span>
          </div>
        </div>
      </div>
    </template>

    <EventForm
      v-if="showForm"
      :person-id="personId"
      :editing-event="editingEvent"
      @close="closeForm"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EventForm from './EventForm.vue';

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_address: string | null;
  description: string;
  cause: string | null;
  citation_count: number;
}

interface TimelineItem {
  event: EventRow;
  dateDisplay: string;
  placeName: string | null;
  isApproximate: boolean;
  year: number | null;
  age: number | null;
  gapYears: number | null;
}

const props = defineProps<{ personId: string }>();
const { t } = useI18n();

const loading = ref(true);
const datedEvents = ref<TimelineItem[]>([]);
const undatedEvents = ref<TimelineItem[]>([]);
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);

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
  if (event.date_type === 'between' && event.date_value_end) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

async function resolvePlaceName(event: EventRow): Promise<string | null> {
  if (event.place_id) {
    try {
      const place = (await window.api.places.get(event.place_id)) as { name?: string } | null;
      return place?.name ?? null;
    } catch { /* ignore */ }
  }
  if (event.place_address) return event.place_address;
  return null;
}

async function load() {
  loading.value = true;
  try {
    const events = (await window.api.events.forPerson(props.personId)) as EventRow[];

    // Resolve place names in parallel
    const placeNames = await Promise.all(events.map(e => resolvePlaceName(e)));

    // Find birth year for age calculation
    const birthEvent = events.find(e => e.event_type === 'birth');
    const birthYear = extractYear(birthEvent?.date_value ?? null);

    // Build timeline items
    const dated: TimelineItem[] = [];
    const undated: TimelineItem[] = [];

    events.forEach((event, i) => {
      const year = extractYear(event.date_value);
      const isApproximate = ['about', 'before', 'after', 'between', 'calculated'].includes(event.date_type);
      const age = (year !== null && birthYear !== null && event.event_type !== 'birth')
        ? year - birthYear
        : null;

      const item: TimelineItem = {
        event,
        dateDisplay: formatDate(event),
        placeName: placeNames[i],
        isApproximate,
        year,
        age,
        gapYears: null,
      };

      if (year !== null) {
        dated.push(item);
      } else {
        undated.push(item);
      }
    });

    // Sort dated events
    dated.sort((a, b) => {
      const dateA = a.event.date_value ?? '';
      const dateB = b.event.date_value ?? '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const prioA = TYPE_PRIORITY[a.event.event_type] ?? 50;
      const prioB = TYPE_PRIORITY[b.event.event_type] ?? 50;
      return prioA - prioB;
    });

    // Calculate gaps
    for (let i = 1; i < dated.length; i++) {
      const prevYear = dated[i - 1].year!;
      const currYear = dated[i].year!;
      const gap = currYear - prevYear;
      if (gap > 20) {
        dated[i].gapYears = gap;
      }
    }

    datedEvents.value = dated;
    undatedEvents.value = undated;
  } catch (err) {
    console.error('[PersonTimeline] load failed:', err);
  } finally {
    loading.value = false;
  }
}

function editEvent(event: EventRow) {
  editingEvent.value = event;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function onSaved() {
  closeForm();
  load();
}

watch(() => props.personId, load, { immediate: true });

defineExpose({ reload: load });
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
  border-radius: 8px;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: 10px;
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
