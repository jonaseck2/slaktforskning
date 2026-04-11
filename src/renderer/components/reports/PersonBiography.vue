<template>
  <div class="person-biography">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="report-header">
        <h1 class="report-title">{{ data.primaryName || $t('common.unknown') }}</h1>
        <div class="report-subtitle">
          <span v-if="data.birthYear || data.deathYear" class="years">
            {{ data.birthYear ?? '?' }}&ndash;{{ data.deathYear ?? '' }}
          </span>
        </div>
        <p class="report-meta">{{ new Date().toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-GB') }}</p>
      </div>

      <!-- Narrative: Life Events -->
      <section class="narrative-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Levnadsberattelse' : 'Life Story' }}</h2>
        <div v-if="narrativeParagraphs.length === 0" class="empty-section">
          {{ locale === 'sv' ? 'Inga handelser registrerade.' : 'No events recorded.' }}
        </div>
        <p v-for="(para, i) in narrativeParagraphs" :key="i" class="narrative-paragraph">{{ para }}</p>
      </section>

      <!-- Family -->
      <section class="family-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Familj' : 'Family' }}</h2>

        <div v-if="data.parents.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ locale === 'sv' ? 'Foraldrar' : 'Parents' }}</h3>
          <ul class="rel-list">
            <li v-for="p in data.parents" :key="p.id">{{ p.name || $t('common.unknown') }}</li>
          </ul>
        </div>

        <div v-if="data.spouses.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ locale === 'sv' ? 'Partner' : 'Partners' }}</h3>
          <ul class="rel-list">
            <li v-for="s in data.spouses" :key="s.id">
              {{ s.name || $t('common.unknown') }}
              <span v-if="s.subtype" class="muted"> ({{ subtypeLabel(s.subtype) }})</span>
            </li>
          </ul>
        </div>

        <div v-if="data.children.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ locale === 'sv' ? 'Barn' : 'Children' }}</h3>
          <ul class="rel-list">
            <li v-for="c in data.children" :key="c.id">{{ c.name || $t('common.unknown') }}</li>
          </ul>
        </div>

        <div v-if="data.parents.length === 0 && data.spouses.length === 0 && data.children.length === 0" class="empty-section">
          {{ locale === 'sv' ? 'Inga relationer registrerade.' : 'No relationships recorded.' }}
        </div>
      </section>

      <!-- Notes -->
      <section v-if="data.notes" class="notes-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Anteckningar' : 'Notes' }}</h2>
        <p class="notes-text">{{ data.notes }}</p>
      </section>

      <!-- Sources -->
      <section v-if="data.sources.length > 0" class="sources-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Kallor' : 'Sources' }}</h2>
        <ol class="sources-list">
          <li v-for="(src, i) in data.sources" :key="src.id" class="source-entry">
            <span class="source-title">{{ src.title }}</span>
            <span v-if="src.author" class="muted"> &middot; {{ src.author }}</span>
            <span v-if="src.publication_info" class="muted"> &middot; {{ src.publication_info }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatFullName } from '../../utils/nameUtils';
import { useToast } from '../../composables/useToast';

const { t, locale: i18nLocale } = useI18n();
const toast = useToast();

interface RawName {
  id?: string;
  given_name: string | null;
  surname: string | null;
  name_type: string;
  sort_order: number;
  preferred_name: string | null;
  nickname?: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
}
interface RawEvent {
  id: string;
  event_type: string;
  date_type: string | null;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string | null;
  place_id: string | null;
  description: string | null;
  cause: string | null;
}
interface RawRelationship {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
}
interface RawCitation { id: string; source_id: string; }
interface RawSource { id: string; title: string; author: string | null; publication_info: string | null; }
interface RawPlace { id: string; name: string; }
interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }

interface PersonRef { id: string; name: string; subtype?: string | null; }
interface EnrichedEvent extends RawEvent { placeName: string | null; }

interface BiographyData {
  primaryName: string;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  notes: string | null;
  events: EnrichedEvent[];
  parents: PersonRef[];
  spouses: PersonRef[];
  children: PersonRef[];
  sources: RawSource[];
}

const props = defineProps<{ personId: string }>();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<BiographyData | null>(null);

const locale = computed(() => i18nLocale.value === 'sv' ? 'sv' : 'en');

// --- Prose generation ---

function formatDateNarrative(ev: RawEvent): string {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return '';
  const isSv = locale.value === 'sv';
  const prefixes: Record<string, Record<string, string>> = {
    sv: { about: 'omkring ', before: 'fore ', after: 'efter ', calculated: 'beraknat ' },
    en: { about: 'about ', before: 'before ', after: 'after ', calculated: 'calculated ' },
  };
  const prefix = ev.date_type ? (prefixes[locale.value]?.[ev.date_type] ?? '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    const conj = isSv ? ' och ' : ' and ';
    return `${isSv ? 'mellan ' : 'between '}${ev.date_value}${conj}${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function formatAge(birthYear: number | null, eventYear: number | null): string | null {
  if (!birthYear || !eventYear || eventYear <= birthYear) return null;
  const age = eventYear - birthYear;
  if (locale.value === 'sv') return `vid ${age} ars alder`;
  return `at the age of ${age}`;
}

function extractYear(ev: RawEvent | undefined): number | null {
  if (!ev?.date_value) return null;
  const m = ev.date_value.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function eventToSentence(ev: EnrichedEvent, personName: string, sex: string, birthYear: number | null): string {
  const isSv = locale.value === 'sv';
  const date = formatDateNarrative(ev);
  const place = ev.placeName;
  const eventYear = extractYear(ev);
  const ageSuffix = formatAge(birthYear, eventYear);

  // Pronouns
  const he = isSv ? (sex === 'F' ? 'hon' : 'han') : (sex === 'F' ? 'she' : 'he');
  const He = he.charAt(0).toUpperCase() + he.slice(1);

  const locationPhrase = place
    ? (isSv ? ` i ${place}` : ` in ${place}`)
    : '';
  const datePhrase = date
    ? (isSv ? ` den ${date}` : ` on ${date}`)
    : '';
  const agePhrase = ageSuffix ? `, ${ageSuffix}` : '';

  switch (ev.event_type) {
    case 'birth':
      if (isSv) return `${personName} foddes${datePhrase}${locationPhrase}.`;
      return `${personName} was born${datePhrase}${locationPhrase}.`;
    case 'baptism':
      if (isSv) return `${He} doptes${datePhrase}${locationPhrase}.`;
      return `${He} was baptized${datePhrase}${locationPhrase}.`;
    case 'confirmation':
      if (isSv) return `${He} konfirmerades${datePhrase}${locationPhrase}.`;
      return `${He} was confirmed${datePhrase}${locationPhrase}.`;
    case 'death':
      if (isSv) return `${He} avled${datePhrase}${locationPhrase}${agePhrase}.`;
      return `${He} died${datePhrase}${locationPhrase}${agePhrase}.`;
    case 'burial':
      if (isSv) return `${He} begravdes${datePhrase}${locationPhrase}.`;
      return `${He} was buried${datePhrase}${locationPhrase}.`;
    case 'marriage':
      if (isSv) return `${He} gifte sig${datePhrase}${locationPhrase}.`;
      return `${He} married${datePhrase}${locationPhrase}.`;
    case 'divorce':
      if (isSv) return `${He} skilde sig${datePhrase}.`;
      return `${He} divorced${datePhrase}.`;
    case 'emigration':
      if (isSv) return `${He} emigrerade${datePhrase}${locationPhrase}.`;
      return `${He} emigrated${datePhrase}${locationPhrase}.`;
    case 'immigration':
      if (isSv) return `${He} immigrerade${datePhrase}${locationPhrase}.`;
      return `${He} immigrated${datePhrase}${locationPhrase}.`;
    case 'census':
      if (isSv) return `${He} forekom i folkrakning${datePhrase}${locationPhrase}.`;
      return `${He} appeared in census${datePhrase}${locationPhrase}.`;
    case 'occupation':
      if (ev.description) {
        if (isSv) return `${He} var ${ev.description}${datePhrase}${locationPhrase}.`;
        return `${He} was ${ev.description}${datePhrase}${locationPhrase}.`;
      }
      if (isSv) return `${He} hade yrke registrerat${datePhrase}.`;
      return `${He} had an occupation recorded${datePhrase}.`;
    case 'residence':
      if (isSv) return `${He} bodde${locationPhrase}${datePhrase}.`;
      return `${He} resided${locationPhrase}${datePhrase}.`;
    case 'education':
      if (isSv) return `${He} studerade${locationPhrase}${datePhrase}.`;
      return `${He} studied${locationPhrase}${datePhrase}.`;
    case 'military':
      if (isSv) return `${He} gjorde militartjanst${datePhrase}${locationPhrase}.`;
      return `${He} served in the military${datePhrase}${locationPhrase}.`;
    case 'graduation':
      if (isSv) return `${He} examinerades${datePhrase}${locationPhrase}.`;
      return `${He} graduated${datePhrase}${locationPhrase}.`;
    case 'retirement':
      if (isSv) return `${He} pensionerades${datePhrase}.`;
      return `${He} retired${datePhrase}.`;
    case 'will':
      if (isSv) return `${He} upprattade testamente${datePhrase}.`;
      return `${He} made a will${datePhrase}.`;
    case 'probate':
      if (isSv) return `Bouppteckning gjordes${datePhrase}${locationPhrase}.`;
      return `Probate was conducted${datePhrase}${locationPhrase}.`;
    default: {
      const desc = ev.description ? `: ${ev.description}` : '';
      if (isSv) return `${He} har en registrerad handelse (${ev.event_type})${datePhrase}${locationPhrase}${desc}.`;
      return `${He} has a recorded event (${ev.event_type})${datePhrase}${locationPhrase}${desc}.`;
    }
  }
}

const narrativeParagraphs = computed(() => {
  if (!data.value) return [];
  const { events, primaryName: name, sex, birthYear } = data.value;
  if (events.length === 0) return [];
  const sentences = events.map(ev => eventToSentence(ev, name, sex, birthYear));
  // Group sentences into paragraphs of ~3
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(' '));
  }
  return paragraphs;
});

function subtypeLabel(st: string): string {
  const labels: Record<string, Record<string, string>> = {
    sv: { marriage: 'gift', civil_union: 'registrerat partnerskap', cohabitation: 'sambo', biological: 'biologisk', adopted: 'adopterad', foster: 'fosterbarn', step: 'styvbarn' },
    en: { marriage: 'married', civil_union: 'civil union', cohabitation: 'cohabitation', biological: 'biological', adopted: 'adopted', foster: 'foster', step: 'step' },
  };
  return labels[locale.value]?.[st] ?? st;
}

function primaryNameStr(names: RawName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

async function resolvePersonName(id: string): Promise<string> {
  try {
    const names = (await window.api.persons.getNames(id)) as RawName[];
    return primaryNameStr(names);
  } catch { return '(?)'; }
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  error.value = null;
  data.value = null;

  try {
    const [person, names, events, rels] = await Promise.all([
      window.api.persons.get(props.personId) as Promise<RawPerson | null>,
      window.api.persons.getNames(props.personId) as Promise<RawName[]>,
      window.api.events.forPerson(props.personId) as Promise<RawEvent[]>,
      window.api.relationships.getForPerson(props.personId) as Promise<RawRelationship[]>,
    ]);

    if (!person) {
      error.value = locale.value === 'sv' ? 'Personen hittades inte.' : 'Person not found.';
      return;
    }

    const sortedEvents = [...events].sort((a, b) => {
      const av = a.date_value ?? '\uFFFF';
      const bv = b.date_value ?? '\uFFFF';
      return av.localeCompare(bv);
    });

    const enrichedEvents: EnrichedEvent[] = await Promise.all(
      sortedEvents.map(async ev => {
        let placeName: string | null = null;
        if (ev.place_id) {
          try {
            const place = (await window.api.places.get(ev.place_id)) as RawPlace | null;
            placeName = place?.name ?? null;
          } catch { /* ignore */ }
        }
        return { ...ev, placeName };
      }),
    );

    const parents: PersonRef[] = [];
    const spouses: PersonRef[] = [];
    const children: PersonRef[] = [];

    await Promise.all(
      rels.map(async rel => {
        if (rel.type === 'parent_child') {
          if (rel.person2_id === props.personId && rel.person1_id) {
            parents.push({ id: rel.person1_id, name: await resolvePersonName(rel.person1_id) });
          } else if (rel.person1_id === props.personId && rel.person2_id) {
            children.push({ id: rel.person2_id, name: await resolvePersonName(rel.person2_id) });
          }
        } else if (rel.type === 'couple') {
          const otherId = rel.person1_id === props.personId ? rel.person2_id : rel.person1_id;
          if (otherId) {
            spouses.push({ id: otherId, name: await resolvePersonName(otherId), subtype: rel.subtype });
          }
        }
      }),
    );

    // Collect sources
    const citationSets = await Promise.all([
      window.api.citations.forPerson(props.personId) as Promise<RawCitation[]>,
      ...events.map(ev => window.api.citations.forEvent(ev.id) as Promise<RawCitation[]>),
    ]);
    const allCitations = citationSets.flat();
    const seenSourceIds = new Set<string>();
    const uniqueSourceIds: string[] = [];
    for (const c of allCitations) {
      if (!seenSourceIds.has(c.source_id)) {
        seenSourceIds.add(c.source_id);
        uniqueSourceIds.push(c.source_id);
      }
    }
    const sources = (
      await Promise.all(
        uniqueSourceIds.map(sid =>
          (window.api.sources.get(sid) as Promise<RawSource | null>).catch(() => null),
        ),
      )
    ).filter((s): s is RawSource => s !== null);

    const birthEv = events.find(e => e.event_type === 'birth');
    const deathEv = events.find(e => e.event_type === 'death');

    data.value = {
      primaryName: primaryNameStr(names),
      sex: person.sex,
      birthYear: extractYear(birthEv),
      deathYear: extractYear(deathEv),
      notes: person.notes ?? null,
      events: enrichedEvents,
      parents,
      spouses,
      children,
      sources,
    };
  } catch (err) {
    console.error('[PersonBiography] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = locale.value === 'sv' ? 'Kunde inte ladda biografi.' : 'Could not load biography.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.person-biography {
  font-family: Georgia, serif;
  max-width: 720px;
}
.loading, .error {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
.error { color: #c00; }

.report-header { margin-bottom: 24px; }
.report-title { font-size: 24px; margin: 0 0 4px; }
.report-subtitle {
  display: flex; gap: 16px;
  font-size: 13px; color: #555; margin-bottom: 4px;
}
.years { font-style: italic; }
.report-meta { font-size: 11px; color: #aaa; margin: 0; }

.section-heading {
  font-size: 13px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; color: #444;
  border-bottom: 1px solid #ccc; padding-bottom: 4px;
  margin: 20px 0 10px;
}
.empty-section { font-size: 13px; color: #aaa; }

.narrative-paragraph {
  font-size: 14px; line-height: 1.7; color: #222;
  margin: 0 0 12px; text-indent: 1.5em;
}
.narrative-paragraph:first-child { text-indent: 0; }

.rel-group { margin-bottom: 12px; }
.rel-group-heading { font-size: 12px; font-weight: 700; color: #555; margin: 0 0 4px; }
.rel-list { margin: 0; padding-left: 16px; }
.rel-list li { font-size: 13px; padding: 2px 0; }
.muted { color: #888; }

.notes-text {
  font-size: 13px; color: #333; line-height: 1.6; margin: 0; white-space: pre-line;
}

.sources-list { margin: 0; padding-left: 20px; }
.source-entry { font-size: 12px; padding: 2px 0; line-height: 1.5; }
.source-title { color: #222; }

@media print {
  .report-title { font-size: 18px; }
  .narrative-paragraph { font-size: 12px; }
  .family-section, .sources-section { break-inside: avoid; }
}
</style>
