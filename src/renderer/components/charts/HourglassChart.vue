<template>
  <div class="hourglass-chart">
    <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
    <svg
      v-else
      :viewBox="`0 0 ${SVG_W} ${svgH}`"
      width="100%"
      :style="{ maxWidth: SVG_W + 'px' }"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="hourglass-svg"
    >
      <!-- Generation labels -->
      <text v-if="grandparents[0].length + grandparents[1].length > 0"
        :x="PAD + COL_STEP * 2 + BOX_W / 2" :y="genLabelY(0)"
        class="gen-label" text-anchor="middle"
      >{{ $t('visualization.generation.grandparents') }}</text>
      <text v-if="parents.length > 0"
        :x="PAD + COL_STEP + BOX_W / 2" :y="genLabelY(1)"
        class="gen-label" text-anchor="middle"
      >{{ $t('visualization.generation.parents') }}</text>
      <text
        :x="PAD + BOX_W / 2" :y="focalLabelY"
        class="gen-label" text-anchor="middle"
      >{{ $t('visualization.generation.focal') }}</text>
      <text v-if="children.length > 0"
        :x="PAD + COL_STEP + BOX_W / 2" :y="childrenLabelY"
        class="gen-label" text-anchor="middle"
      >{{ $t('visualization.generation.children') }}</text>

      <!-- Connectors (ancestors — same logic as pedigree) -->
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
          <line :x1="PAD + COL_STEP + BOX_W" :y1="parentCy(0)" :x2="p0GpForkX" :y2="parentCy(0)" />
          <line v-if="grandparents[0].length > 1"
            :x1="p0GpForkX" :y1="gpCy(0, 0)" :x2="p0GpForkX" :y2="gpCy(0, 1)"
          />
          <line v-for="(gp, j) in grandparents[0]" :key="'conn-gp0-' + j"
            :x1="p0GpForkX" :y1="gpCy(0, j)" :x2="PAD + COL_STEP * 2" :y2="gpCy(0, j)"
          />
        </template>
        <!-- Parent 1 → Grandparents 2+3 -->
        <template v-if="parents.length > 1 && grandparents[1].length > 0">
          <line :x1="PAD + COL_STEP + BOX_W" :y1="parentCy(1)" :x2="p0GpForkX" :y2="parentCy(1)" />
          <line v-if="grandparents[1].length > 1"
            :x1="p0GpForkX" :y1="gpCy(1, 0)" :x2="p0GpForkX" :y2="gpCy(1, 1)"
          />
          <line v-for="(gp, j) in grandparents[1]" :key="'conn-gp1-' + j"
            :x1="p0GpForkX" :y1="gpCy(1, j)" :x2="PAD + COL_STEP * 2" :y2="gpCy(1, j)"
          />
        </template>
        <!-- Focal → Children -->
        <template v-if="children.length > 0">
          <line :x1="PAD + BOX_W" :y1="focalCy" :x2="focalChildForkX" :y2="focalCy" />
          <line v-if="children.length > 1"
            :x1="focalChildForkX" :y1="childCy(0)"
            :x2="focalChildForkX" :y2="childCy(children.length - 1)"
          />
          <line v-for="(c, i) in children" :key="'conn-c-' + i"
            :x1="focalChildForkX" :y1="childCy(i)"
            :x2="PAD + COL_STEP" :y2="childCy(i)"
          />
        </template>
      </g>

      <!-- Person boxes — grandparents -->
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

      <!-- Parents -->
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

      <!-- Focal -->
      <g
        v-if="focalData"
        :data-testid="'person-box-' + focalData.id"
        class="person-box focal"
        :transform="`translate(${PAD}, ${focalBoxY})`"
        @click.prevent
      >
        <PersonBox :person="focalData" :width="BOX_W" :height="BOX_H" :is-focal="true" />
      </g>

      <!-- Children -->
      <g
        v-for="(c, i) in children"
        :key="'child-box-' + i"
        :data-testid="'person-box-' + c.id"
        class="person-box"
        :transform="`translate(${PAD + COL_STEP}, ${childBoxY(i)})`"
        @click="$emit('navigate', c.id)"
      >
        <PersonBox :person="c" :width="BOX_W" :height="BOX_H" />
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

const BOX_W = 155;
const BOX_H = 44;
const V_GAP = 20;
const H_GAP = 50;
const PAD = 20;
const COL_STEP = BOX_W + H_GAP;
const LABEL_H = 18;

// Fixed GP slots (4 total, 2 per parent)
const GP_SLOT_Y = [
  PAD + LABEL_H,
  PAD + LABEL_H + BOX_H + V_GAP,
  PAD + LABEL_H + 2 * (BOX_H + V_GAP),
  PAD + LABEL_H + 3 * (BOX_H + V_GAP),
];

function gpSlotCy(slot: number): number { return GP_SLOT_Y[slot] + BOX_H / 2; }
function gpCy(pIdx: number, gpIdx: number): number { return gpSlotCy(pIdx * 2 + gpIdx); }
function gpBoxYFlat(flatIdx: number): number {
  const pIdx = flatIdx < grandparents.value[0].length ? 0 : 1;
  const within = flatIdx < grandparents.value[0].length ? flatIdx : flatIdx - grandparents.value[0].length;
  return gpSlotCy(pIdx * 2 + within) - BOX_H / 2;
}

function parentCy(i: number): number { return (gpSlotCy(i * 2) + gpSlotCy(i * 2 + 1)) / 2; }
function parentBoxY(i: number): number { return parentCy(i) - BOX_H / 2; }

const focalCy = computed(() => {
  if (parents.value.length === 0) return GP_SLOT_Y[1] + BOX_H / 2 + (BOX_H + V_GAP) / 2;
  if (parents.value.length === 1) return parentCy(0);
  return (parentCy(0) + parentCy(1)) / 2;
});

const focalBoxY = computed(() => focalCy.value - BOX_H / 2);
const ancestorAreaH = computed(() => GP_SLOT_Y[3] + BOX_H + PAD);

// Children layout: below focal, vertically centered around focalCy
const CHILD_V_GAP = V_GAP;
function childrenBlockH(count: number): number {
  return count * BOX_H + (count - 1) * CHILD_V_GAP;
}
function childStartY(count: number): number {
  return ancestorAreaH.value + V_GAP + LABEL_H;
}
function childCy(i: number): number {
  return childStartY(children.value.length) + i * (BOX_H + CHILD_V_GAP) + BOX_H / 2;
}
function childBoxY(i: number): number { return childCy(i) - BOX_H / 2; }

const childrenLabelY = computed(() =>
  children.value.length > 0 ? childStartY(children.value.length) - 4 : 0
);

const svgH = computed(() => {
  if (children.value.length === 0) return ancestorAreaH.value + PAD;
  return childStartY(children.value.length) + childrenBlockH(children.value.length) + PAD;
});

const SVG_W = PAD + COL_STEP * 3 + PAD;

function genLabelY(gen: number): number {
  if (gen === 0) return GP_SLOT_Y[0] - 4;
  if (gen === 1) return GP_SLOT_Y[0] - 4; // same line
  return PAD + LABEL_H - 4;
}
const focalLabelY = computed(() => GP_SLOT_Y[0] - 4);

const focalParentForkX = PAD + BOX_W + H_GAP / 2;
const p0GpForkX = PAD + COL_STEP + BOX_W + H_GAP / 2;
const focalChildForkX = PAD + BOX_W + H_GAP / 2;

// Data
const loading = ref(true);
const focalData = ref<PersonData | null>(null);
const parents = ref<PersonData[]>([]);
const grandparents = ref<[PersonData[], PersonData[]]>([[], []]);
const children = ref<PersonData[]>([]);

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

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    focalData.value = await loadPersonData(props.personId);
    if (!focalData.value) { loading.value = false; return; }

    const rels = (await window.api.relationships.getForPerson(props.personId)) as Relationship[];

    // Parents (person1 = parent, person2 = child = focal)
    const parentRels = rels.filter(r => r.type === 'parent_child' && r.person2_id === props.personId);
    const parentData = (await Promise.all(
      parentRels.slice(0, 2).map(r => r.person1_id ? loadPersonData(r.person1_id) : null)
    )).filter(Boolean) as PersonData[];
    parents.value = parentData;

    // Grandparents
    const gps: [PersonData[], PersonData[]] = [[], []];
    for (let i = 0; i < parentData.length; i++) {
      const pRels = (await window.api.relationships.getForPerson(parentData[i].id)) as Relationship[];
      const gpRels = pRels.filter(r => r.type === 'parent_child' && r.person2_id === parentData[i].id);
      gps[i] = (await Promise.all(
        gpRels.slice(0, 2).map(r => r.person1_id ? loadPersonData(r.person1_id) : null)
      )).filter(Boolean) as PersonData[];
    }
    grandparents.value = gps;

    // Children (person1 = focal = parent, person2 = child)
    const childRels = rels.filter(r => r.type === 'parent_child' && r.person1_id === props.personId);
    children.value = (await Promise.all(
      childRels.map(r => r.person2_id ? loadPersonData(r.person2_id) : null)
    )).filter(Boolean) as PersonData[];
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.hourglass-chart { width: 100%; }
.chart-loading { color: #999; padding: 40px; text-align: center; }
.person-box { cursor: pointer; }
.person-box.focal { cursor: default; }
.gen-label { fill: #999; font-size: 11px; font-family: inherit; }
.connectors line { vector-effect: non-scaling-stroke; }
</style>
