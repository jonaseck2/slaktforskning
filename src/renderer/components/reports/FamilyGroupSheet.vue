<template>
  <div class="family-group-sheet">
    <div v-if="loading" class="loading">Laddar…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <h1 class="report-title">Familjeblad</h1>
      <p class="report-meta">{{ new Date().toLocaleDateString('sv-SE') }}</p>

      <!-- Spouses -->
      <table class="person-table">
        <tbody>
          <tr v-if="data.person1">
            <th>{{ data.person1.role }}</th>
            <td class="person-name">{{ data.person1.name || '(okänd)' }}</td>
            <td v-if="data.person1.birth">Född: {{ data.person1.birth }}</td>
            <td v-else><span class="empty-cell">–</span></td>
            <td v-if="data.person1.death">Död: {{ data.person1.death }}</td>
            <td v-else><span class="empty-cell">–</span></td>
          </tr>
          <tr v-if="data.person2">
            <th>{{ data.person2.role }}</th>
            <td class="person-name">{{ data.person2.name || '(okänd)' }}</td>
            <td v-if="data.person2.birth">Född: {{ data.person2.birth }}</td>
            <td v-else><span class="empty-cell">–</span></td>
            <td v-if="data.person2.death">Död: {{ data.person2.death }}</td>
            <td v-else><span class="empty-cell">–</span></td>
          </tr>
        </tbody>
      </table>

      <!-- Marriage -->
      <div v-if="data.marriage" class="marriage-row">
        <span class="label">Vigsel:</span>
        <span>{{ data.marriage }}</span>
      </div>

      <!-- Relationship notes -->
      <div v-if="data.notes" class="notes-row">
        <span class="label">Anteckningar:</span>
        <span>{{ data.notes }}</span>
      </div>

      <!-- Children -->
      <section class="children-section">
        <h2 class="section-heading">Barn</h2>
        <div v-if="data.children.length === 0" class="empty-section">Inga barn registrerade.</div>
        <ol v-else class="children-list">
          <li v-for="child in data.children" :key="child.id" class="child-entry">
            <span class="child-name">{{ child.name || '(okänd)' }}</span>
            <span v-if="child.birth || child.death" class="child-years">
              {{ child.birth ? 'f. ' + child.birth : '' }}
              {{ child.birth && child.death ? ' · ' : '' }}
              {{ child.death ? 'd. ' + child.death : '' }}
            </span>
          </li>
        </ol>
      </section>

      <!-- Sources -->
      <section v-if="data.sources.length > 0" class="sources-section">
        <h2 class="section-heading">Källor</h2>
        <ol class="sources-list">
          <li v-for="src in data.sources" :key="src.id" class="source-entry">
            <span class="source-title">{{ src.title }}</span>
            <span v-if="src.author" class="source-author"> · {{ src.author }}</span>
            <span v-if="src.publication_info" class="source-pub"> · {{ src.publication_info }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatFullName } from '../../../utils/nameUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RawPerson { id: string; sex: string; living: boolean; notes: string | null; }
interface RawName { given_name: string | null; surname: string | null; preferred_name?: string | null; nickname?: string | null; name_prefix?: string | null; name_suffix?: string | null; name_type: string; sort_order: number; }
interface RawEvent {
  id: string;
  event_type: string;
  date_type: string | null;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string | null;
  place_id: string | null;
  description: string | null;
}
interface RawRelationship {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
  notes: string | null;
}
interface RawCitation { id: string; source_id: string; page: string | null; confidence: number | null; }
interface RawSource { id: string; title: string; author: string | null; publication_info: string | null; }
interface RawPlace { id: string; name: string; }

interface PersonData {
  role: string;
  name: string;
  birth: string | null;
  death: string | null;
}

interface ChildData {
  id: string;
  name: string;
  birth: string | null;
  death: string | null;
}

interface SourceData {
  id: string;
  title: string;
  author: string | null;
  publication_info: string | null;
}

interface SheetData {
  person1: PersonData | null;
  person2: PersonData | null;
  marriage: string | null;
  notes: string | null;
  children: ChildData[];
  sources: SourceData[];
}

const props = defineProps<{ relationshipId: string }>();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<SheetData | null>(null);

function primaryName(names: RawName[]): string {
  if (!names.length) return '';
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return formatFullName(sorted[0]);
}

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

async function formatEventWithPlace(ev: RawEvent): Promise<string> {
  const datePart = formatDate(ev);
  if (!ev.place_id) return datePart;
  try {
    const place = (await window.api.places.get(ev.place_id)) as RawPlace | null;
    const placePart = place ? place.name : '';
    return [datePart, placePart].filter(Boolean).join(', ');
  } catch {
    return datePart;
  }
}

async function buildPersonData(personId: string, role: string): Promise<PersonData> {
  const [names, events] = await Promise.all([
    window.api.persons.getNames(personId) as Promise<RawName[]>,
    window.api.events.forPerson(personId) as Promise<RawEvent[]>,
  ]);
  const birthEv = events.find(e => e.event_type === 'birth') ?? null;
  const deathEv = events.find(e => e.event_type === 'death') ?? null;
  const [birth, death] = await Promise.all([
    birthEv ? formatEventWithPlace(birthEv) : Promise.resolve(null),
    deathEv ? formatEventWithPlace(deathEv) : Promise.resolve(null),
  ]);
  return { role, name: primaryName(names), birth, death };
}

async function buildChildData(childId: string): Promise<ChildData> {
  const [names, events] = await Promise.all([
    window.api.persons.getNames(childId) as Promise<RawName[]>,
    window.api.events.forPerson(childId) as Promise<RawEvent[]>,
  ]);
  const birthEv = events.find(e => e.event_type === 'birth') ?? null;
  const deathEv = events.find(e => e.event_type === 'death') ?? null;
  const birth = birthEv ? formatDate(birthEv) : null;
  const death = deathEv ? formatDate(deathEv) : null;
  return { id: childId, name: primaryName(names), birth, death };
}

async function load() {
  if (!props.relationshipId) return;
  loading.value = true;
  error.value = null;
  data.value = null;

  try {
    const rel = (await window.api.relationships.get(props.relationshipId)) as RawRelationship | null;
    if (!rel) {
      error.value = 'Relationen hittades inte.';
      return;
    }

    // Build person data for both sides
    const [person1Data, person2Data] = await Promise.all([
      rel.person1_id
        ? buildPersonData(rel.person1_id, rel.subtype === 'marriage' ? 'Make/Maka' : 'Partner 1')
        : Promise.resolve(null),
      rel.person2_id
        ? buildPersonData(rel.person2_id, rel.subtype === 'marriage' ? 'Make/Maka' : 'Partner 2')
        : Promise.resolve(null),
    ]);

    // Assign roles based on sex — but we already set generic roles above, try to refine
    // (we don't have sex easily here without another fetch — keep generic for simplicity)

    // Marriage event from the couple relationship
    const relEvents = (await window.api.events.forRelationship(props.relationshipId)) as RawEvent[];
    const marriageEv = relEvents.find(e => e.event_type === 'marriage') ?? null;
    const marriage = marriageEv ? await formatEventWithPlace(marriageEv) : null;

    // Children: parent_child rels where person1_id === our person1_id
    let childIds: string[] = [];
    if (rel.person1_id) {
      const p1Rels = (await window.api.relationships.getForPerson(rel.person1_id)) as RawRelationship[];
      childIds = p1Rels
        .filter(r => r.type === 'parent_child' && r.person1_id === rel.person1_id && r.person2_id)
        .map(r => r.person2_id as string);
    }
    const children = await Promise.all(childIds.map(buildChildData));

    // Collect citations from: both persons + all events on the couple relationship
    const allEventIds = relEvents.map(e => e.id);
    const citationSets = await Promise.all([
      rel.person1_id
        ? (window.api.citations.forPerson(rel.person1_id) as Promise<RawCitation[]>)
        : Promise.resolve([] as RawCitation[]),
      rel.person2_id
        ? (window.api.citations.forPerson(rel.person2_id) as Promise<RawCitation[]>)
        : Promise.resolve([] as RawCitation[]),
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

    data.value = {
      person1: person1Data,
      person2: person2Data,
      marriage,
      notes: rel.notes ?? null,
      children,
      sources,
    };
  } catch (err) {
    console.error('[FamilyGroupSheet] load failed:', err);
    error.value = 'Kunde inte ladda familjeblad.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.relationshipId, load, { immediate: true });
</script>

<style scoped>
.family-group-sheet {
  font-family: Georgia, serif;
  max-width: 700px;
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
.report-title {
  font-size: 22px;
  margin: 0 0 4px;
}
.report-meta {
  font-size: 12px;
  color: #666;
  margin: 0 0 20px;
}

/* Spouses table */
.person-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
  font-size: 13px;
}
.person-table th {
  text-align: left;
  font-weight: 600;
  padding: 4px 8px 4px 0;
  width: 90px;
  vertical-align: top;
  color: #333;
}
.person-table td {
  padding: 4px 12px 4px 0;
  vertical-align: top;
}
.person-name {
  font-weight: 500;
}
.empty-cell {
  color: #bbb;
}

/* Marriage row */
.marriage-row,
.notes-row {
  font-size: 13px;
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
}
.label {
  font-weight: 600;
  min-width: 80px;
  color: #333;
}

/* Sections */
.section-heading {
  font-size: 14px;
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

/* Children */
.children-list {
  margin: 0;
  padding-left: 20px;
}
.child-entry {
  font-size: 13px;
  padding: 2px 0;
  display: flex;
  gap: 12px;
}
.child-name {
  flex: 1;
}
.child-years {
  color: #666;
  font-size: 12px;
}

/* Sources */
.sources-list {
  margin: 0;
  padding-left: 20px;
}
.source-entry {
  font-size: 12px;
  padding: 2px 0;
  color: #333;
  line-height: 1.5;
}
.source-author,
.source-pub {
  color: #666;
}

@media print {
  .report-title {
    font-size: 18px;
  }
  .section-heading {
    font-size: 12px;
  }
  .person-table,
  .child-entry,
  .source-entry {
    font-size: 11px;
  }
  .children-section,
  .sources-section {
    break-inside: avoid;
  }
}
</style>
