<template>
  <div class="ancestor-book">
    <div v-if="loading" class="ab-loading">Laddar stamtavla…</div>
    <div v-else-if="error" class="ab-error">{{ error }}</div>
    <template v-else-if="allData.length > 0">

      <!-- Limit warning (shown in preview, hidden at print) -->
      <div v-if="limitReached" class="ab-limit-warning">
        Mer än 500 förfäder hittades — exporten visar de 500 närmaste.
      </div>

      <!-- 1. Title page -->
      <section class="ab-title-page">
        <h1 class="ab-title">{{ focalDisplayName }}</h1>
        <p class="ab-subtitle">Stamtavla</p>
        <p class="ab-meta">Exporterad {{ exportDate }}</p>
      </section>

      <!-- 2. Circle chart (static SVG) -->
      <section class="ab-chart-page">
        <svg
          :viewBox="`0 0 ${CIRCLE_SVG_SIZE} ${CIRCLE_SVG_SIZE}`"
          class="ab-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- Non-focal segments (rendered below focal circle) -->
          <g v-for="seg in nonFocalSegments" :key="seg.ahnNum">
            <a v-if="seg.person" :href="`#person-${seg.person.id}`">
              <path :d="seg.pathD" :fill="seg.fill" stroke="white" stroke-width="0.5" />
            </a>
            <path v-else :d="seg.pathD" :fill="seg.fill" stroke="white" stroke-width="0.5" />

            <!-- Straight tangential text (gen 1–5 only) -->
            <g
              v-if="seg.person && seg.generation <= 5"
              :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`"
            >
              <!-- Given name (gen 1–4) -->
              <text
                v-if="seg.generation <= 4 && givenLabel(seg)"
                :x="seg.textX" :y="seg.textY"
                :dy="segLifespan(seg) ? '-9' : '-5'"
                text-anchor="middle" dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="Georgia, serif" font-weight="600" fill="white"
              >{{ givenLabel(seg) }}</text>
              <!-- Surname -->
              <text
                :x="seg.textX" :y="seg.textY"
                :dy="seg.generation <= 4 ? (segLifespan(seg) ? '2' : '5') : '0'"
                text-anchor="middle" dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="Georgia, serif" font-weight="600" fill="white"
              >{{ surnameLabel(seg) }}</text>
              <!-- Dates (gen 1–4) -->
              <text
                v-if="seg.generation <= 4 && segLifespan(seg)"
                :x="seg.textX" :y="seg.textY" dy="13"
                text-anchor="middle" dominant-baseline="central"
                :font-size="dateFontSize(seg.generation)"
                font-family="Georgia, serif" fill="rgba(255,255,255,0.75)"
              >{{ segLifespan(seg) }}</text>
            </g>
          </g>

          <!-- Focal circle (on top) -->
          <circle
            v-if="focalSeg"
            :cx="CIRCLE_CX" :cy="CIRCLE_CY" r="50"
            :fill="focalSeg.fill"
          />
          <!-- Focal name lines -->
          <text
            v-for="(line, i) in focalNameLines"
            :key="i"
            :x="CIRCLE_CX" :y="focalLineY(i, focalNameLines.length)"
            text-anchor="middle" dominant-baseline="central"
            :font-size="focalNameLines.length > 2 ? 9 : 10"
            font-weight="600" font-family="Georgia, serif" fill="white"
          >{{ line }}</text>
          <!-- Focal dates -->
          <text
            v-if="focalSeg?.person && focalDates"
            :x="CIRCLE_CX" :y="focalLineY(focalNameLines.length, focalNameLines.length)"
            text-anchor="middle" dominant-baseline="central"
            font-size="8" font-family="Georgia, serif" fill="rgba(255,255,255,0.65)"
          >{{ focalDates }}</text>
        </svg>
      </section>

      <!-- 3. Ahnentafel list -->
      <section class="ab-ahnentafel">
        <h2 class="ab-section-heading">Ahnentavla</h2>
        <div v-for="gen in generationGroups" :key="gen.number" class="ab-gen-group">
          <h3 class="ab-gen-heading">Generation {{ gen.number }}</h3>
          <ol class="ab-gen-list">
            <li v-for="entry in gen.entries" :key="entry.ahnNum" class="ab-gen-entry">
              <span class="ab-ahn-num">{{ entry.ahnNum }}.</span>
              <a :href="`#person-${entry.person.id}`">{{ displayName(entry.person) }}</a>
              <span v-if="lifespanStr(entry.person)" class="ab-years"> {{ lifespanStr(entry.person) }}</span>
            </li>
          </ol>
        </div>
      </section>

      <!-- 4. Person summaries -->
      <section
        v-for="entry in allData"
        :key="entry.person.id"
        :id="`person-${entry.person.id}`"
        class="ab-person-summary"
      >
        <h2 class="ab-person-heading">
          {{ entry.ahnNum }}. {{ displayName(entry.person) }}
          <span v-if="lifespanStr(entry.person)" class="ab-years"> {{ lifespanStr(entry.person) }}</span>
        </h2>

        <!-- Names -->
        <div class="ab-subsection">
          <h3 class="ab-subsection-heading">Namn</h3>
          <table class="ab-table">
            <thead>
              <tr><th>Förnamn</th><th>Efternamn</th><th>Typ</th></tr>
            </thead>
            <tbody>
              <tr v-for="n in entry.names" :key="(n.id ?? '') + n.given_name + n.surname">
                <td>{{ n.given_name || '–' }}</td>
                <td>{{ n.surname || '–' }}</td>
                <td class="muted">{{ nameTypeLabel(n.name_type) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Events -->
        <div v-if="entry.events.length > 0" class="ab-subsection">
          <h3 class="ab-subsection-heading">Händelser</h3>
          <table class="ab-table">
            <thead>
              <tr><th>Typ</th><th>Datum</th><th>Plats</th><th>Beskrivning</th></tr>
            </thead>
            <tbody>
              <tr v-for="ev in entry.events" :key="ev.id">
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
        </div>

        <!-- Family -->
        <div class="ab-subsection">
          <h3 class="ab-subsection-heading">Relationer</h3>
          <div v-if="entry.parents.length === 0 && entry.spouses.length === 0 && entry.children.length === 0" class="muted">
            Inga relationer registrerade.
          </div>
          <div v-if="entry.parents.length > 0" class="ab-rel-row">
            <strong>Föräldrar:</strong>
            <span v-for="(p, i) in entry.parents" :key="p.id">
              <a v-if="p.inTree" :href="`#person-${p.id}`">{{ p.name }}</a>
              <span v-else>{{ p.name }}</span>
              <span v-if="i < entry.parents.length - 1">, </span>
            </span>
          </div>
          <div v-if="entry.spouses.length > 0" class="ab-rel-row">
            <strong>{{ entry.spouses.length === 1 ? 'Partner' : 'Partners' }}:</strong>
            <span v-for="(s, i) in entry.spouses" :key="s.id">
              {{ s.name }}<span v-if="s.subtype" class="muted"> ({{ subtypeLabel(s.subtype) }})</span><span
                v-if="i < entry.spouses.length - 1"
              >, </span>
            </span>
          </div>
          <div v-if="entry.children.length > 0" class="ab-rel-row">
            <strong>Barn:</strong>
            <span v-for="(c, i) in entry.children" :key="c.id">
              <a v-if="c.inTree" :href="`#person-${c.id}`">{{ c.name }}</a>
              <span v-else>{{ c.name }}</span>
              <span v-if="i < entry.children.length - 1">, </span>
            </span>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="entry.notes" class="ab-subsection">
          <h3 class="ab-subsection-heading">Anteckningar</h3>
          <p class="ab-notes">{{ entry.notes }}</p>
        </div>

        <!-- Sources -->
        <div v-if="entry.sources.length > 0" class="ab-subsection">
          <h3 class="ab-subsection-heading">Källor</h3>
          <ol class="ab-sources">
            <li v-for="src in entry.sources" :key="src.id">
              <span>{{ src.title }}</span>
              <span v-if="src.author" class="muted"> · {{ src.author }}</span>
              <span v-if="src.publication_info" class="muted"> · {{ src.publication_info }}</span>
            </li>
          </ol>
        </div>
      </section>

    </template>
    <div v-else-if="!loading && !error && !props.personId" class="ab-empty">
      Välj en person för att generera stamtavlan.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  computeCircleLayout,
  CIRCLE_CX,
  CIRCLE_CY,
  CIRCLE_SVG_SIZE,
  type CircleSegment,
} from '../../utils/circleLayout';
import { fetchAllAncestors, fetchPedigreeTree } from '../../utils/chartData';
import type { PersonNode } from '../../utils/chartLayout';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

// ── Raw API types ──────────────────────────────────────────────────────────────
interface RawName {
  id?: string;
  given_name: string | null;
  surname: string | null;
  name_type: string;
  sort_order: number;
  preferred_name: string | null;
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

// ── Domain types ───────────────────────────────────────────────────────────────
interface EnrichedEvent extends RawEvent {
  dateFormatted: string;
  placeName: string | null;
}
interface PersonRef {
  id: string;
  name: string;
  inTree: boolean;
  subtype?: string | null;
}
interface AncestorEntry {
  ahnNum: number;
  person: PersonNode;
  names: RawName[];
  events: EnrichedEvent[];
  parents: PersonRef[];
  spouses: PersonRef[];
  children: PersonRef[];
  sources: RawSource[];
  notes: string | null;
}
interface GenGroup {
  number: number;
  entries: Array<{ ahnNum: number; person: PersonNode }>;
}

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps<{ personId: string }>();

// ── State ──────────────────────────────────────────────────────────────────────
const loading = ref(false);
const error = ref<string | null>(null);
const limitReached = ref(false);
const allData = ref<AncestorEntry[]>([]);
const segments = ref<CircleSegment[]>([]);
const exportDate = new Date().toLocaleDateString('sv-SE');

// ── SVG derived ────────────────────────────────────────────────────────────────
const focalSeg = computed(() => segments.value.find(s => s.isFocal) ?? null);
const nonFocalSegments = computed(() => segments.value.filter(s => !s.isFocal));

// ── Display helpers ────────────────────────────────────────────────────────────
function displayName(p: PersonNode): string {
  const first = p.preferredName ?? p.givenName ?? '';
  return [first, p.surname].filter(Boolean).join(' ') || '(okänd)';
}

function lifespanStr(p: PersonNode): string {
  if (!p.birthYear && !p.deathYear) return '';
  const birth = p.birthYear ? String(p.birthYear) : '?';
  const death = p.deathYear ? String(p.deathYear) : '';
  return `(${birth}–${death})`;
}

function formatDate(ev: RawEvent): string {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return '';
  const prefixes: Record<string, string> = {
    about: 'ca ', before: 'före ', after: 'efter ', calculated: 'ber. ',
  };
  const prefix = ev.date_type ? (prefixes[ev.date_type] ?? '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    return `${prefix}${ev.date_value}–${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function nameTypeLabel(t: string): string {
  const m: Record<string, string> = {
    birth: 'Födelsenamn', married: 'Giftonamn', alias: 'Alias', aka: 'Känt som',
  };
  return m[t] ?? t;
}

function eventTypeLabel(t: string): string {
  const m: Record<string, string> = {
    birth: 'Född', death: 'Död', marriage: 'Vigsel', divorce: 'Skilsmässa',
    baptism: 'Dop', burial: 'Begravning', confirmation: 'Konfirmation',
    emigration: 'Emigration', immigration: 'Immigration', census: 'Folkräkning',
    occupation: 'Yrke', residence: 'Bostad', education: 'Utbildning',
    military: 'Militärtjänst', naturalization: 'Naturalisering',
    graduation: 'Examen', retirement: 'Pensionering',
    will: 'Testamente', probate: 'Bouppteckning', other: 'Övrigt',
  };
  return m[t] ?? t;
}

function subtypeLabel(t: string): string {
  const m: Record<string, string> = {
    marriage: 'gift', civil_union: 'registrerat partnerskap',
    cohabitation: 'sambo', unknown: 'okänd',
    biological: 'biologisk', adopted: 'adopterad',
    foster: 'fosterbarn', step: 'styvbarn',
  };
  return m[t] ?? t;
}

// ── SVG text helpers (same logic as CircleChart.vue) ──────────────────────────
function givenLabel(seg: CircleSegment): string {
  if (!seg.person || seg.generation > 4) return '';
  return seg.person.preferredName ?? seg.person.givenName ?? '';
}

function surnameLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  return seg.person.surname ?? seg.person.givenName ?? '';
}

function segLifespan(seg: CircleSegment): string {
  const p = seg.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 10, 2: 9, 3: 8.5, 4: 8, 5: 7 };
  return sizes[gen] ?? 7;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 8, 2: 7.5, 3: 7, 4: 6.5 };
  return sizes[gen] ?? 6.5;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars || !current) {
      current = test;
    } else {
      lines.push(current);
      if (lines.length >= maxLines - 1) {
        current = words.slice(i).join(' ');
        break;
      }
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const focalNameLines = computed((): string[] => {
  const p = focalSeg.value?.person;
  if (!p) return [];
  const given = p.preferredName ?? p.givenName ?? '';
  const surname = p.surname ?? '';
  const lines: string[] = [];
  if (given) lines.push(given);
  if (surname) lines.push(...wrapText(surname, 11, 2));
  return lines;
});

function focalLineY(lineIndex: number, totalNameLines: number): number {
  const hasDates = !!focalDates.value;
  const totalLines = totalNameLines + (hasDates ? 1 : 0);
  const lineHeight = totalLines > 3 ? 10 : 12;
  const startY = CIRCLE_CY - ((totalLines - 1) / 2) * lineHeight;
  return startY + lineIndex * lineHeight;
}

const focalDates = computed(() => {
  const p = focalSeg.value?.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
});

const focalDisplayName = computed(() => {
  const p = focalSeg.value?.person ?? allData.value[0]?.person;
  return p ? displayName(p) : '';
});

// ── Ahnentafel list grouping ───────────────────────────────────────────────────
const generationGroups = computed((): GenGroup[] => {
  const groups = new Map<number, GenGroup>();
  for (const entry of allData.value) {
    const gen = Math.floor(Math.log2(entry.ahnNum)) + 1;
    if (!groups.has(gen)) groups.set(gen, { number: gen, entries: [] });
    groups.get(gen)!.entries.push({ ahnNum: entry.ahnNum, person: entry.person });
  }
  return Array.from(groups.values()).sort((a, b) => a.number - b.number);
});

// ── Data loading ───────────────────────────────────────────────────────────────
async function resolvePersonName(id: string): Promise<string> {
  try {
    const names = (await window.api.persons.getNames(id)) as RawName[];
    if (!names.length) return '(okänd)';
    const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
    const n = sorted[0];
    const first = n.preferred_name ?? n.given_name?.split(' ')[0] ?? '';
    return [first, n.surname].filter(Boolean).join(' ') || '(okänd)';
  } catch {
    return '(okänd)';
  }
}

async function fetchAncestorFullData(
  ahnNum: number,
  person: PersonNode,
  ancestorIds: Set<string>,
): Promise<AncestorEntry> {
  const pid = person.id;

  const [names, events, rels, personFull] = await Promise.all([
    window.api.persons.getNames(pid) as Promise<RawName[]>,
    window.api.events.forPerson(pid) as Promise<RawEvent[]>,
    window.api.relationships.getForPerson(pid) as Promise<RawRelationship[]>,
    window.api.persons.get(pid) as Promise<RawPerson | null>,
  ]);

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => {
    const av = a.date_value ?? '\uFFFF';
    const bv = b.date_value ?? '\uFFFF';
    return av.localeCompare(bv);
  });

  // Enrich events with place names
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

  // Resolve family members
  const parents: PersonRef[] = [];
  const spouses: PersonRef[] = [];
  const children: PersonRef[] = [];

  await Promise.all(
    rels.map(async rel => {
      if (rel.type === 'parent_child') {
        if (rel.person2_id === pid && rel.person1_id) {
          const name = await resolvePersonName(rel.person1_id);
          parents.push({ id: rel.person1_id, name, inTree: ancestorIds.has(rel.person1_id) });
        } else if (rel.person1_id === pid && rel.person2_id) {
          const name = await resolvePersonName(rel.person2_id);
          children.push({ id: rel.person2_id, name, inTree: ancestorIds.has(rel.person2_id) });
        }
      } else if (rel.type === 'couple') {
        const otherId = rel.person1_id === pid ? rel.person2_id : rel.person1_id;
        if (otherId) {
          const name = await resolvePersonName(otherId);
          spouses.push({ id: otherId, name, inTree: false, subtype: rel.subtype });
        }
      }
    }),
  );

  // Collect unique sources via citations
  const citationSets = await Promise.all([
    window.api.citations.forPerson(pid) as Promise<RawCitation[]>,
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

  return {
    ahnNum,
    person,
    names: [...names].sort((a, b) => a.sort_order - b.sort_order),
    events: enrichedEvents,
    parents,
    spouses,
    children,
    sources,
    notes: personFull?.notes ?? null,
  };
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  error.value = null;
  allData.value = [];
  segments.value = [];
  limitReached.value = false;

  try {
    // Fetch BFS ancestor tree + 6-gen pedigree tree for SVG in parallel
    const [ancestorResult, pedigreeTree] = await Promise.all([
      fetchAllAncestors(props.personId),
      fetchPedigreeTree(props.personId, 6),
    ]);

    limitReached.value = ancestorResult.limitReached;
    const { ancestors } = ancestorResult;

    // Build ancestor ID set (used for link eligibility)
    const ancestorIds = new Set<string>(Array.from(ancestors.values()).map(p => p.id));

    // Compute SVG segments from the 6-gen pedigree tree
    segments.value = computeCircleLayout(pedigreeTree, 6);

    // Fetch full details for all ancestors in parallel
    const entries = await Promise.all(
      Array.from(ancestors.entries()).map(([ahnNum, person]) =>
        fetchAncestorFullData(ahnNum, person, ancestorIds),
      ),
    );

    // Sort by ahnentafel number (focal first, then parents, then grandparents…)
    allData.value = entries.sort((a, b) => a.ahnNum - b.ahnNum);
  } catch (err) {
    console.error('[AncestorBookReport] load failed:', err);
    error.value = 'Kunde inte ladda stamtavlan.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.ancestor-book {
  font-family: Georgia, serif;
  max-width: 720px;
  color: #222;
}

/* Loading / error */
.ab-loading,
.ab-error,
.ab-empty {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
.ab-error { color: #c00; }

.ab-limit-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 16px;
}

/* ── Title page ── */
.ab-title-page {
  min-height: 60mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 0 32px;
  border-bottom: 2px solid #ccc;
  margin-bottom: 32px;
  page-break-after: always;
}
.ab-title {
  font-size: 28px;
  margin: 0 0 8px;
}
.ab-subtitle {
  font-size: 16px;
  color: #555;
  margin: 0 0 8px;
  font-style: italic;
}
.ab-meta {
  font-size: 11px;
  color: #aaa;
  margin: 0;
}

/* ── Circle chart ── */
.ab-chart-page {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
  page-break-after: always;
}
.ab-svg {
  width: 100%;
  max-width: 540px;
  height: auto;
}

/* ── Ahnentafel list ── */
.ab-ahnentafel {
  margin-bottom: 32px;
}
.ab-section-heading {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #444;
  border-bottom: 2px solid #ccc;
  padding-bottom: 4px;
  margin: 0 0 16px;
}
.ab-gen-group {
  margin-bottom: 16px;
  break-inside: avoid;
}
.ab-gen-heading {
  font-size: 12px;
  font-weight: 700;
  color: #555;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ab-gen-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ab-gen-entry {
  font-size: 13px;
  padding: 2px 0;
  display: flex;
  gap: 6px;
}
.ab-ahn-num {
  color: #999;
  min-width: 32px;
  text-align: right;
  flex-shrink: 0;
}
.ab-years {
  color: #888;
  font-style: italic;
}

/* ── Person summaries ── */
.ab-person-summary {
  border-top: 2px solid #ccc;
  padding-top: 20px;
  margin-top: 24px;
  break-inside: avoid-page;
}
.ab-person-heading {
  font-size: 18px;
  margin: 0 0 12px;
}
.ab-subsection {
  margin-bottom: 14px;
}
.ab-subsection-heading {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
  border-bottom: 1px solid #ddd;
  padding-bottom: 2px;
  margin: 0 0 6px;
}
.ab-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ab-table th {
  text-align: left;
  font-weight: 600;
  padding: 3px 8px 3px 0;
  border-bottom: 1px solid #e0e0e0;
  color: #333;
  font-size: 11px;
}
.ab-table td {
  padding: 3px 8px 3px 0;
  vertical-align: top;
  border-bottom: 1px solid #f0f0f0;
}
.ev-type { white-space: nowrap; font-weight: 500; }
.ev-date { white-space: nowrap; }
.ev-place, .ev-desc { color: #444; }

.ab-rel-row {
  font-size: 13px;
  margin-bottom: 4px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ab-notes {
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-line;
}
.ab-sources {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}
.ab-sources li {
  padding: 2px 0;
  line-height: 1.5;
}
.muted { color: #888; }

/* ── Print overrides ── */
@media print {
  .ab-limit-warning { display: none; }
  .ab-person-summary { break-inside: avoid; }
  .ab-gen-group { break-inside: avoid; }
  .ab-table { font-size: 10px; }
}
</style>
