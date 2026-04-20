<template>
  <div class="place-chronicle-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Cover -->
      <ReportCover
        :title="data.place_name || $t('common.unknown')"
        :subtitle="coverSubtitle"
        :hero-image-url="profileImageUrl"
        :researcher-name="researcherName"
      />

      <!-- Map -->
      <section v-if="props.placeId" class="report-section">
        <h2 class="section-heading">{{ $t('reports.placeChronicle.map') }}</h2>
        <PlaceBoundaryMap
          :place-id="props.placeId"
          :persons="personPins"
          :show-boundary="props.showBoundary"
          :height="500"
        />
      </section>

      <!-- Persons linked to this place -->
      <section v-if="personsLinked.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.placeChronicle.persons') }}</h2>
        <ul class="person-list">
          <li v-for="p in personsLinked" :key="p.person_id">
            <strong>{{ p.name || $t('common.unknown') }}</strong>
            <span v-if="p.firstEventYear" class="muted"> ({{ p.firstEventYear }})</span>
          </li>
        </ul>
      </section>

      <!-- Events at place -->
      <section v-if="chronologicalEvents.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.placeChronicle.events') }}</h2>
        <ul class="event-list">
          <li v-for="ev in chronologicalEvents" :key="ev.id">
            <strong>{{ eventTypeLabel(ev.event_type) }}</strong>
            <span v-if="ev.date_display">, {{ ev.date_display }}</span>
            <span v-if="ev.participantLabel" class="muted"> &mdash; {{ ev.participantLabel }}</span>
            <span v-if="ev.description">. {{ ev.description }}</span>
          </li>
        </ul>
      </section>

      <!-- Description (notes) -->
      <section v-if="props.showNotes && notesParagraphs.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.placeChronicle.description') }}</h2>
        <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
      </section>

      <!-- Photos -->
      <section v-if="props.showPhotos && photoItems.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
        <MediaChronological :items="photoItems" :show-captions="true" :per-page="2" />
      </section>

      <!-- Child places -->
      <section v-if="props.showChildPlaces && childPlaces.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.placeChronicle.childPlaces') }}</h2>
        <ul class="child-places-list">
          <li v-for="cp in childPlaces" :key="cp.id">{{ cp.name }}</li>
        </ul>
      </section>

      <!-- Sources -->
      <section v-if="props.showSources && uniqueSources.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.sources') }}</h2>
        <ol class="citation-list">
          <li v-for="src in uniqueSources" :key="src.id">
            <span>{{ src.title || $t('common.unknown') }}</span>
            <span v-if="src.author" class="muted"> &middot; {{ src.author }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportCover from './primitives/ReportCover.vue';
import PlaceBoundaryMap, { type PlacePin } from './primitives/PlaceBoundaryMap.vue';
import MediaChronological, { type MediaDisplayItem } from './primitives/MediaChronological.vue';
import { useMediaChronological, type MediaEntityRef } from '../../composables/useMediaChronological';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  placeId: string;
  showBoundary?: boolean;
  showChildPlaces?: boolean;
  showPhotos?: boolean;
  showNotes?: boolean;
  showSources?: boolean;
}>(), {
  showBoundary: true,
  showChildPlaces: false,
  showPhotos: true,
  showNotes: true,
  showSources: false,
});

const { t } = useI18n();
const toast = useToast();

// Types matching report_data.PlaceHistory shape via IPC
interface RawEvent {
  id: string;
  event_type: string;
  date_type: string | null;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string | null;
  place_id: string | null;
  place_name: string | null;
  place_path: string | null;
  description: string | null;
  cause: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface RawParticipant {
  person_id: string;
  given_name: string;
  surname: string;
  role: string;
}

interface RawPlaceEventRecord {
  event: RawEvent;
  participants: RawParticipant[];
}

interface PlaceHistory {
  place_id: string;
  place_name: string;
  place_path: string;
  events: RawPlaceEventRecord[];
}

interface RawPlace {
  id: string;
  name: string;
  place_type: string | null;
  parent_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  date_from: string | null;
  date_to: string | null;
  notes: string;
}

interface RawCitation {
  id: string;
  source_id: string;
}

interface RawSource {
  id: string;
  title: string | null;
  author: string | null;
}

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<PlaceHistory | null>(null);
const place = ref<RawPlace | null>(null);
const researcherName = ref<string | null>(null);
const profileImageUrl = ref<string | null>(null);
const childPlaces = ref<Array<{ id: string; name: string }>>([]);
const sources = ref<RawSource[]>([]);

// Media for this place (hero image + photos section)
const mediaEntityRef = computed<MediaEntityRef | null>(() =>
  props.placeId ? { entityType: 'place', entityId: props.placeId } : null,
);
const { items: mediaItems } = useMediaChronological(mediaEntityRef);

// --- Helpers ---

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function formatDateDisplay(ev: RawEvent): string | null {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return null;
  const prefix = ev.date_type ? t('datePrefix.' + ev.date_type, '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    return `${prefix}${ev.date_value}\u2013${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function eventTypeLabel(type: string): string {
  return t(`eventTypes.${type}`, type);
}

function formatParticipantName(p: RawParticipant): string {
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.join(' ') || t('common.unknown');
}

// --- Derived state ---

const coverSubtitle = computed(() => {
  const parts: string[] = [];
  if (place.value?.place_type) {
    parts.push(t(`places.types.${place.value.place_type}`, place.value.place_type));
  }
  const from = place.value?.date_from ? extractYear(place.value.date_from) : null;
  const to = place.value?.date_to ? extractYear(place.value.date_to) : null;
  if (from != null || to != null) {
    parts.push(`${from ?? '?'}\u2013${to ?? ''}`);
  } else if (data.value?.place_path && data.value.place_path !== data.value.place_name) {
    parts.push(data.value.place_path);
  }
  return parts.join(' \u00B7 ');
});

interface DisplayEvent extends RawEvent {
  date_display: string | null;
  participantLabel: string | null;
}

const chronologicalEvents = computed<DisplayEvent[]>(() => {
  if (!data.value) return [];
  const rows: DisplayEvent[] = data.value.events.map(rec => {
    const participants = rec.participants.map(formatParticipantName);
    return {
      ...rec.event,
      date_display: formatDateDisplay(rec.event),
      participantLabel: participants.length > 0 ? participants.join(', ') : null,
    };
  });
  rows.sort((a, b) => {
    const av = a.date_value ?? '\uFFFF';
    const bv = b.date_value ?? '\uFFFF';
    return av.localeCompare(bv);
  });
  return rows;
});

interface PersonLinked { person_id: string; name: string; firstEventYear: number | null; }

const personsLinked = computed<PersonLinked[]>(() => {
  if (!data.value) return [];
  const byPerson = new Map<string, PersonLinked>();
  const sortedEvents = [...data.value.events].sort((a, b) => {
    const av = a.event.date_value ?? '\uFFFF';
    const bv = b.event.date_value ?? '\uFFFF';
    return av.localeCompare(bv);
  });
  for (const rec of sortedEvents) {
    const year = extractYear(rec.event.date_value);
    for (const p of rec.participants) {
      if (!byPerson.has(p.person_id)) {
        byPerson.set(p.person_id, {
          person_id: p.person_id,
          name: formatParticipantName(p),
          firstEventYear: year,
        });
      }
    }
  }
  return [...byPerson.values()].sort((a, b) => {
    const ay = a.firstEventYear ?? Number.MAX_SAFE_INTEGER;
    const by = b.firstEventYear ?? Number.MAX_SAFE_INTEGER;
    if (ay !== by) return ay - by;
    return a.name.localeCompare(b.name);
  });
});

// Pin list for the map — only events/participants with lat/lon.
// PlaceHistory events share the same place, so lat/lon comes from the event row
// (if the places table provides them) or is unavailable. Participants themselves
// don't carry coordinates in the shape.
const personPins = computed<PlacePin[]>(() => {
  if (!data.value) return [];
  const pins: PlacePin[] = [];
  const seen = new Set<string>();
  for (const rec of data.value.events) {
    const lat = rec.event.latitude ?? null;
    const lon = rec.event.longitude ?? null;
    if (lat == null || lon == null) continue;
    for (const p of rec.participants) {
      if (seen.has(p.person_id)) continue;
      seen.add(p.person_id);
      pins.push({
        id: p.person_id,
        lat,
        lon,
        label: formatParticipantName(p),
      });
    }
  }
  return pins;
});

const notesParagraphs = computed(() => {
  const notes = place.value?.notes;
  if (!notes) return [];
  return notes.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
});

function isImageItem(fileRef: string | null, format: string | null): boolean {
  if (!fileRef) return false;
  const fmt = (format || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(fileRef) || /image/.test(fmt);
}

function toDisplayItem(m: {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  inferredDateISO: string | null;
}): MediaDisplayItem {
  return {
    id: m.id,
    title: m.title,
    notes: m.notes,
    fileRef: m.fileRef,
    format: m.format,
    inferredDateISO: m.inferredDateISO,
    contextLine: null,
  };
}

const photoItems = computed<MediaDisplayItem[]>(() =>
  mediaItems.value.filter(m => isImageItem(m.fileRef, m.format)).map(toDisplayItem),
);

const uniqueSources = computed(() => sources.value);

// --- Hero image: first place-linked media ---
watch(
  () => mediaItems.value[0]?.id ?? null,
  async (id) => {
    if (!id) {
      profileImageUrl.value = null;
      return;
    }
    try {
      profileImageUrl.value = (await window.api.media.readAsDataUrl(id)) as string | null;
    } catch {
      profileImageUrl.value = null;
    }
  },
  { immediate: true },
);

// --- Sources loader ---
async function loadSources(history: PlaceHistory): Promise<RawSource[]> {
  const citationPromises: Promise<RawCitation[]>[] = [
    window.api.citations.forPlace(history.place_id) as Promise<RawCitation[]>,
  ];
  for (const rec of history.events) {
    citationPromises.push(window.api.citations.forEvent(rec.event.id) as Promise<RawCitation[]>);
  }
  const citationSets = await Promise.all(citationPromises);
  const allCitations = citationSets.flat();
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const c of allCitations) {
    if (c.source_id && !seen.has(c.source_id)) {
      seen.add(c.source_id);
      uniqueIds.push(c.source_id);
    }
  }
  const fetched = await Promise.all(
    uniqueIds.map(sid => (window.api.sources.get(sid) as Promise<RawSource | null>).catch(() => null)),
  );
  return fetched.filter((s): s is RawSource => s !== null);
}

async function loadChildPlaces(placeId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const all = (await window.api.places.list()) as Array<{
      id: string; name: string; parent_place_id: string | null;
    }>;
    return all
      .filter(p => p.parent_place_id === placeId)
      .map(p => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function load() {
  if (!props.placeId) {
    data.value = null;
    place.value = null;
    childPlaces.value = [];
    sources.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  place.value = null;
  childPlaces.value = [];
  sources.value = [];
  try {
    const [history, placeRow, researcher] = await Promise.all([
      window.api.reports.placeHistory(props.placeId) as Promise<PlaceHistory | null>,
      window.api.places.get(props.placeId) as Promise<RawPlace | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    if (!history) {
      error.value = t('reports.placeNotFound');
      return;
    }
    data.value = history;
    place.value = placeRow;
    researcherName.value = researcher || null;

    if (props.showChildPlaces) {
      childPlaces.value = await loadChildPlaces(props.placeId);
    }

    if (props.showSources) {
      try {
        sources.value = await loadSources(history);
      } catch {
        sources.value = [];
      }
    }
  } catch (err) {
    console.error('[PlaceChronicleReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.placeChronicle');
  } finally {
    loading.value = false;
  }
}

watch(() => props.placeId, load, { immediate: true });
watch(() => props.showChildPlaces, async (enabled) => {
  if (enabled && data.value && childPlaces.value.length === 0) {
    childPlaces.value = await loadChildPlaces(props.placeId);
  }
});
watch(() => props.showSources, async (enabled) => {
  if (enabled && data.value && sources.value.length === 0) {
    try {
      sources.value = await loadSources(data.value);
    } catch {
      sources.value = [];
    }
  }
});
</script>

<style scoped>
.place-chronicle-report {
  font-family: var(--report-serif-stack);
}
.loading, .error {
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-md) 0;
}
.error { color: var(--error-text); }

.report-section {
  padding: var(--space-xl) 0;
  page-break-inside: avoid;
}
.section-heading {
  font-family: var(--report-serif-stack);
  font-size: 1.5rem;
  margin-bottom: var(--space-lg);
}
.prose-section {
  font-family: var(--report-serif-stack);
  line-height: var(--report-prose-leading);
}
.prose-paragraph {
  margin-bottom: var(--space-md);
}

.muted { color: var(--text-muted); }

.event-list,
.person-list,
.child-places-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.event-list li,
.person-list li {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.child-places-list {
  padding-left: var(--space-lg);
  list-style: disc;
}
.child-places-list li {
  padding: 2px 0;
}

.citation-list {
  padding-left: var(--space-lg);
  font-size: var(--font-sm);
}
</style>
