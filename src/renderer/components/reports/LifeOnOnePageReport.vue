<template>
  <div class="life-on-one-page">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="data" class="one-page" :class="'orient-' + props.orientation">
      <header class="op-header">
        <h1 class="op-name">{{ primaryName || $t('common.unknown') }}</h1>
        <div v-if="yearsLabel" class="op-years">{{ yearsLabel }}</div>
      </header>

      <div class="op-portrait">
        <img v-if="portraitUrl" :src="portraitUrl" :alt="primaryName || ''" />
      </div>

      <div class="op-facts">
        <h3 class="op-facts-heading">{{ $t('reports.onePage.keyDates') }}</h3>
        <ul class="op-facts-list">
          <li v-if="birthYear">
            <strong>{{ $t('reports.common.born') }}</strong>
            {{ birthYear }}<span v-if="birthPlace"> &middot; {{ birthPlace }}</span>
          </li>
          <li v-for="m in marriages" :key="m.id">
            <strong>{{ $t('reports.common.married') }}</strong>
            <span v-if="m.spouseName"> {{ m.spouseName }}</span><span v-if="m.year">, {{ m.year }}</span><span v-if="m.place"> &middot; {{ m.place }}</span>
          </li>
          <li v-for="ev in otherKeyEvents" :key="ev.id">
            <strong>{{ eventTypeLabel(ev.event_type) }}</strong>
            <span v-if="ev.yearLabel">, {{ ev.yearLabel }}</span><span v-if="ev.place"> &middot; {{ ev.place }}</span>
          </li>
          <li v-if="deathYear">
            <strong>{{ $t('reports.common.died') }}</strong>
            {{ deathYear }}<span v-if="deathPlace"> &middot; {{ deathPlace }}</span>
          </li>
        </ul>
      </div>

      <div v-if="lifeMapPoints.length > 0" class="op-map">
        <LifeMap :points="lifeMapPoints" :height="200" draw-path />
      </div>

      <div v-if="photoGrid.length > 0" class="op-photos">
        <div
          v-for="m in photoGrid"
          :key="m.id"
          class="grid-photo"
        >
          <img v-if="photoGridUrls[m.id]" :src="photoGridUrls[m.id]" alt="" />
        </div>
      </div>

      <div v-if="bioSnippet" class="op-snippet">{{ bioSnippet }}</div>

      <footer class="op-footer">
        <span v-if="researcherName">{{ $t('reports.common.compiledBy', { name: researcherName }) }}</span>
        <span class="spacer"></span>
        <span>{{ formattedDate }}</span>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import LifeMap, { type LifeMapPathPoint } from './primitives/LifeMap.vue';
import { useLifeMap } from '../../composables/useLifeMap';
import { useMediaChronological, type MediaEntityRef } from '../../composables/useMediaChronological';
import { formatFullName } from '../../utils/nameUtils';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  personId: string;
  orientation?: 'portrait' | 'landscape';
  redactLiving?: boolean;
}>(), {
  orientation: 'portrait',
  redactLiving: false,
});

const { t, locale } = useI18n();
const toast = useToast();

// --- Types matching personSummary IPC shape ---
interface RawPersonName {
  given_name: string | null;
  surname: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
  sort_order: number;
  name_type: string;
}
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
  relationship_id?: string | null;
}
interface RawRelSummary {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
  other_person_id: string | null;
  other_person_names: RawPersonName[];
  other_person_sex: string | null;
}
interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }
interface PersonSummary {
  person: RawPerson;
  names: RawPersonName[];
  events: RawEvent[];
  relationships: RawRelSummary[];
  citations: unknown[];
  notes?: string | null;
}

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<PersonSummary | null>(null);
const researcherName = ref<string | null>(null);
const portraitUrl = ref<string | null>(null);
const photoGridUrls = reactive<Record<string, string>>({});

// --- Composables ---
const personIdRef = computed(() => props.personId || null);
const { data: lifeMapData } = useLifeMap(personIdRef);
const mediaEntityRef = computed<MediaEntityRef | null>(() =>
  props.personId ? { entityType: 'person', entityId: props.personId } : null,
);
const { items: mediaItems } = useMediaChronological(mediaEntityRef);

// --- Helpers ---
function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function personNameFrom(names: RawPersonName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

function eventTypeLabel(type: string): string {
  return t(`eventTypes.${type}`, type);
}

// --- Derived state ---
const primaryName = computed(() => {
  if (!data.value?.names?.length) return '';
  const sorted = [...data.value.names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
});

const birthEvent = computed<RawEvent | null>(() =>
  data.value?.events.find(e => e.event_type === 'birth') ?? null,
);
const deathEvent = computed<RawEvent | null>(() =>
  data.value?.events.find(e => e.event_type === 'death') ?? null,
);

const rawBirthYear = computed(() => extractYear(birthEvent.value?.date_value ?? null));
const deathYear = computed(() => extractYear(deathEvent.value?.date_value ?? null));
const birthPlace = computed(() => birthEvent.value?.place_name ?? null);
const deathPlace = computed(() => deathEvent.value?.place_name ?? null);

const focalDisplay = computed(() => {
  const person = data.value?.person;
  if (!person) return null;
  return redactPerson(
    {
      id: person.id,
      living: person.living,
      birthYear: rawBirthYear.value,
      deathYear: deathYear.value,
      notes: person.notes,
    },
    { redactLiving: props.redactLiving === true },
  );
});

const birthYear = computed(() => focalDisplay.value?.birthYear ?? null);

const suppressPhotos = computed(() =>
  props.redactLiving === true && data.value?.person?.living === true,
);

const yearsLabel = computed(() => {
  if (birthYear.value == null && deathYear.value == null) return '';
  const b = birthYear.value != null
    ? (focalDisplay.value?.living && props.redactLiving ? `${birthYear.value}s` : String(birthYear.value))
    : '?';
  return `${b}\u2013${deathYear.value ?? ''}`;
});

interface MarriageEntry {
  id: string;
  spouseName: string;
  year: number | null;
  place: string | null;
}

const marriages = computed<MarriageEntry[]>(() => {
  if (!data.value) return [];
  const out: MarriageEntry[] = [];
  for (const rel of data.value.relationships) {
    if (rel.type !== 'couple') continue;
    const spouseName = personNameFrom(rel.other_person_names);
    // Find marriage event tied to this relationship
    const marriageEvent = data.value.events.find(
      e => e.event_type === 'marriage' && e.relationship_id === rel.id,
    ) ?? null;
    out.push({
      id: rel.id,
      spouseName,
      year: extractYear(marriageEvent?.date_value ?? null),
      place: marriageEvent?.place_name ?? null,
    });
  }
  // Keep marriages that have either a year or a name
  return out.filter(m => m.spouseName || m.year);
});

interface OtherKeyEvent {
  id: string;
  event_type: string;
  yearLabel: string | null;
  place: string | null;
}

// Show "other" life events that aren't birth/death/marriage — limited to a few to fit the page
const otherKeyEvents = computed<OtherKeyEvent[]>(() => {
  if (!data.value) return [];
  const skip = new Set(['birth', 'death', 'marriage']);
  const out: OtherKeyEvent[] = [];
  for (const ev of data.value.events) {
    if (skip.has(ev.event_type)) continue;
    const year = extractYear(ev.date_value);
    const yearLabel = year != null ? String(year) : (ev.date_original ?? null);
    out.push({
      id: ev.id,
      event_type: ev.event_type,
      yearLabel,
      place: ev.place_name ?? null,
    });
  }
  // Sort chronologically by year when available
  out.sort((a, b) => {
    const ay = a.yearLabel ? parseInt(a.yearLabel, 10) : Number.POSITIVE_INFINITY;
    const by = b.yearLabel ? parseInt(b.yearLabel, 10) : Number.POSITIVE_INFINITY;
    if (isNaN(ay) && isNaN(by)) return 0;
    if (isNaN(ay)) return 1;
    if (isNaN(by)) return -1;
    return ay - by;
  });
  // Cap at 4 to keep the single page tidy
  return out.slice(0, 4);
});

const lifeMapPoints = computed<LifeMapPathPoint[]>(() =>
  lifeMapData.value.events.map(e => ({
    lat: e.lat,
    lon: e.lon,
    label: e.placeName,
    year: extractYear(e.dateISO),
  })),
);

const photoGrid = computed(() => {
  if (suppressPhotos.value) return [];
  return mediaItems.value.slice(1, 5);
});

const bioSnippet = computed(() => {
  const notes = focalDisplay.value?.notes ?? '';
  if (!notes) return '';
  const firstPara = notes.split(/\n\s*\n/)[0]?.trim() ?? '';
  if (!firstPara) return '';
  return firstPara.length > 400 ? firstPara.slice(0, 400).trimEnd() + '\u2026' : firstPara;
});

const formattedDate = computed(() =>
  new Date().toLocaleDateString(locale.value === 'sv' ? 'sv-SE' : 'en-GB'),
);

// --- Portrait: first linked media as data URL ---
watch(
  () => [mediaItems.value[0]?.id ?? null, suppressPhotos.value] as const,
  async ([id, suppress]) => {
    if (!id || suppress) {
      portraitUrl.value = null;
      return;
    }
    try {
      portraitUrl.value = (await window.api.media.readAsDataUrl(id)) as string | null;
    } catch {
      portraitUrl.value = null;
    }
  },
  { immediate: true },
);

// --- Photo grid: load data URLs for each grid item ---
watch(
  () => photoGrid.value.map(p => p.id).join('|'),
  async () => {
    // Clear old keys not in new grid
    const currentIds = new Set(photoGrid.value.map(p => p.id));
    for (const key of Object.keys(photoGridUrls)) {
      if (!currentIds.has(key)) delete photoGridUrls[key];
    }
    // Load missing ones
    for (const m of photoGrid.value) {
      if (photoGridUrls[m.id]) continue;
      try {
        const url = (await window.api.media.readAsDataUrl(m.id)) as string | null;
        if (url) photoGridUrls[m.id] = url;
      } catch {
        // skip
      }
    }
  },
  { immediate: true },
);

// --- Load person summary ---
async function load() {
  if (!props.personId) {
    data.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  try {
    const [summary, researcher] = await Promise.all([
      window.api.reports.personSummary(props.personId) as Promise<PersonSummary | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    if (!summary) {
      error.value = t('reports.personNotFound');
      return;
    }
    data.value = summary;
    researcherName.value = researcher || null;
  } catch (err) {
    console.error('[LifeOnOnePageReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.alife');
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.life-on-one-page {
  font-family: var(--report-serif-stack);
}
.loading, .error {
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-md) 0;
}
.error { color: var(--error-text); }

.one-page {
  display: grid;
  gap: var(--space-lg);
  font-family: var(--report-serif-stack);
}

.orient-portrait {
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    "header header"
    "portrait facts"
    "map map"
    "photos photos"
    "snippet snippet"
    "footer footer";
}

.orient-landscape {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-areas:
    "header header header"
    "portrait facts map"
    "photos photos snippet"
    "footer footer footer";
}

.op-header {
  grid-area: header;
  text-align: center;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--surface-border-subtle);
}
.op-name {
  font-family: var(--report-serif-stack);
  font-size: 2.25rem;
  margin: 0 0 var(--space-xs);
  line-height: 1.1;
}
.op-years {
  color: var(--text-secondary);
  font-size: 1.1rem;
  letter-spacing: 0.05em;
}

.op-portrait {
  grid-area: portrait;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.op-portrait img {
  max-width: 100%;
  max-height: 360px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}

.op-facts { grid-area: facts; }
.op-facts-heading {
  font-family: var(--report-serif-stack);
  font-size: 1.15rem;
  margin: 0 0 var(--space-sm);
  color: var(--text-primary);
}
.op-facts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  line-height: var(--report-prose-leading);
}
.op-facts-list li {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  font-size: 0.95rem;
}
.op-facts-list li:last-child { border-bottom: none; }
.op-facts-list strong { color: var(--text-secondary); margin-right: var(--space-xs); }

.op-map {
  grid-area: map;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--surface-border-subtle);
}

.op-photos {
  grid-area: photos;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-sm);
}
.orient-landscape .op-photos {
  grid-template-columns: repeat(2, 1fr);
}
.grid-photo {
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
}
.grid-photo img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  display: block;
}
.orient-landscape .grid-photo img { height: 100px; }

.op-snippet {
  grid-area: snippet;
  line-height: var(--report-prose-leading);
  font-size: 0.95rem;
  color: var(--text-primary);
}

.op-footer {
  grid-area: footer;
  display: flex;
  padding-top: var(--space-md);
  border-top: 1px solid var(--surface-border-subtle);
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.op-footer .spacer { flex: 1; }
</style>
