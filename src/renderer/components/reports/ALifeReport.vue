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
import PersonLifeMap from './primitives/PersonLifeMap.vue';
import TimelineBar, { type TimelineItem } from './primitives/TimelineBar.vue';
import MediaChronological, { type MediaDisplayItem } from './primitives/MediaChronological.vue';
import { useMediaChronological, type MediaEntityRef } from '../../composables/useMediaChronological';
import { formatFullName } from '../../utils/nameUtils';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  personId: string;
  showLifeMap?: boolean;
  showPhotos?: boolean;
  showDocuments?: boolean;
  showSources?: boolean;
  showNotes?: boolean;
  redactLiving?: boolean;
  showMediaCaptions?: boolean;
  showMediaNotes?: boolean;
}>(), {
  showLifeMap: true,
  showPhotos: true,
  showDocuments: false,
  showSources: false,
  showNotes: true,
  redactLiving: false,
  showMediaCaptions: true,
  showMediaNotes: true,
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
const childBirthItems = ref<TimelineItem[]>([]);
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
  if (!data.value) return [];
  const items: TimelineItem[] = [];
  for (const ev of data.value.events) {
    const year = extractYear(ev.date_value);
    if (year == null) continue;
    const place = ev.place_name;
    const label = place
      ? `${eventTypeLabel(ev.event_type)} · ${place}`
      : eventTypeLabel(ev.event_type);
    items.push({ id: ev.id, year, eventType: ev.event_type, label });
  }
  for (const item of childBirthItems.value) {
    items.push(item);
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

const uniqueSources = computed(() => {
  if (!data.value?.citations) return [];
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string | null; author: string | null }> = [];
  for (const c of data.value.citations) {
    if (!c.source_id || seen.has(c.source_id)) continue;
    seen.add(c.source_id);
    out.push({ id: c.source_id, title: c.source_title, author: c.source_author });
  }
  return out;
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
    childBirthItems.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  childBirthItems.value = [];
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

    // Fetch birth/adoption events for each child to show on this person's timeline
    const childRels = summary.relationships.filter(
      (r: RawRelSummary) => r.type === 'parent_child' && r.person1_id === props.personId && !!r.other_person_id,
    );
    if (childRels.length > 0) {
      type ChildEvent = { id: string; event_type: string; date_value: string | null; place_name: string | null };
      const childEventArrays = await Promise.all(
        childRels.map((r: RawRelSummary) =>
          (window.api.events.forPerson(r.other_person_id!) as Promise<ChildEvent[]>).catch(() => [] as ChildEvent[]),
        ),
      );
      const items: TimelineItem[] = [];
      for (let i = 0; i < childRels.length; i++) {
        const r = childRels[i];
        const childName = personNameFrom(r.other_person_names);
        const events = childEventArrays[i];
        const birthEv = events.find(e => e.event_type === 'birth' || e.event_type === 'foster_placement');
        if (!birthEv) continue;
        const year = extractYear(birthEv.date_value);
        if (year == null) continue;
        const place = birthEv.place_name;
        const typeLabel = eventTypeLabel(birthEv.event_type);
        const namePart = childName || t('common.unknown');
        const label = place ? `${typeLabel}: ${namePart} · ${place}` : `${typeLabel}: ${namePart}`;
        items.push({ id: birthEv.id, year, eventType: birthEv.event_type, label });
      }
      childBirthItems.value = items;
    }
  } catch (err) {
    console.error('[ALifeReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.alife');
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
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
</style>
