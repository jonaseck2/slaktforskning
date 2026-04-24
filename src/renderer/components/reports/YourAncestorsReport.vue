<template>
  <div class="your-ancestors-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="rootData && tree">
      <!-- Cover -->
      <ReportCover
        :title="$t('reports.yourAncestors.title', { generations, name: rootPrimaryName || $t('common.unknown') })"
        :subtitle="$t('reports.yourAncestors.subtitle', { name: rootPrimaryName || $t('common.unknown') })"
        :researcher-name="researcherName"
      />

      <!-- Introduction -->
      <section class="report-section">
        <p class="intro">
          {{ $t('reports.yourAncestors.introduction', {
            name: rootPrimaryName || $t('common.unknown'),
            generations,
          }) }}
        </p>
      </section>

      <!-- Full-page fan chart -->
      <section id="fan-chart-section" class="report-section fan-chart-page">
        <FanChartReport
          :person-id="personId"
          :generations="generations"
          :arc-span="270"
          :color-mode="fanColorMode"
          anchor-base="#ancestor-"
        />
      </section>

      <!-- Per-ancestor pages -->
      <section
        v-for="ancestor in ancestorList"
        :key="ancestor.ancestorKey"
        :id="'ancestor-' + ancestor.ahnentafel"
        class="report-section ancestor-page"
        :class="{ 'half-page': density === 'two' }"
      >
        <span :id="'person-' + ancestor.id" class="person-anchor"></span>
        <div class="ancestor-header">
          <PersonMiniCard
            :person-id="ancestor.id"
            :given-name="ancestor.givenName"
            :surname="ancestor.surname"
            :sex="ancestor.sex"
            :birth-year="ancestor.birthYear"
            :death-year="ancestor.deathYear"
            :key-place="ancestor.keyPlace"
            :ahnentafel="ancestor.ahnentafel"
            fan-chart-href="#fan-chart-section"
          />
        </div>
        <div v-if="ancestor.notesParagraphs.length > 0" class="prose-section">
          <p
            v-for="(para, i) in ancestor.notesParagraphs"
            :key="i"
            class="prose-paragraph"
          >{{ para }}</p>
        </div>
        <div v-if="showEvents && ancestor.events.length > 0" class="ancestor-events">
          <ul class="event-list">
            <li v-for="ev in ancestor.events.slice(0, 6)" :key="ev.id">
              <span v-if="ev.date_display" class="ev-date">{{ ev.date_display }}</span>
              <span v-else class="ev-date muted">?</span>
              <span class="ev-sep"> &mdash; </span>
              <strong>{{ eventTypeLabel(ev.event_type) }}</strong>
              <span v-if="ev.place_name">, {{ ev.place_name }}</span>
              <span v-if="ev.description">. {{ ev.description }}</span>
            </li>
          </ul>
        </div>
        <PersonLifeMap
          v-if="props.showLifeMap"
          :person-id="ancestor.id"
          :height="150"
          draw-path
        />
      </section>

      <!-- Surname index -->
      <section v-if="surnameGroups.length > 0" class="report-section surname-index">
        <h2 class="section-heading">{{ $t('reports.yourAncestors.surnameIndex') }}</h2>
        <ul class="surname-list">
          <li v-for="group in surnameGroups" :key="group.surname">
            <strong>{{ group.surname }}:</strong>
            <template v-for="(num, i) in group.ahnentafels" :key="num">
              <a :href="'#ancestor-' + num" class="report-link" @click.prevent="scrollToId('ancestor-' + num)">{{ num }}</a><span v-if="i < group.ahnentafels.length - 1">, </span>
            </template>
          </li>
        </ul>
      </section>

      <!-- Sources (optional) -->
      <section v-if="showSources && uniqueSources.length > 0" class="report-section">
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
import PersonMiniCard from './primitives/PersonMiniCard.vue';
import PersonLifeMap from './primitives/PersonLifeMap.vue';
import FanChartReport from './FanChartReport.vue';
import { formatFullName } from '../../utils/nameUtils';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  personId: string;
  generations?: number;
  colorMode?: 'bw' | 'branch' | 'sex' | 'themed';
  density?: 'one' | 'two';
  showEvents?: boolean;
  showLifeMap?: boolean;
  showExtraPhotos?: boolean;
  showSources?: boolean;
  redactLiving?: boolean;
}>(), {
  generations: 4,
  colorMode: 'themed',
  density: 'one',
  showEvents: true,
  showLifeMap: true,
  showExtraPhotos: false,
  showSources: false,
  redactLiving: false,
});

const { t } = useI18n();
const toast = useToast();

// --- Types matching report_data.AncestorNode shape via IPC ---
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

interface RawPerson {
  id: string;
  sex: string;
  living: boolean;
  notes: string | null;
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

interface AncestorNode {
  person: RawPerson;
  names: RawPersonName[];
  birth_event: RawEvent | null;
  death_event: RawEvent | null;
  marriage_event: RawEvent | null;
  father: AncestorNode | null;
  mother: AncestorNode | null;
}

// PersonSummary (only the fields we use for the root)
interface PersonSummary {
  person: RawPerson;
  names: RawPersonName[];
  events: RawEvent[];
  citations: Array<{
    id: string;
    source_id: string;
    source_title: string | null;
    source_author: string | null;
  }>;
}

interface DisplayEvent extends RawEvent {
  date_display: string | null;
}

interface AncestorListItem {
  ancestorKey: string;
  ahnentafel: number;
  id: string;
  givenName: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  keyPlace: string | null;
  notesParagraphs: string[];
  events: DisplayEvent[];
}

interface SurnameGroup {
  surname: string;
  ahnentafels: number[];
}

interface SourceRef {
  id: string;
  title: string | null;
  author: string | null;
}

// --- State ---
const loading = ref(false);
const error = ref<string | null>(null);
const tree = ref<AncestorNode | null>(null);
const rootData = ref<PersonSummary | null>(null);
const researcherName = ref<string | null>(null);

const generations = computed(() => props.generations);
const density = computed(() => props.density);
const showEvents = computed(() => props.showEvents);
const showSources = computed(() => props.showSources);

// FanChartReport accepts bw | branch | sex; map the extra 'themed' option to 'branch'.
const fanColorMode = computed<'bw' | 'branch' | 'sex'>(() => {
  const m = props.colorMode;
  if (m === 'bw' || m === 'branch' || m === 'sex') return m;
  return 'branch';
});

// --- Helpers ---

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function toSex(s: string | null | undefined): 'M' | 'F' | 'U' {
  if (s === 'M' || s === 'F') return s;
  return 'U';
}

function primaryNameParts(names: RawPersonName[]): {
  given: string | null;
  surname: string | null;
  full: string;
} {
  if (!names.length) return { given: null, surname: null, full: '' };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  const n = sorted[0];
  return {
    given: n.preferred_name || n.given_name || null,
    surname: n.surname || null,
    full: formatFullName(n) || '',
  };
}

function formatDateDisplay(ev: RawEvent | null): string | null {
  if (!ev) return null;
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

function splitParagraphs(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return notes.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

// --- Derived: root display name ---
const rootPrimaryName = computed(() => {
  if (!rootData.value) return '';
  return primaryNameParts(rootData.value.names).full;
});

// --- Flatten ancestor tree to ordered list by ahnentafel (excluding root) ---
function flattenAncestorTree(root: AncestorNode | null, redactLiving: boolean): AncestorListItem[] {
  if (!root) return [];
  const out: AncestorListItem[] = [];
  function walk(node: AncestorNode | null, ahnentafel: number) {
    if (!node) return;
    if (ahnentafel >= 2) {
      const parts = primaryNameParts(node.names);
      const keyPlace = node.birth_event?.place_name ?? node.death_event?.place_name ?? null;
      const events: DisplayEvent[] = [];
      if (node.birth_event) {
        events.push({ ...node.birth_event, date_display: formatDateDisplay(node.birth_event) });
      }
      if (node.marriage_event) {
        events.push({ ...node.marriage_event, date_display: formatDateDisplay(node.marriage_event) });
      }
      if (node.death_event) {
        events.push({ ...node.death_event, date_display: formatDateDisplay(node.death_event) });
      }
      const rawBirth = extractYear(node.birth_event?.date_value ?? null);
      const rawDeath = extractYear(node.death_event?.date_value ?? null);
      const redacted = redactPerson(
        {
          id: node.person.id,
          living: node.person.living,
          birthYear: rawBirth,
          deathYear: rawDeath,
          notes: node.person.notes,
        },
        { redactLiving },
      );
      out.push({
        ancestorKey: `${ahnentafel}-${node.person.id}`,
        ahnentafel,
        id: node.person.id,
        givenName: parts.given,
        surname: parts.surname,
        sex: toSex(node.person.sex),
        birthYear: redacted.birthYear ?? null,
        deathYear: redacted.deathYear ?? null,
        keyPlace,
        notesParagraphs: splitParagraphs(redacted.notes),
        events,
      });
    }
    walk(node.father, ahnentafel * 2);
    walk(node.mother, ahnentafel * 2 + 1);
  }
  walk(root, 1);
  return out.sort((a, b) => a.ahnentafel - b.ahnentafel);
}

const ancestorList = computed<AncestorListItem[]>(() =>
  flattenAncestorTree(tree.value, props.redactLiving === true),
);

// --- Surname groups ---
const surnameGroups = computed<SurnameGroup[]>(() => {
  const map = new Map<string, number[]>();
  for (const a of ancestorList.value) {
    const sn = (a.surname || '').trim() || '\u2014';
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push(a.ahnentafel);
  }
  const groups: SurnameGroup[] = [];
  for (const [surname, ahnentafels] of map.entries()) {
    ahnentafels.sort((a, b) => a - b);
    groups.push({ surname, ahnentafels });
  }
  groups.sort((a, b) => a.surname.localeCompare(b.surname));
  return groups;
});

// --- Sources (optional) ---
const uniqueSources = computed<SourceRef[]>(() => {
  if (!rootData.value) return [];
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const c of rootData.value.citations) {
    if (!c.source_id || seen.has(c.source_id)) continue;
    seen.add(c.source_id);
    out.push({ id: c.source_id, title: c.source_title, author: c.source_author });
  }
  return out;
});

// --- Load ---
async function load() {
  if (!props.personId) {
    tree.value = null;
    rootData.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const [treeResult, summary, researcher] = await Promise.all([
      window.api.reports.ancestorTree(props.personId, generations.value) as Promise<AncestorNode | null>,
      window.api.reports.personSummary(props.personId) as Promise<PersonSummary | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    if (!treeResult || !summary) {
      error.value = t('reports.personNotFound');
      tree.value = null;
      rootData.value = null;
      return;
    }
    tree.value = treeResult;
    rootData.value = summary;
    researcherName.value = researcher || null;
  } catch (err) {
    console.error('[YourAncestorsReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.yourAncestors');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.personId, props.generations],
  load,
  { immediate: true },
);

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<style scoped>
.your-ancestors-report {
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

.intro {
  font-family: var(--report-serif-stack);
  line-height: var(--report-prose-leading);
  font-size: 1.1rem;
}

.fan-chart-page {
  page-break-after: always;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ancestor-page {
  page-break-after: always;
}
.ancestor-page.half-page {
  page-break-after: auto;
  min-height: 45vh;
  border-bottom: 1px dashed var(--surface-border-subtle);
}
.ancestor-header { margin-bottom: var(--space-md); }
.person-anchor { display: block; height: 0; overflow: hidden; }

.prose-section {
  font-family: var(--report-serif-stack);
  line-height: var(--report-prose-leading);
  margin-top: var(--space-lg);
}
.prose-paragraph {
  margin-bottom: var(--space-md);
}

.ancestor-events { margin-top: var(--space-lg); }
.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.event-list li {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  font-size: var(--font-sm);
}
.ev-date { white-space: nowrap; }
.ev-sep { color: var(--text-muted); }

.surname-index .surname-list {
  list-style: none;
  padding: 0;
  margin: 0;
  columns: 2;
  column-gap: var(--space-xl);
  font-size: var(--font-sm);
}
.surname-index .surname-list li {
  padding: 2px 0;
  break-inside: avoid;
}

.citation-list {
  padding-left: var(--space-lg);
  font-size: var(--font-sm);
}
.muted { color: var(--text-muted); }

.report-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--surface-border-subtle);
  transition: border-color 0.15s, color 0.15s;
}
.report-link:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

@media print {
  .report-link {
    border-bottom: none;
  }
}
</style>
