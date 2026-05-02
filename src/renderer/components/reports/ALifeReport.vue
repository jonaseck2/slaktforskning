<template>
  <div class="a-life-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Cover -->
      <ReportCover
        :title="primaryName || $t('common.unknown')"
        :subtitle="yearsSubtitle"
        :hero-image-url="profileImageUrl"
        :researcher-name="researcherName"
      />

      <!-- Timeline -->
      <section v-if="timelineItems.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.alife.timeline') }}</h2>
        <TimelineBar :items="timelineItems" anchor-base="#event-" />
      </section>

      <!-- Family -->
      <section v-if="hasFamily" class="report-section">
        <h2 class="section-heading">{{ $t('reports.alife.family') }}</h2>

        <div v-if="parents.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ $t('reports.parents') }}</h3>
          <ul class="rel-list">
            <li v-for="p in parents" :key="p.id" :id="'person-' + p.id">{{ p.name || $t('common.unknown') }}</li>
          </ul>
        </div>

        <div v-if="spouses.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ $t('personPanel.partners') }}</h3>
          <ul class="rel-list">
            <li v-for="s in spouses" :key="s.id" :id="'person-' + s.id">{{ s.name || $t('common.unknown') }}</li>
          </ul>
        </div>

        <div v-if="children.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ $t('personPanel.children') }}</h3>
          <ul class="rel-list">
            <li v-for="c in children" :key="c.id" :id="'person-' + c.id">{{ c.name || $t('common.unknown') }}</li>
          </ul>
        </div>
      </section>

      <!-- Events -->
      <section v-if="chronologicalEvents.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.alife.events') }}</h2>
        <ul class="event-list">
          <li v-for="ev in chronologicalEvents" :key="ev.id" :id="'event-' + ev.id">
            <strong>{{ eventTypeLabel(ev.event_type) }}</strong>
            <span v-if="ev.date_display">, {{ ev.date_display }}</span>
            <span v-if="ev.place_name">, {{ ev.place_name }}</span>
            <span v-if="ev.description">. {{ ev.description }}</span>
          </li>
        </ul>
      </section>

      <!-- Life Map -->
      <PersonLifeMap
        v-if="props.showLifeMap"
        :person-id="props.personId"
        :heading="$t('reports.alife.lifeMap')"
        :height="400"
        :show-caption="props.showMapCaption"
        draw-path
      />

      <!-- Biography (notes) -->
      <section v-if="props.showNotes && notesParagraphs.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.alife.biography') }}</h2>
        <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
      </section>

      <!-- Photos -->
      <section v-if="props.showPhotos && photoItems.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
        <MediaChronological :items="photoItems" :show-captions="props.showMediaCaptions" :show-notes="props.showMediaNotes" :per-page="2" :relations="personRelations" :linked-person-ids="linkedPersonIds" />
      </section>

      <!-- Documents -->
      <section v-if="props.showDocuments && documentItems.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.documents') }}</h2>
        <MediaChronological :items="documentItems" :show-captions="props.showMediaCaptions" :show-notes="props.showMediaNotes" :per-page="4" :include-documents="true" :relations="personRelations" :linked-person-ids="linkedPersonIds" />
      </section>

      <!-- Sources -->
      <section v-if="props.showSources && uniqueSources.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.sources') }}</h2>
        <ol class="citation-list">
          <li v-for="src in uniqueSources" :key="src.id">
            <span class="src-title">{{ src.title || $t('common.unknown') }}</span>
            <span v-if="src.author" class="muted"> &middot; {{ src.author }}</span>
            <div v-if="src.publication_info" class="src-line">{{ src.publication_info }}</div>
            <div v-if="src.repository" class="src-line muted">{{ src.repository }}</div>
            <div v-if="src.url" class="src-line src-url">{{ src.url }}</div>
            <ul v-if="src.pages.length > 0" class="src-pages">
              <li v-for="(p, i) in src.pages" :key="i">{{ p }}</li>
            </ul>
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
import PersonLifeMap from './primitives/PersonLifeMap.vue';
import TimelineBar, { type TimelineItem } from './primitives/TimelineBar.vue';
import MediaChronological, { type MediaDisplayItem } from './primitives/MediaChronological.vue';
import { useMediaChronological, type MediaEntityRef } from '../../composables/useMediaChronological';
import { formatFullName } from '../../utils/nameUtils';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';
import { isSpanEventType } from '../../constants/eventTypes';
import type { TimelineEntry } from '../../../api/report_data';

const props = withDefaults(defineProps<{
  personId: string;
  showLifeMap?: boolean;
  showMapCaption?: boolean;
  showPhotos?: boolean;
  showDocuments?: boolean;
  showSources?: boolean;
  showNotes?: boolean;
  redactLiving?: boolean;
  showMediaCaptions?: boolean;
  showMediaNotes?: boolean;
  includeChildrenMarriages?: boolean;
  includeSiblingDeaths?: boolean;
}>(), {
  showLifeMap: true,
  showMapCaption: true,
  showPhotos: true,
  showDocuments: false,
  showSources: false,
  showNotes: true,
  redactLiving: false,
  showMediaCaptions: true,
  showMediaNotes: true,
  includeChildrenMarriages: false,
  includeSiblingDeaths: false,
});

const { t } = useI18n();
const toast = useToast();

// Types matching report_data.PersonSummary shape via IPC
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
interface RawCitation {
  id: string;
  source_id: string;
  source_title: string | null;
  source_author: string | null;
  source_publication_info: string | null;
  source_url: string | null;
  source_repository: string | null;
  page: string | null;
}
interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }
interface PersonSummary {
  person: RawPerson;
  names: RawPersonName[];
  events: RawEvent[];
  relationships: RawRelSummary[];
  citations: RawCitation[];
}

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<PersonSummary | null>(null);
const timelineEntries = ref<TimelineEntry[]>([]);
const researcherName = ref<string | null>(null);
const profileImageUrl = ref<string | null>(null);

const mediaEntityRef = computed<MediaEntityRef | null>(() =>
  props.personId ? { entityType: 'person', entityId: props.personId } : null,
);
const { items: mediaItems } = useMediaChronological(mediaEntityRef);

const primaryName = computed(() => {
  if (!data.value?.names?.length) return '';
  const sorted = [...data.value.names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
});

function personNameFrom(names: RawPersonName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

const rawBirthYear = computed<number | null>(() => {
  const ev = data.value?.events.find(e => e.event_type === 'birth');
  return extractYear(ev?.date_value ?? null);
});
const deathYear = computed<number | null>(() => {
  const ev = data.value?.events.find(e => e.event_type === 'death');
  return extractYear(ev?.date_value ?? null);
});

// Privacy-redacted view of the focal person.
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
      portraitUrl: null as string | null,
    },
    { redactLiving: props.redactLiving === true },
  );
});

const birthYear = computed(() => focalDisplay.value?.birthYear ?? null);

const yearsSubtitle = computed(() => {
  if (birthYear.value == null && deathYear.value == null) return '';
  const b = birthYear.value != null
    ? (focalDisplay.value?.living && props.redactLiving ? `${birthYear.value}s` : String(birthYear.value))
    : '?';
  return `${b}\u2013${deathYear.value ?? ''}`;
});

interface PersonRef { id: string; name: string; }

const parents = computed<PersonRef[]>(() => {
  if (!data.value) return [];
  const out: PersonRef[] = [];
  for (const r of data.value.relationships) {
    if (r.type !== 'parent_child') continue;
    // person2_id is the child in parent_child convention
    if (r.person2_id === props.personId && r.other_person_id) {
      out.push({ id: r.other_person_id, name: personNameFrom(r.other_person_names) });
    }
  }
  return out;
});

const spouses = computed<PersonRef[]>(() => {
  if (!data.value) return [];
  const out: PersonRef[] = [];
  for (const r of data.value.relationships) {
    if (r.type !== 'couple' || !r.other_person_id) continue;
    out.push({ id: r.other_person_id, name: personNameFrom(r.other_person_names) });
  }
  return out;
});

const children = computed<PersonRef[]>(() => {
  if (!data.value) return [];
  const out: PersonRef[] = [];
  for (const r of data.value.relationships) {
    if (r.type !== 'parent_child') continue;
    if (r.person1_id === props.personId && r.other_person_id) {
      out.push({ id: r.other_person_id, name: personNameFrom(r.other_person_names) });
    }
  }
  return out;
});

const hasFamily = computed(() => parents.value.length + spouses.value.length + children.value.length > 0);

const linkedPersonIds = computed<string[]>(() => [
  ...parents.value.map(p => p.id),
  ...spouses.value.map(s => s.id),
  ...children.value.map(c => c.id),
]);

const personRelations = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const r of data.value?.relationships ?? []) {
    if (!r.other_person_id) continue;
    const sex = r.other_person_sex;
    if (r.type === 'parent_child' && r.person2_id === props.personId) {
      map[r.other_person_id] = sex === 'M' ? t('reports.relations.father')
        : sex === 'F' ? t('reports.relations.mother')
        : t('reports.relations.parent');
    } else if (r.type === 'parent_child' && r.person1_id === props.personId) {
      map[r.other_person_id] = sex === 'M' ? t('reports.relations.son')
        : sex === 'F' ? t('reports.relations.daughter')
        : t('reports.relations.child');
    } else if (r.type === 'couple') {
      map[r.other_person_id] = sex === 'M' ? t('reports.relations.husband')
        : sex === 'F' ? t('reports.relations.wife')
        : t('reports.relations.spouse');
    }
  }
  return map;
});

interface DisplayEvent extends RawEvent { date_display: string | null; }

function formatDateDisplay(ev: RawEvent): string | null {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return null;
  if (ev.date_value_end &&
      (ev.date_type === 'between' || isSpanEventType(ev.event_type))) {
    return `${ev.date_value}–${ev.date_value_end}`;
  }
  return ev.date_value;
}

const chronologicalEvents = computed<DisplayEvent[]>(() => {
  if (!data.value) return [];
  const sorted = [...data.value.events].sort((a, b) => {
    const av = a.date_value ?? '\uFFFF';
    const bv = b.date_value ?? '\uFFFF';
    return av.localeCompare(bv);
  });
  return sorted.map(ev => ({ ...ev, date_display: formatDateDisplay(ev) }));
});

function eventTypeLabel(type: string): string {
  return t(`eventTypes.${type}`, type);
}

const timelineItems = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = [];
  for (const entry of timelineEntries.value) {
    const year = extractYear(entry.event.date_value);
    if (year == null) continue;
    const place = entry.event.place_name;
    const typeLabel = eventTypeLabel(entry.event.event_type);

    if (entry.relationship_label === 'self') {
      const label = place ? `${typeLabel} · ${place}` : typeLabel;
      items.push({ id: entry.event.id, year, eventType: entry.event.event_type, label });
    } else {
      const namePart = formatFullName({
        given_name: entry.person_given_name,
        surname: entry.person_surname,
      }) || t('common.unknown');
      const relSuffix = ` (${t(`timelineLabels.${entry.relationship_label}`)})`;
      const label = place
        ? `${typeLabel}: ${namePart}${relSuffix} · ${place}`
        : `${typeLabel}: ${namePart}${relSuffix}`;
      items.push({ id: entry.event.id, year, eventType: entry.event.event_type, label });
    }
  }
  items.sort((a, b) => a.year - b.year);
  return items;
});

const notesParagraphs = computed(() => {
  const notes = focalDisplay.value?.notes;
  if (!notes) return [];
  return notes.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
});

// When redactLiving is on and the focal person is living, suppress photos.
const suppressPhotos = computed(() =>
  props.redactLiving === true && data.value?.person?.living === true,
);

function toDisplayItem(m: { id: string; title: string | null; notes: string | null; fileRef: string | null; format: string | null; inferredDateISO: string | null }): MediaDisplayItem {
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

function isImageItem(fileRef: string | null, format: string | null): boolean {
  if (!fileRef) return false;
  const fmt = (format || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(fileRef) || /image/.test(fmt);
}

const photoItems = computed<MediaDisplayItem[]>(() => {
  if (suppressPhotos.value) return [];
  return mediaItems.value
    .filter(m => isImageItem(m.fileRef, m.format))
    .map(toDisplayItem);
});

const documentItems = computed<MediaDisplayItem[]>(() => {
  return mediaItems.value
    .filter(m => !isImageItem(m.fileRef, m.format) && !!m.fileRef)
    .map(toDisplayItem);
});

interface SourceListItem {
  id: string;
  title: string | null;
  author: string | null;
  publication_info: string | null;
  url: string | null;
  repository: string | null;
  pages: string[];
}

const uniqueSources = computed<SourceListItem[]>(() => {
  if (!data.value?.citations) return [];
  const map = new Map<string, SourceListItem>();
  for (const c of data.value.citations) {
    if (!c.source_id) continue;
    let entry = map.get(c.source_id);
    if (!entry) {
      entry = {
        id: c.source_id,
        title: c.source_title,
        author: c.source_author,
        publication_info: c.source_publication_info ?? null,
        url: c.source_url ?? null,
        repository: c.source_repository ?? null,
        pages: [],
      };
      map.set(c.source_id, entry);
    }
    if (c.page && !entry.pages.includes(c.page)) entry.pages.push(c.page);
  }
  return Array.from(map.values());
});

watch(
  () => [mediaItems.value[0]?.id ?? null, suppressPhotos.value] as const,
  async ([id, suppress]) => {
    if (!id || suppress) {
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

async function load() {
  if (!props.personId) {
    data.value = null;
    timelineEntries.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  timelineEntries.value = [];
  try {
    const [summary, researcher, timelineRes] = await Promise.all([
      window.api.reports.personSummary(props.personId) as Promise<PersonSummary | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
      window.api.reports.timeline(props.personId, {
        includeChildrenMarriages: props.includeChildrenMarriages ?? false,
        includeSiblingDeaths: props.includeSiblingDeaths ?? false,
      }) as Promise<TimelineEntry[] | null>,
    ]);
    if (!summary) {
      error.value = t('reports.personNotFound');
      return;
    }
    data.value = summary;
    researcherName.value = researcher || null;
    timelineEntries.value = timelineRes ?? [];
  } catch (err) {
    console.error('[ALifeReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.alife');
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
watch(
  () => [props.includeChildrenMarriages, props.includeSiblingDeaths] as const,
  () => {
    if (!props.personId) return;
    void load();
  },
);
</script>

<style scoped>
.a-life-report {
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

.rel-group { margin-bottom: var(--space-md); }
.rel-group-heading {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--text-secondary);
  margin: 0 0 var(--space-xs);
}
.rel-list { margin: 0; padding-left: var(--space-lg); }
.rel-list li { padding: 2px 0; }
.muted { color: var(--text-muted); }

.event-list { list-style: none; padding: 0; }
.event-list li {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}

.citation-list {
  padding-left: var(--space-lg);
  font-size: var(--font-sm);
}
.citation-list li { margin-bottom: var(--space-sm); }
.citation-list .src-title { font-weight: 600; }
.citation-list .src-line { font-size: var(--font-xs); color: var(--text-secondary); margin-top: 2px; }
.citation-list .src-url { word-break: break-all; }
.citation-list .src-pages {
  list-style: disc;
  margin: 4px 0 0 var(--space-md);
  padding-left: var(--space-md);
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
