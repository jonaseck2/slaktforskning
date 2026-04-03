<template>
  <div class="timeline-chart">
    <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
    <svg
      v-else-if="rows.length > 0"
      :viewBox="`0 0 ${svgW} ${svgH}`"
      width="100%"
      :style="{ maxWidth: svgW + 'px' }"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="timeline-svg"
    >
      <!-- Axis ticks and labels -->
      <g class="axis">
        <line
          :x1="LEFT_MARGIN" :y1="TOP_PAD + rows.length * ROW_H + 4"
          :x2="svgW - RIGHT_PAD" :y2="TOP_PAD + rows.length * ROW_H + 4"
          stroke="#ddd" stroke-width="1"
        />
        <g v-for="tick in ticks" :key="tick.year">
          <line
            :x1="xOf(tick.year)" :y1="TOP_PAD"
            :x2="xOf(tick.year)" :y2="TOP_PAD + rows.length * ROW_H + 4"
            stroke="#f0f0f0" stroke-width="1"
          />
          <text
            :x="xOf(tick.year)"
            :y="TOP_PAD + rows.length * ROW_H + 16"
            class="tick-label"
            text-anchor="middle"
          >{{ tick.year }}</text>
        </g>
        <!-- Today line -->
        <line
          v-if="xOf(currentYear) >= LEFT_MARGIN && xOf(currentYear) <= svgW - RIGHT_PAD"
          :x1="xOf(currentYear)" :y1="TOP_PAD - 4"
          :x2="xOf(currentYear)" :y2="TOP_PAD + rows.length * ROW_H + 4"
          stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3"
        />
        <text
          v-if="xOf(currentYear) >= LEFT_MARGIN && xOf(currentYear) <= svgW - RIGHT_PAD"
          :x="xOf(currentYear)"
          :y="TOP_PAD - 8"
          class="today-label"
          text-anchor="middle"
        >{{ $t('visualization.today') }}</text>
      </g>

      <!-- Person rows -->
      <g v-for="(row, i) in rows" :key="row.person.id"
        :data-testid="'timeline-row-' + row.person.id"
        class="timeline-row"
        :class="{ focal: row.isFocal }"
        @click="row.isFocal ? null : $emit('navigate', row.person.id)"
      >
        <!-- Name label -->
        <text
          :x="LEFT_MARGIN - 8"
          :y="TOP_PAD + i * ROW_H + ROW_H / 2"
          class="row-label"
          :class="{ 'focal-label': row.isFocal }"
          text-anchor="end"
          dominant-baseline="middle"
        >{{ truncate(row.displayName, 22) }}</text>

        <!-- Lifespan bar -->
        <rect
          v-if="row.barX !== null"
          :x="row.barX"
          :y="TOP_PAD + i * ROW_H + (ROW_H - BAR_H) / 2"
          :width="row.barW"
          :height="BAR_H"
          :fill="row.isFocal ? '#2c3e50' : barColor(row.person.sex)"
          :opacity="row.person.living ? 1 : 0.7"
          rx="3"
        />
        <!-- No birth date stub -->
        <text
          v-else
          :x="LEFT_MARGIN + 4"
          :y="TOP_PAD + i * ROW_H + ROW_H / 2"
          class="no-date-label"
          dominant-baseline="middle"
        >?</text>
        <!-- Living arrow -->
        <text
          v-if="row.barX !== null && row.person.living"
          :x="row.barX + row.barW + 4"
          :y="TOP_PAD + i * ROW_H + ROW_H / 2"
          class="living-arrow"
          dominant-baseline="middle"
        >→</text>
      </g>
    </svg>

    <div v-else-if="!loading" class="chart-empty">—</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Relationship { id: string; type: string; person1_id: string | null; person2_id: string | null; }
interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  givenName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
}

interface TimelineRow {
  person: PersonData;
  isFocal: boolean;
  displayName: string;
  barX: number | null;
  barW: number;
}

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();
useI18n();

const LEFT_MARGIN = 160;
const RIGHT_PAD = 30;
const TOP_PAD = 30;
const BOTTOM_PAD = 30;
const ROW_H = 36;
const BAR_H = 22;

const currentYear = new Date().getFullYear();

const loading = ref(true);
const rows = ref<TimelineRow[]>([]);
const minYear = ref(currentYear - 10);
const maxYear = ref(currentYear + 5);

const svgW = computed(() => LEFT_MARGIN + 600 + RIGHT_PAD);
const svgH = computed(() => TOP_PAD + rows.value.length * ROW_H + BOTTOM_PAD);

function scale(year: number): number {
  return (year - minYear.value) / (maxYear.value - minYear.value);
}

function xOf(year: number): number {
  return LEFT_MARGIN + scale(year) * (svgW.value - LEFT_MARGIN - RIGHT_PAD);
}

const ticks = computed(() => {
  const step = (maxYear.value - minYear.value) > 100 ? 20 : 10;
  const start = Math.ceil(minYear.value / step) * step;
  const result: { year: number }[] = [];
  for (let y = start; y <= maxYear.value; y += step) result.push({ year: y });
  return result;
});

const BAR_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#bbb' };
function barColor(sex: string): string { return BAR_COLORS[sex] ?? '#bbb'; }

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function loadPersonData(id: string): Promise<PersonData | null> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [
    { id: string; sex: 'M' | 'F' | 'U'; living: boolean } | null,
    Array<{ given_name: string; surname: string; sort_order: number }>,
    Array<{ event_type: string; date_value: string | null }>,
  ];
  if (!person) return null;
  const primary = names.sort((a, b) => a.sort_order - b.sort_order)[0];
  const birthEvent = events.find(e => e.event_type === 'birth');
  const deathEvent = events.find(e => e.event_type === 'death');
  return {
    id: person.id,
    sex: person.sex,
    living: person.living,
    givenName: primary?.given_name ?? '',
    surname: primary?.surname ?? '',
    birthYear: extractYear(birthEvent?.date_value ?? null),
    deathYear: extractYear(deathEvent?.date_value ?? null),
  };
}

function extractYear(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

function buildRows(persons: PersonData[], focalId: string): TimelineRow[] {
  return persons
    .sort((a, b) => {
      const ay = a.birthYear ?? 9999;
      const by = b.birthYear ?? 9999;
      return ay - by;
    })
    .map(p => {
      const displayName = [p.givenName, p.surname].filter(Boolean).join(' ') || '(okänd)';
      return {
        person: p,
        isFocal: p.id === focalId,
        displayName,
        barX: null,
        barW: 0,
      };
    });
}

function computeBarPositions(rowList: TimelineRow[]): TimelineRow[] {
  const chartW = svgW.value - LEFT_MARGIN - RIGHT_PAD;
  return rowList.map(row => {
    const b = row.person.birthYear;
    const d = row.person.deathYear;
    if (b === null) return { ...row, barX: null, barW: 0 };
    const endYear = d ?? (row.person.living ? currentYear : currentYear);
    const x = LEFT_MARGIN + ((b - minYear.value) / (maxYear.value - minYear.value)) * chartW;
    const w = Math.max(4, ((endYear - b) / (maxYear.value - minYear.value)) * chartW);
    return { ...row, barX: x, barW: w };
  });
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const focalPerson = await loadPersonData(props.personId);
    if (!focalPerson) { loading.value = false; return; }

    const rels = (await window.api.relationships.getForPerson(props.personId)) as Relationship[];

    // Collect related person IDs: parents, spouses, children, siblings
    const relatedIds = new Set<string>();
    for (const r of rels) {
      if (r.person1_id && r.person1_id !== props.personId) relatedIds.add(r.person1_id);
      if (r.person2_id && r.person2_id !== props.personId) relatedIds.add(r.person2_id);
    }

    const relatedPersons = (await Promise.all(
      Array.from(relatedIds).map(id => loadPersonData(id))
    )).filter(Boolean) as PersonData[];

    const allPersons = [focalPerson, ...relatedPersons];

    // Compute axis range
    const years = allPersons.flatMap(p => [p.birthYear, p.deathYear]).filter(Boolean) as number[];
    if (years.length > 0) {
      minYear.value = Math.min(...years) - 10;
      maxYear.value = Math.max(...years, currentYear) + 5;
    } else {
      minYear.value = currentYear - 80;
      maxYear.value = currentYear + 5;
    }

    const rawRows = buildRows(allPersons, props.personId);
    rows.value = computeBarPositions(rawRows);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.timeline-chart { width: 100%; }
.chart-loading { color: #999; padding: 40px; text-align: center; }
.chart-empty { color: #bbb; padding: 40px; text-align: center; }
.timeline-row { cursor: pointer; }
.timeline-row.focal { cursor: default; }
.timeline-row:not(.focal):hover rect { opacity: 0.85; }
.row-label { fill: #444; font-size: 12px; font-family: inherit; }
.focal-label { font-weight: 700; fill: #2c3e50; }
.tick-label { fill: #aaa; font-size: 11px; font-family: inherit; }
.today-label { fill: #ef4444; font-size: 11px; font-family: inherit; }
.no-date-label { fill: #ccc; font-size: 14px; font-family: inherit; }
.living-arrow { fill: #888; font-size: 13px; font-family: inherit; }
</style>
