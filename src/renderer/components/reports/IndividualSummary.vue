<template>
  <div class="individual-summary">
    <div v-if="loading" class="loading">Laddar…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="report-header">
        <h1 class="report-title">{{ data.primaryName || '(okänd)' }}</h1>
        <div class="report-subtitle">
          <span v-if="data.birthYear || data.deathYear" class="years">
            {{ data.birthYear ?? '?' }}–{{ data.deathYear ?? '' }}
          </span>
          <span class="person-id">ID: {{ props.personId.slice(0, 8) }}</span>
        </div>
        <p class="report-meta">{{ new Date().toLocaleDateString('sv-SE') }}</p>
      </div>

      <!-- All names -->
      <section class="names-section">
        <h2 class="section-heading">Namn</h2>
        <table class="names-table">
          <thead>
            <tr>
              <th>Förnamn</th>
              <th>Efternamn</th>
              <th>Typ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in data.names" :key="n.id ?? n.given_name + n.surname">
              <td>{{ n.given_name || '–' }}</td>
              <td>{{ n.surname || '–' }}</td>
              <td class="muted">{{ nameTypeLabel(n.name_type) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Events -->
      <section class="events-section">
        <h2 class="section-heading">Händelser</h2>
        <div v-if="data.events.length === 0" class="empty-section">Inga händelser registrerade.</div>
        <table v-else class="events-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Datum</th>
              <th>Plats</th>
              <th>Beskrivning</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in data.events" :key="ev.id">
              <td class="ev-type">{{ eventTypeLabel(ev.event_type) }}</td>
              <td class="ev-date">{{ ev.dateFormatted || '–' }}</td>
              <td class="ev-place">{{ ev.placeName || '–' }}</td>
              <td class="ev-desc">
                <span v-if="ev.description">{{ ev.description }}</span>
                <span v-if="ev.cause" class="muted"> ({{ ev.cause }})</span>
                <span v-if="!ev.description && !ev.cause">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Relationships -->
      <section class="relations-section">
        <h2 class="section-heading">Relationer</h2>

        <div v-if="data.parents.length > 0" class="rel-group">
          <h3 class="rel-group-heading">Föräldrar</h3>
          <ul class="rel-list">
            <li v-for="p in data.parents" :key="p.id" class="rel-entry">
              {{ p.name || '(okänd)' }}
            </li>
          </ul>
        </div>

        <div v-if="data.spouses.length > 0" class="rel-group">
          <h3 class="rel-group-heading">{{ data.spouses.length === 1 ? 'Partner' : 'Partners' }}</h3>
          <ul class="rel-list">
            <li v-for="s in data.spouses" :key="s.id" class="rel-entry">
              {{ s.name || '(okänd)' }}
              <span v-if="s.subtype" class="muted"> ({{ subtypeLabel(s.subtype) }})</span>
            </li>
          </ul>
        </div>

        <div v-if="data.children.length > 0" class="rel-group">
          <h3 class="rel-group-heading">Barn</h3>
          <ul class="rel-list">
            <li v-for="c in data.children" :key="c.id" class="rel-entry">
              {{ c.name || '(okänd)' }}
            </li>
          </ul>
        </div>

        <div
          v-if="data.parents.length === 0 && data.spouses.length === 0 && data.children.length === 0"
          class="empty-section"
        >
          Inga relationer registrerade.
        </div>
      </section>

      <!-- Notes -->
      <section v-if="data.notes" class="notes-section">
        <h2 class="section-heading">Anteckningar</h2>
        <p class="notes-text">{{ data.notes }}</p>
      </section>

      <!-- Citations / Sources -->
      <section v-if="data.sources.length > 0" class="sources-section">
        <h2 class="section-heading">Källor</h2>
        <ol class="sources-list">
          <li v-for="src in data.sources" :key="src.id" class="source-entry">
            <span class="source-title">{{ src.title }}</span>
            <span v-if="src.author" class="muted"> · {{ src.author }}</span>
            <span v-if="src.publication_info" class="muted"> · {{ src.publication_info }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatFullName } from '../../utils/nameUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }
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
  notes: string | null;
}
interface RawCitation { id: string; source_id: string; }
interface RawSource { id: string; title: string; author: string | null; publication_info: string | null; }
interface RawPlace { id: string; name: string; }

interface EnrichedEvent extends RawEvent {
  dateFormatted: string;
  placeName: string | null;
}

interface PersonRef { id: string; name: string; subtype?: string | null; }

interface SummaryData {
  primaryName: string;
  birthYear: number | null;
  deathYear: number | null;
  notes: string | null;
  names: RawName[];
  events: EnrichedEvent[];
  parents: PersonRef[];
  spouses: PersonRef[];
  children: PersonRef[];
  sources: RawSource[];
}

const props = defineProps<{ personId: string }>();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<SummaryData | null>(null);

function formatDate(ev: RawEvent): string {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return '';
  const prefixes: Record<string, string> = {
    about: 'ca ',
    before: 'före ',
    after: 'efter ',
    calculated: 'ber. ',
  };
  const prefix = ev.date_type ? (prefixes[ev.date_type] ?? '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    return `${prefix}${ev.date_value}–${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function extractYear(ev: RawEvent | undefined): number | null {
  if (!ev?.date_value) return null;
  const m = ev.date_value.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function primaryName(names: RawName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

function nameTypeLabel(t: string): string {
  const labels: Record<string, string> = {
    birth: 'Födelsenamn', married: 'Giftonamn', alias: 'Alias', aka: 'Känt som',
  };
  return labels[t] ?? t;
}

function eventTypeLabel(t: string): string {
  const labels: Record<string, string> = {
    birth: 'Född', death: 'Död', marriage: 'Vigsel', divorce: 'Skilsmässa',
    baptism: 'Dop', burial: 'Begravning', confirmation: 'Konfirmation',
    emigration: 'Emigration', immigration: 'Immigration', census: 'Folkräkning',
    occupation: 'Yrke', residence: 'Bostad', education: 'Utbildning',
    military: 'Militärtjänst', naturalization: 'Naturalisering',
    graduation: 'Examen', retirement: 'Pensionering',
    will: 'Testamente', probate: 'Bouppteckning', other: 'Övrigt',
  };
  return labels[t] ?? t;
}

function subtypeLabel(t: string): string {
  const labels: Record<string, string> = {
    marriage: 'gift', civil_union: 'registrerat partnerskap',
    cohabitation: 'sambo', unknown: 'okänd',
    biological: 'biologisk', adopted: 'adopterad',
    foster: 'fosterbarn', step: 'styvbarn',
  };
  return labels[t] ?? t;
}

async function resolvePersonName(id: string): Promise<string> {
  try {
    const names = (await window.api.persons.getNames(id)) as RawName[];
    return primaryName(names);
  } catch {
    return '(okänd)';
  }
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
      error.value = 'Personen hittades inte.';
      return;
    }

    // Enrich events: format dates, resolve places
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
          } catch {
            placeName = null;
          }
        }
        return { ...ev, dateFormatted: formatDate(ev), placeName };
      }),
    );

    // Resolve relationships into parents / spouses / children
    const parents: PersonRef[] = [];
    const spouses: PersonRef[] = [];
    const children: PersonRef[] = [];

    await Promise.all(
      rels.map(async rel => {
        if (rel.type === 'parent_child') {
          if (rel.person2_id === props.personId && rel.person1_id) {
            // This person is the child — person1 is the parent
            const name = await resolvePersonName(rel.person1_id);
            parents.push({ id: rel.person1_id, name });
          } else if (rel.person1_id === props.personId && rel.person2_id) {
            // This person is the parent — person2 is the child
            const name = await resolvePersonName(rel.person2_id);
            children.push({ id: rel.person2_id, name });
          }
        } else if (rel.type === 'couple') {
          const otherId = rel.person1_id === props.personId ? rel.person2_id : rel.person1_id;
          if (otherId) {
            const name = await resolvePersonName(otherId);
            spouses.push({ id: otherId, name, subtype: rel.subtype });
          }
        }
      }),
    );

    // Collect citations: from person + all events
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

    // Compute display name and birth/death years
    const sortedNames = [...names].sort((a, b) => a.sort_order - b.sort_order);

    const birthEv = events.find(e => e.event_type === 'birth');
    const deathEv = events.find(e => e.event_type === 'death');

    data.value = {
      primaryName: primaryName(names),
      birthYear: extractYear(birthEv),
      deathYear: extractYear(deathEv),
      notes: person.notes ?? null,
      names: sortedNames,
      events: enrichedEvents,
      parents,
      spouses,
      children,
      sources,
    };
  } catch (err) {
    console.error('[IndividualSummary] load failed:', err);
    error.value = 'Kunde inte ladda personöversikt.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.individual-summary {
  font-family: Georgia, serif;
  max-width: 720px;
}
.loading,
.error {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
.error {
  color: #c00;
}

/* Header */
.report-header {
  margin-bottom: 24px;
}
.report-title {
  font-size: 24px;
  margin: 0 0 4px;
}
.report-subtitle {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}
.years {
  font-style: italic;
}
.person-id {
  color: #aaa;
  font-size: 11px;
}
.report-meta {
  font-size: 11px;
  color: #aaa;
  margin: 0;
}

/* Sections */
.section-heading {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #444;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
  margin: 20px 0 10px;
}
.empty-section {
  font-size: 13px;
  color: #aaa;
}

/* Names table */
.names-table,
.events-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.names-table th,
.events-table th {
  text-align: left;
  font-weight: 600;
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid #e0e0e0;
  color: #333;
  font-size: 12px;
}
.names-table td,
.events-table td {
  padding: 4px 8px 4px 0;
  vertical-align: top;
  border-bottom: 1px solid #f0f0f0;
}
.muted {
  color: #888;
}

/* Events */
.ev-type {
  white-space: nowrap;
  font-weight: 500;
}
.ev-date {
  white-space: nowrap;
}
.ev-place,
.ev-desc {
  color: #444;
}

/* Relationships */
.rel-group {
  margin-bottom: 12px;
}
.rel-group-heading {
  font-size: 12px;
  font-weight: 700;
  color: #555;
  margin: 0 0 4px;
}
.rel-list {
  margin: 0;
  padding-left: 16px;
}
.rel-entry {
  font-size: 13px;
  padding: 2px 0;
}

/* Notes */
.notes-text {
  font-size: 13px;
  color: #333;
  line-height: 1.6;
  margin: 0;
  white-space: pre-line;
}

/* Sources */
.sources-list {
  margin: 0;
  padding-left: 20px;
}
.source-entry {
  font-size: 12px;
  padding: 2px 0;
  line-height: 1.5;
}
.source-title {
  color: #222;
}

@media print {
  .report-title {
    font-size: 18px;
  }
  .names-table,
  .events-table {
    font-size: 11px;
  }
  .events-section,
  .relations-section,
  .sources-section {
    break-inside: avoid;
  }
}
</style>
