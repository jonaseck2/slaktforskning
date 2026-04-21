<template>
  <div class="a-marriage-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Cover -->
      <ReportCover
        :title="coupleTitle"
        :subtitle="marriageYear ? String(marriageYear) : ''"
        :hero-image-url="profileImageUrl"
        :researcher-name="researcherName"
      />

      <!-- Dual Life Map -->
      <section v-if="props.showLifeMap && hasAnyLifeMapPoints" class="report-section">
        <h2 class="section-heading">{{ $t('reports.amarriage.lifeMap') }}</h2>
        <div class="dual-map-grid">
          <div v-if="spouse1LifeMapPoints.length > 0" class="dual-map-cell">
            <div class="dual-map-label">{{ spouse1Name }}</div>
            <LifeMap
              :points="spouse1LifeMapPoints"
              :height="320"
              draw-path
              path-color="#2c5aa0"
              :aria-label="$t('reports.amarriage.mapSpouse1')"
            />
          </div>
          <div v-if="spouse2LifeMapPoints.length > 0" class="dual-map-cell">
            <div class="dual-map-label">{{ spouse2Name }}</div>
            <LifeMap
              :points="spouse2LifeMapPoints"
              :height="320"
              draw-path
              path-color="#8a2d2d"
              :aria-label="$t('reports.amarriage.mapSpouse2')"
            />
          </div>
        </div>
      </section>

      <!-- Shared Timeline -->
      <section v-if="sharedTimeline.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.amarriage.sharedTimeline') }}</h2>
        <TimelineBar :items="sharedTimeline" anchor-base="#event-" />
      </section>

      <!-- The Couple -->
      <section v-if="data.person1 || data.person2" class="report-section">
        <h2 class="section-heading">{{ $t('reports.amarriage.theCouple') }}</h2>
        <div class="couple-grid">
          <div v-if="data.person1" :id="'person-' + data.person1.person.id">
            <PersonMiniCard
              :person-id="data.person1.person.id"
              :given-name="spouse1NameParts.given"
              :surname="spouse1NameParts.surname"
              :sex="spouse1Sex"
              :birth-year="spouse1BirthYear"
              :death-year="spouse1DeathYear"
              :key-place="spouse1BirthPlace"
            />
          </div>
          <div v-if="data.person2" :id="'person-' + data.person2.person.id">
            <PersonMiniCard
              :person-id="data.person2.person.id"
              :given-name="spouse2NameParts.given"
              :surname="spouse2NameParts.surname"
              :sex="spouse2Sex"
              :birth-year="spouse2BirthYear"
              :death-year="spouse2DeathYear"
              :key-place="spouse2BirthPlace"
            />
          </div>
        </div>
      </section>

      <!-- Children -->
      <section v-if="data.children.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('personPanel.children') }}</h2>
        <div class="children-grid">
          <div v-for="child in childCards" :key="child.id" :id="'person-' + child.id">
            <PersonMiniCard
              :person-id="child.id"
              :given-name="child.given"
              :surname="child.surname"
              :sex="child.sex"
              :birth-year="child.birthYear"
              :death-year="child.deathYear"
              :key-place="child.birthPlace"
            />
          </div>
        </div>
      </section>

      <!-- Events -->
      <section v-if="allEvents.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.amarriage.events') }}</h2>
        <ul class="event-list">
          <li v-for="ev in allEvents" :key="ev.id" :id="'event-' + ev.id">
            <strong>{{ eventTypeLabel(ev.event_type) }}</strong>
            <span v-if="ev.personLabel" class="muted"> — {{ ev.personLabel }}</span>
            <span v-if="ev.date_display">, {{ ev.date_display }}</span>
            <span v-if="ev.place_name">, {{ ev.place_name }}</span>
            <span v-if="ev.description">. {{ ev.description }}</span>
          </li>
        </ul>
        <div v-if="props.showLifeMap && hasAnyLifeMapPoints" class="events-map dual-map-grid">
          <div v-if="spouse1LifeMapPoints.length > 0" class="dual-map-cell">
            <div class="dual-map-label">{{ spouse1Name }}</div>
            <LifeMap :points="spouse1LifeMapPoints" :height="220" draw-path path-color="#2c5aa0" />
          </div>
          <div v-if="spouse2LifeMapPoints.length > 0" class="dual-map-cell">
            <div class="dual-map-label">{{ spouse2Name }}</div>
            <LifeMap :points="spouse2LifeMapPoints" :height="220" draw-path path-color="#8a2d2d" />
          </div>
        </div>
      </section>

      <!-- Narrative (notes) -->
      <section v-if="props.showNotes && notesParagraphs.length > 0" class="report-section prose-section">
        <h2 class="section-heading">{{ $t('reports.amarriage.narrative') }}</h2>
        <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
      </section>

      <!-- Photos -->
      <section v-if="props.showPhotos && photoItems.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
        <MediaChronological :items="photoItems" :show-captions="props.showMediaCaptions" :per-page="2" :relations="personRelations" :linked-person-ids="linkedPersonIds" />
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
import LifeMap, { type LifeMapPathPoint } from './primitives/LifeMap.vue';
import TimelineBar, { type TimelineItem } from './primitives/TimelineBar.vue';
import PersonMiniCard from './primitives/PersonMiniCard.vue';
import MediaChronological, { type MediaDisplayItem } from './primitives/MediaChronological.vue';
import { useLifeMap } from '../../composables/useLifeMap';
import { useMediaChronological, type MediaEntityRef } from '../../composables/useMediaChronological';
import { formatFullName } from '../../utils/nameUtils';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  relationshipId: string;
  showLifeMap?: boolean;
  showPhotos?: boolean;
  showNotes?: boolean;
  showSources?: boolean;
  redactLiving?: boolean;
  showMediaCaptions?: boolean;
}>(), {
  showLifeMap: true,
  showPhotos: true,
  showNotes: true,
  showSources: false,
  redactLiving: false,
  showMediaCaptions: true,
});

const { t } = useI18n();
const toast = useToast();

// Types matching report_data.FamilyUnit shape via IPC
interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }
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
interface FamilyMember {
  person: RawPerson;
  names: RawPersonName[];
  birth_event: RawEvent | null;
  death_event: RawEvent | null;
}
interface RawRelationship {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
  notes: string | null;
}
interface FamilyUnit {
  relationship: RawRelationship;
  person1: FamilyMember | null;
  person2: FamilyMember | null;
  relationship_events: RawEvent[];
  children: FamilyMember[];
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
const data = ref<FamilyUnit | null>(null);
const researcherName = ref<string | null>(null);
const profileImageUrl = ref<string | null>(null);
const sources = ref<RawSource[]>([]);

// Per-spouse life maps
const spouse1IdRef = computed(() => data.value?.person1?.person.id ?? null);
const spouse2IdRef = computed(() => data.value?.person2?.person.id ?? null);
const { data: spouse1LifeMapData } = useLifeMap(spouse1IdRef);
const { data: spouse2LifeMapData } = useLifeMap(spouse2IdRef);

// Relationship media (for hero image + photos section)
const relMediaEntityRef = computed<MediaEntityRef | null>(() =>
  props.relationshipId ? { entityType: 'relationship', entityId: props.relationshipId } : null,
);
const { items: relMediaItems } = useMediaChronological(relMediaEntityRef);

// Media linked to each person — intersection = photos where both appear
const person1MediaEntityRef = computed<MediaEntityRef | null>(() =>
  data.value?.person1 ? { entityType: 'person', entityId: data.value.person1.person.id } : null,
);
const person2MediaEntityRef = computed<MediaEntityRef | null>(() =>
  data.value?.person2 ? { entityType: 'person', entityId: data.value.person2.person.id } : null,
);
const { items: person1MediaItems } = useMediaChronological(person1MediaEntityRef);
const { items: person2MediaItems } = useMediaChronological(person2MediaEntityRef);

const sharedPersonMediaIds = computed(() => {
  const p2Ids = new Set(person2MediaItems.value.map(m => m.id));
  return new Set(person1MediaItems.value.filter(m => p2Ids.has(m.id)).map(m => m.id));
});

// --- Helpers ---

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function primaryName(names: RawPersonName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

function primaryNameParts(names: RawPersonName[]): { given: string | null; surname: string | null } {
  if (!names.length) return { given: null, surname: null };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  const n = sorted[0];
  return {
    given: n.preferred_name || n.given_name || null,
    surname: n.surname || null,
  };
}

function toSex(s: string | null | undefined): 'M' | 'F' | 'U' {
  if (s === 'M' || s === 'F') return s;
  return 'U';
}

function formatDateDisplay(ev: RawEvent): string | null {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return null;
  return ev.date_value;
}

function eventTypeLabel(type: string): string {
  return t(`eventTypes.${type}`, type);
}

// --- Derived state ---

const spouse1Name = computed(() => data.value?.person1 ? primaryName(data.value.person1.names) : '');
const spouse2Name = computed(() => data.value?.person2 ? primaryName(data.value.person2.names) : '');

const spouse1NameParts = computed(() =>
  data.value?.person1 ? primaryNameParts(data.value.person1.names) : { given: null, surname: null },
);
const spouse2NameParts = computed(() =>
  data.value?.person2 ? primaryNameParts(data.value.person2.names) : { given: null, surname: null },
);

const spouse1Sex = computed<'M' | 'F' | 'U'>(() => toSex(data.value?.person1?.person.sex));
const spouse2Sex = computed<'M' | 'F' | 'U'>(() => toSex(data.value?.person2?.person.sex));

function redactedSpouseYears(
  member: FamilyMember | null,
): { birthYear: number | null; deathYear: number | null } {
  if (!member) return { birthYear: null, deathYear: null };
  const rawBirth = extractYear(member.birth_event?.date_value ?? null);
  const rawDeath = extractYear(member.death_event?.date_value ?? null);
  const r = redactPerson(
    {
      id: member.person.id,
      living: member.person.living,
      birthYear: rawBirth,
      deathYear: rawDeath,
    },
    { redactLiving: props.redactLiving === true },
  );
  return { birthYear: r.birthYear ?? null, deathYear: r.deathYear ?? null };
}

const spouse1BirthYear = computed(() => redactedSpouseYears(data.value?.person1 ?? null).birthYear);
const spouse1DeathYear = computed(() => redactedSpouseYears(data.value?.person1 ?? null).deathYear);
const spouse2BirthYear = computed(() => redactedSpouseYears(data.value?.person2 ?? null).birthYear);
const spouse2DeathYear = computed(() => redactedSpouseYears(data.value?.person2 ?? null).deathYear);

const spouse1BirthPlace = computed(() => data.value?.person1?.birth_event?.place_name ?? null);
const spouse2BirthPlace = computed(() => data.value?.person2?.birth_event?.place_name ?? null);

const coupleTitle = computed(() => {
  const n1 = spouse1Name.value || t('common.unknown');
  const n2 = spouse2Name.value || t('common.unknown');
  return `${n1} + ${n2}`;
});

const marriageEvent = computed<RawEvent | null>(() =>
  data.value?.relationship_events.find(e => e.event_type === 'marriage') ?? null,
);
const marriageYear = computed(() => extractYear(marriageEvent.value?.date_value ?? null));

const spouse1LifeMapPoints = computed<LifeMapPathPoint[]>(() =>
  spouse1LifeMapData.value.events.map(e => ({
    lat: e.lat,
    lon: e.lon,
    label: e.placeName,
    year: extractYear(e.dateISO),
  })),
);
const spouse2LifeMapPoints = computed<LifeMapPathPoint[]>(() =>
  spouse2LifeMapData.value.events.map(e => ({
    lat: e.lat,
    lon: e.lon,
    label: e.placeName,
    year: extractYear(e.dateISO),
  })),
);
const hasAnyLifeMapPoints = computed(() =>
  spouse1LifeMapPoints.value.length > 0 || spouse2LifeMapPoints.value.length > 0,
);

// Shared timeline: relationship events + each child's birth
const sharedTimeline = computed<TimelineItem[]>(() => {
  if (!data.value) return [];
  const items: TimelineItem[] = [];
  for (const ev of data.value.relationship_events) {
    const year = extractYear(ev.date_value);
    if (year == null) continue;
    items.push({ id: ev.id, year, eventType: ev.event_type, label: eventTypeLabel(ev.event_type) });
  }
  for (const child of data.value.children) {
    const year = extractYear(child.birth_event?.date_value ?? null);
    if (year == null) continue;
    items.push({
      id: child.birth_event?.id ?? `child-${child.person.id}`,
      year,
      eventType: 'birth',
      label: `${eventTypeLabel('birth')}: ${primaryName(child.names) || t('common.unknown')}`,
    });
  }
  items.sort((a, b) => a.year - b.year);
  return items;
});

interface DisplayEvent extends RawEvent {
  date_display: string | null;
  personLabel: string | null;
}

// Chronological combined events: relationship events + each spouse's birth/death.
const allEvents = computed<DisplayEvent[]>(() => {
  if (!data.value) return [];
  const out: DisplayEvent[] = [];
  for (const ev of data.value.relationship_events) {
    out.push({ ...ev, date_display: formatDateDisplay(ev), personLabel: null });
  }
  const p1 = data.value.person1;
  if (p1) {
    const label = primaryName(p1.names) || t('common.unknown');
    if (p1.birth_event) out.push({ ...p1.birth_event, date_display: formatDateDisplay(p1.birth_event), personLabel: label });
    if (p1.death_event) out.push({ ...p1.death_event, date_display: formatDateDisplay(p1.death_event), personLabel: label });
  }
  const p2 = data.value.person2;
  if (p2) {
    const label = primaryName(p2.names) || t('common.unknown');
    if (p2.birth_event) out.push({ ...p2.birth_event, date_display: formatDateDisplay(p2.birth_event), personLabel: label });
    if (p2.death_event) out.push({ ...p2.death_event, date_display: formatDateDisplay(p2.death_event), personLabel: label });
  }
  out.sort((a, b) => {
    const av = a.date_value ?? '\uFFFF';
    const bv = b.date_value ?? '\uFFFF';
    return av.localeCompare(bv);
  });
  return out;
});

const childCards = computed(() => {
  if (!data.value) return [];
  return data.value.children.map(c => {
    const parts = primaryNameParts(c.names);
    const rawBirth = extractYear(c.birth_event?.date_value ?? null);
    const rawDeath = extractYear(c.death_event?.date_value ?? null);
    const r = redactPerson(
      {
        id: c.person.id,
        living: c.person.living,
        birthYear: rawBirth,
        deathYear: rawDeath,
      },
      { redactLiving: props.redactLiving === true },
    );
    return {
      id: c.person.id,
      given: parts.given,
      surname: parts.surname,
      sex: toSex(c.person.sex),
      birthYear: r.birthYear ?? null,
      deathYear: r.deathYear ?? null,
      birthPlace: c.birth_event?.place_name ?? null,
    };
  });
});

const notesParagraphs = computed(() => {
  const notes = data.value?.relationship.notes;
  if (!notes) return [];
  return notes.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
});

const linkedPersonIds = computed<string[]>(() => {
  const ids: string[] = [];
  if (data.value?.person1) ids.push(data.value.person1.person.id);
  if (data.value?.person2) ids.push(data.value.person2.person.id);
  for (const c of data.value?.children ?? []) ids.push(c.person.id);
  return ids;
});

const personRelations = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  const p1 = data.value?.person1;
  const p2 = data.value?.person2;
  if (p1) {
    const sex = p1.person.sex;
    map[p1.person.id] = sex === 'M' ? t('reports.relations.husband')
      : sex === 'F' ? t('reports.relations.wife')
      : t('reports.relations.spouse');
  }
  if (p2) {
    const sex = p2.person.sex;
    map[p2.person.id] = sex === 'M' ? t('reports.relations.husband')
      : sex === 'F' ? t('reports.relations.wife')
      : t('reports.relations.spouse');
  }
  for (const c of data.value?.children ?? []) {
    const sex = c.person.sex;
    map[c.person.id] = sex === 'M' ? t('reports.relations.son')
      : sex === 'F' ? t('reports.relations.daughter')
      : t('reports.relations.child');
  }
  return map;
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

const suppressPhotos = computed(() => {
  if (props.redactLiving !== true) return false;
  return !!(data.value?.person1?.person.living || data.value?.person2?.person.living);
});

const photoItems = computed<MediaDisplayItem[]>(() => {
  if (suppressPhotos.value) return [];
  const seen = new Set<string>();
  const merged = [
    ...relMediaItems.value,
    ...person1MediaItems.value.filter(m => sharedPersonMediaIds.value.has(m.id)),
  ];
  return merged
    .filter(m => isImageItem(m.fileRef, m.format))
    .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
    .map(toDisplayItem);
});

const uniqueSources = computed(() => sources.value);

// --- Hero image: first relationship-linked media ---
watch(
  () => [relMediaItems.value[0]?.id ?? null, suppressPhotos.value] as const,
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

// --- Sources loader ---
async function loadSources(unit: FamilyUnit): Promise<RawSource[]> {
  const citationPromises: Promise<RawCitation[]>[] = [];
  if (unit.person1) {
    citationPromises.push(window.api.citations.forPerson(unit.person1.person.id) as Promise<RawCitation[]>);
  }
  if (unit.person2) {
    citationPromises.push(window.api.citations.forPerson(unit.person2.person.id) as Promise<RawCitation[]>);
  }
  citationPromises.push(window.api.citations.forRelationship(unit.relationship.id) as Promise<RawCitation[]>);
  for (const ev of unit.relationship_events) {
    citationPromises.push(window.api.citations.forEvent(ev.id) as Promise<RawCitation[]>);
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

async function load() {
  if (!props.relationshipId) {
    data.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  sources.value = [];
  try {
    const [unit, researcher] = await Promise.all([
      window.api.reports.familyUnit(props.relationshipId) as Promise<FamilyUnit | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    if (!unit) {
      error.value = t('reports.relationshipNotFound');
      return;
    }
    data.value = unit;
    researcherName.value = researcher || null;

    if (props.showSources) {
      try {
        sources.value = await loadSources(unit);
      } catch {
        sources.value = [];
      }
    }
  } catch (err) {
    console.error('[AMarriageReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.amarriage');
  } finally {
    loading.value = false;
  }
}

watch(() => props.relationshipId, load, { immediate: true });
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
.a-marriage-report {
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

.dual-map-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}
.dual-map-cell { display: flex; flex-direction: column; gap: var(--space-xs); }
.dual-map-label {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--text-secondary);
}

.couple-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}
.children-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-md);
}

.muted { color: var(--text-muted); }

.event-list { list-style: none; padding: 0; }
.event-list li {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.events-map { margin-top: var(--space-xl); }

.citation-list {
  padding-left: var(--space-lg);
  font-size: var(--font-sm);
}
</style>
