<template>
  <div class="pedigree-chart">
    <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
    <svg
      v-else
      :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
      width="100%"
      :style="{ maxWidth: SVG_W + 'px' }"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="pedigree-svg"
    >
      <!-- Generation labels -->
      <text
        v-for="(label, i) in genLabels"
        :key="'gen-label-' + i"
        :x="PAD + i * COL_STEP + BOX_W / 2"
        :y="14"
        class="gen-label"
        text-anchor="middle"
      >{{ label }}</text>

      <!-- Connector lines -->
      <g class="connectors" fill="none" stroke="#bbb" stroke-width="1.5">
        <!-- Focal → Parents -->
        <template v-if="parents.length > 0">
          <line :x1="PAD + BOX_W" :y1="focalCy" :x2="focalParentForkX" :y2="focalCy" />
          <line v-if="parents.length > 1"
            :x1="focalParentForkX" :y1="parentCy(0)"
            :x2="focalParentForkX" :y2="parentCy(1)"
          />
          <line v-for="(p, i) in parents" :key="'conn-p-' + i"
            :x1="focalParentForkX" :y1="parentCy(i)"
            :x2="PAD + COL_STEP" :y2="parentCy(i)"
          />
        </template>
        <!-- Parent 0 → Grandparents 0+1 -->
        <template v-if="grandparents[0].length > 0">
          <line
            :x1="PAD + COL_STEP + BOX_W" :y1="parentCy(0)"
            :x2="p0GpForkX" :y2="parentCy(0)"
          />
          <line v-if="grandparents[0].length > 1"
            :x1="p0GpForkX" :y1="gpCy(0, 0)"
            :x2="p0GpForkX" :y2="gpCy(0, 1)"
          />
          <line v-for="(gp, j) in grandparents[0]" :key="'conn-gp0-' + j"
            :x1="p0GpForkX" :y1="gpCy(0, j)"
            :x2="PAD + COL_STEP * 2" :y2="gpCy(0, j)"
          />
        </template>
        <!-- Parent 1 → Grandparents 2+3 -->
        <template v-if="parents.length > 1 && grandparents[1].length > 0">
          <line
            :x1="PAD + COL_STEP + BOX_W" :y1="parentCy(1)"
            :x2="p1GpForkX" :y2="parentCy(1)"
          />
          <line v-if="grandparents[1].length > 1"
            :x1="p1GpForkX" :y1="gpCy(1, 0)"
            :x2="p1GpForkX" :y2="gpCy(1, 1)"
          />
          <line v-for="(gp, j) in grandparents[1]" :key="'conn-gp1-' + j"
            :x1="p1GpForkX" :y1="gpCy(1, j)"
            :x2="PAD + COL_STEP * 2" :y2="gpCy(1, j)"
          />
        </template>
      </g>

      <!-- Person boxes -->
      <g
        v-if="focalData"
        :data-testid="'person-box-' + focalData.id"
        class="person-box focal"
        :transform="`translate(${PAD}, ${focalBoxY})`"
        @click="$emit('navigate', focalData.id)"
      >
        <PersonBox :person="focalData" :width="BOX_W" :height="BOX_H" :is-focal="true" />
      </g>

      <g
        v-for="(p, i) in parents"
        :key="'parent-box-' + i"
        :data-testid="'person-box-' + p.id"
        class="person-box"
        :transform="`translate(${PAD + COL_STEP}, ${parentBoxY(i)})`"
        @click="$emit('navigate', p.id)"
      >
        <PersonBox :person="p" :width="BOX_W" :height="BOX_H" />
      </g>

      <g
        v-for="(gp, j) in grandparents.flat()"
        :key="'gp-box-' + j"
        :data-testid="'person-box-' + gp.id"
        class="person-box"
        :transform="`translate(${PAD + COL_STEP * 2}, ${gpBoxYFlat(j)})`"
        @click="$emit('navigate', gp.id)"
      >
        <PersonBox :person="gp" :width="BOX_W" :height="BOX_H" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonBox from './PersonBox.vue';

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

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();
useI18n();

// Layout constants
const BOX_W = 155;
const BOX_H = 44;
const V_GAP = 20;
const H_GAP = 50;
const PAD = 20;   // left/top padding
const COL_STEP = BOX_W + H_GAP;

// Fixed y-slots for grandparents (4 slots, 2 per parent)
const GP_SLOT_Y = [
  PAD + 20,                            // slot 0
  PAD + 20 + BOX_H + V_GAP,           // slot 1
  PAD + 20 + 2 * (BOX_H + V_GAP),     // slot 2
  PAD + 20 + 3 * (BOX_H + V_GAP),     // slot 3
];

// y-center for grandparent slot
function gpSlotCy(slot: number): number {
  return GP_SLOT_Y[slot] + BOX_H / 2;
}

// Parent i occupies slots [i*2, i*2+1]
function parentCy(i: number): number {
  const slot0 = i * 2;
  const slot1 = i * 2 + 1;
  return (gpSlotCy(slot0) + gpSlotCy(slot1)) / 2;
}

function parentBoxY(i: number): number {
  return parentCy(i) - BOX_H / 2;
}

// gpCy(parentIdx, gpWithinParent): center y for grandparent
function gpCy(parentIdx: number, gpIdx: number): number {
  return gpSlotCy(parentIdx * 2 + gpIdx);
}

// Flat index → grandparent slot: [gps of parent0, gps of parent1]
function gpBoxYFlat(flatIdx: number): number {
  // flatIdx 0,1 → parent0's gps (slots 0,1); flatIdx 2,3 → parent1's gps (slots 2,3)
  const parentIdx = flatIdx < grandparents.value[0].length ? 0 : 1;
  const withinParent = flatIdx < grandparents.value[0].length ? flatIdx : flatIdx - grandparents.value[0].length;
  return gpSlotCy(parentIdx * 2 + withinParent) - BOX_H / 2;
}

const focalCy = computed(() => {
  if (parents.value.length === 0) return GP_SLOT_Y[1] + BOX_H / 2 + (BOX_H + V_GAP) / 2;
  if (parents.value.length === 1) return parentCy(0);
  return (parentCy(0) + parentCy(1)) / 2;
});
const focalBoxY = computed(() => focalCy.value - BOX_H / 2);

const SVG_H = computed(() => GP_SLOT_Y[3] + BOX_H + PAD + 20);
const SVG_W = computed(() => PAD + COL_STEP * 3 + PAD);

const focalParentForkX = computed(() => PAD + BOX_W + H_GAP / 2);
const p0GpForkX = computed(() => PAD + COL_STEP + BOX_W + H_GAP / 2);
const p1GpForkX = computed(() => PAD + COL_STEP + BOX_W + H_GAP / 2);

const genLabels = computed(() => {
  // Only show labels for generations that have data
  return ['', '', ''];
});

// Data
const loading = ref(true);
const focalData = ref<PersonData | null>(null);
const parents = ref<PersonData[]>([]);
const grandparents = ref<[PersonData[], PersonData[]]>([[], []]);

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

function extractYear(dateVal: string | null): number | null {
  if (!dateVal) return null;
  const m = dateVal.match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    focalData.value = await loadPersonData(props.personId);
    if (!focalData.value) { loading.value = false; return; }

    // Parents: parent_child rels where focal is person2 (child)
    const rels = (await window.api.relationships.getForPerson(props.personId)) as Relationship[];
    const parentRels = rels.filter(r => r.type === 'parent_child' && r.person2_id === props.personId);
    const parentData = (await Promise.all(
      parentRels.slice(0, 2).map(r => r.person1_id ? loadPersonData(r.person1_id) : null)
    )).filter(Boolean) as PersonData[];
    parents.value = parentData;

    // Grandparents: for each parent, find their parents
    const gps: [PersonData[], PersonData[]] = [[], []];
    for (let i = 0; i < parentData.length; i++) {
      const parentRels2 = (await window.api.relationships.getForPerson(parentData[i].id)) as Relationship[];
      const gpRels = parentRels2.filter(r => r.type === 'parent_child' && r.person2_id === parentData[i].id);
      gps[i] = (await Promise.all(
        gpRels.slice(0, 2).map(r => r.person1_id ? loadPersonData(r.person1_id) : null)
      )).filter(Boolean) as PersonData[];
    }
    grandparents.value = gps;
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.pedigree-chart { width: 100%; }
.chart-loading { color: #999; padding: 40px; text-align: center; }
.person-box { cursor: pointer; }
.person-box.focal { cursor: default; }
.gen-label { fill: #999; font-size: 11px; font-family: inherit; }
.connectors line { vector-effect: non-scaling-stroke; }
</style>
