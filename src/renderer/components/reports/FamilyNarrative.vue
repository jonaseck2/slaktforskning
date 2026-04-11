<template>
  <div class="family-narrative">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="report-header">
        <h1 class="report-title">{{ data.coupleTitle }}</h1>
        <p class="report-meta">{{ new Date().toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-GB') }}</p>
      </div>

      <!-- Introduction -->
      <section class="intro-section">
        <p v-for="(para, i) in introParagraphs" :key="'intro-' + i" class="narrative-paragraph">{{ para }}</p>
      </section>

      <!-- Children narratives -->
      <section v-if="data.children.length > 0" class="children-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Barn' : 'Children' }}</h2>
        <div v-for="child in data.children" :key="child.id" class="child-block">
          <h3 class="child-heading">{{ child.name || $t('common.unknown') }}</h3>
          <p class="narrative-paragraph">{{ childNarrative(child) }}</p>
        </div>
        <div v-if="data.children.length === 0" class="empty-section">
          {{ locale === 'sv' ? 'Inga barn registrerade.' : 'No children recorded.' }}
        </div>
      </section>

      <!-- Sources -->
      <section v-if="data.sources.length > 0" class="sources-section">
        <h2 class="section-heading">{{ locale === 'sv' ? 'Kallor' : 'Sources' }}</h2>
        <ol class="sources-list">
          <li v-for="src in data.sources" :key="src.id" class="source-entry">
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
  given_name: string | null; surname: string | null;
  preferred_name?: string | null; nickname?: string | null;
  name_prefix?: string | null; name_suffix?: string | null;
  name_type: string; sort_order: number;
}
interface RawEvent {
  id: string; event_type: string;
  date_type: string | null; date_value: string | null;
  date_value_end: string | null; date_original: string | null;
  place_id: string | null; description: string | null;
}
interface RawRelationship {
  id: string; type: string; subtype: string | null;
  person1_id: string | null; person2_id: string | null; notes: string | null;
}
interface RawCitation { id: string; source_id: string; }
interface RawSource { id: string; title: string; author: string | null; publication_info: string | null; }
interface RawPlace { id: string; name: string; }
interface RawPerson { id: string; sex: string; }

interface PersonSummary {
  id: string;
  name: string;
  sex: string;
  birth: string | null;
  birthPlace: string | null;
  death: string | null;
  deathPlace: string | null;
  birthYear: number | null;
  deathYear: number | null;
  marriageInfo: string | null;
}

interface FamilyData {
  coupleTitle: string;
  person1: PersonSummary | null;
  person2: PersonSummary | null;
  marriageDate: string | null;
  marriagePlace: string | null;
  notes: string | null;
  children: PersonSummary[];
  sources: RawSource[];
}

const props = defineProps<{ relationshipId: string }>();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<FamilyData | null>(null);

const locale = computed(() => i18nLocale.value === 'sv' ? 'sv' : 'en');

function formatDate(ev: RawEvent): string {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return '';
  const isSv = locale.value === 'sv';
  const prefixes: Record<string, string> = isSv
    ? { about: 'omkring ', before: 'fore ', after: 'efter ', calculated: 'beraknat ' }
    : { about: 'about ', before: 'before ', after: 'after ', calculated: 'calculated ' };
  const prefix = ev.date_type ? (prefixes[ev.date_type] ?? '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    const conj = isSv ? ' och ' : ' and ';
    return `${isSv ? 'mellan ' : 'between '}${ev.date_value}${conj}${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function extractYear(ev: RawEvent | undefined): number | null {
  if (!ev?.date_value) return null;
  const m = ev.date_value.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function primaryNameStr(names: RawName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

async function resolvePlaceName(placeId: string | null): Promise<string | null> {
  if (!placeId) return null;
  try {
    const place = (await window.api.places.get(placeId)) as RawPlace | null;
    return place?.name ?? null;
  } catch { return null; }
}

async function buildPersonSummary(personId: string): Promise<PersonSummary> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(personId) as Promise<RawPerson | null>,
    window.api.persons.getNames(personId) as Promise<RawName[]>,
    window.api.events.forPerson(personId) as Promise<RawEvent[]>,
  ]);

  const birthEv = events.find(e => e.event_type === 'birth');
  const deathEv = events.find(e => e.event_type === 'death');

  const [birthPlace, deathPlace] = await Promise.all([
    resolvePlaceName(birthEv?.place_id ?? null),
    resolvePlaceName(deathEv?.place_id ?? null),
  ]);

  return {
    id: personId,
    name: primaryNameStr(names),
    sex: person?.sex ?? 'U',
    birth: birthEv ? formatDate(birthEv) : null,
    birthPlace,
    death: deathEv ? formatDate(deathEv) : null,
    deathPlace,
    birthYear: extractYear(birthEv),
    deathYear: extractYear(deathEv),
    marriageInfo: null,
  };
}

// --- Narrative generation ---

function personBioSentence(p: PersonSummary): string {
  const isSv = locale.value === 'sv';
  const parts: string[] = [];

  if (p.birth) {
    const loc = p.birthPlace ? (isSv ? ` i ${p.birthPlace}` : ` in ${p.birthPlace}`) : '';
    if (isSv) parts.push(`${p.name} foddes ${p.birth}${loc}`);
    else parts.push(`${p.name} was born ${p.birth}${loc}`);
  } else {
    parts.push(p.name);
  }

  if (p.death) {
    const he = isSv ? (p.sex === 'F' ? 'hon' : 'han') : (p.sex === 'F' ? 'she' : 'he');
    const loc = p.deathPlace ? (isSv ? ` i ${p.deathPlace}` : ` in ${p.deathPlace}`) : '';
    const agePart = p.birthYear && p.deathYear && p.deathYear > p.birthYear
      ? (isSv ? `, vid ${p.deathYear - p.birthYear} ars alder` : `, at the age of ${p.deathYear - p.birthYear}`)
      : '';
    if (isSv) parts.push(`${he} avled ${p.death}${loc}${agePart}`);
    else parts.push(`${he} died ${p.death}${loc}${agePart}`);
  }

  return parts.join(isSv ? ' och ' : ' and ') + '.';
}

const introParagraphs = computed((): string[] => {
  if (!data.value) return [];
  const isSv = locale.value === 'sv';
  const paras: string[] = [];

  // Marriage sentence
  const p1 = data.value.person1;
  const p2 = data.value.person2;
  const md = data.value.marriageDate;
  const mp = data.value.marriagePlace;

  if (p1 && p2) {
    const loc = mp ? (isSv ? ` i ${mp}` : ` in ${mp}`) : '';
    const date = md ? (isSv ? ` den ${md}` : ` on ${md}`) : '';
    if (isSv) {
      paras.push(`${p1.name} och ${p2.name} gifte sig${date}${loc}.`);
    } else {
      paras.push(`${p1.name} and ${p2.name} were married${date}${loc}.`);
    }
  }

  // Brief bios
  if (p1) paras.push(personBioSentence(p1));
  if (p2) paras.push(personBioSentence(p2));

  if (data.value.notes) paras.push(data.value.notes);

  return paras;
});

function childNarrative(child: PersonSummary): string {
  return personBioSentence(child);
}

async function load() {
  if (!props.relationshipId) return;
  loading.value = true;
  error.value = null;
  data.value = null;

  try {
    const rel = (await window.api.relationships.get(props.relationshipId)) as RawRelationship | null;
    if (!rel) {
      error.value = locale.value === 'sv' ? 'Relationen hittades inte.' : 'Relationship not found.';
      return;
    }

    const [person1, person2] = await Promise.all([
      rel.person1_id ? buildPersonSummary(rel.person1_id) : Promise.resolve(null),
      rel.person2_id ? buildPersonSummary(rel.person2_id) : Promise.resolve(null),
    ]);

    // Marriage event
    const relEvents = (await window.api.events.forRelationship(props.relationshipId)) as RawEvent[];
    const marriageEv = relEvents.find(e => e.event_type === 'marriage');
    const marriageDate = marriageEv ? formatDate(marriageEv) : null;
    const marriagePlace = marriageEv ? await resolvePlaceName(marriageEv.place_id) : null;

    // Children
    let childIds: string[] = [];
    if (rel.person1_id) {
      const p1Rels = (await window.api.relationships.getForPerson(rel.person1_id)) as RawRelationship[];
      childIds = p1Rels
        .filter(r => r.type === 'parent_child' && r.person1_id === rel.person1_id && r.person2_id)
        .map(r => r.person2_id as string);
    }
    const children = await Promise.all(childIds.map(buildPersonSummary));

    // Sources
    const allEventIds = relEvents.map(e => e.id);
    const citationSets = await Promise.all([
      rel.person1_id ? (window.api.citations.forPerson(rel.person1_id) as Promise<RawCitation[]>) : Promise.resolve([]),
      rel.person2_id ? (window.api.citations.forPerson(rel.person2_id) as Promise<RawCitation[]>) : Promise.resolve([]),
      ...allEventIds.map(eid => window.api.citations.forEvent(eid) as Promise<RawCitation[]>),
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

    const name1 = person1?.name || '?';
    const name2 = person2?.name || '?';

    data.value = {
      coupleTitle: `${name1} & ${name2}`,
      person1,
      person2,
      marriageDate,
      marriagePlace,
      notes: rel.notes ?? null,
      children,
      sources,
    };
  } catch (err) {
    console.error('[FamilyNarrative] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = locale.value === 'sv' ? 'Kunde inte ladda familjeberattelse.' : 'Could not load family narrative.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.relationshipId, load, { immediate: true });
</script>

<style scoped>
.family-narrative {
  font-family: Georgia, serif;
  max-width: 720px;
}
.loading, .error {
  color: #888; font-size: 13px; padding: 16px 0;
}
.error { color: #c00; }

.report-header { margin-bottom: 24px; }
.report-title { font-size: 24px; margin: 0 0 4px; }
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
  margin: 0 0 12px;
}

.child-block { margin-bottom: 16px; }
.child-heading {
  font-size: 14px; font-weight: 600; color: #333;
  margin: 0 0 4px;
}

.muted { color: #888; }
.sources-list { margin: 0; padding-left: 20px; }
.source-entry { font-size: 12px; padding: 2px 0; line-height: 1.5; }
.source-title { color: #222; }

@media print {
  .report-title { font-size: 18px; }
  .narrative-paragraph { font-size: 12px; }
  .children-section, .sources-section { break-inside: avoid; }
}
</style>
