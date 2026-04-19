<template>
  <div class="chart-outer">
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollRef" @wheel="onWheel"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 ${layout.viewBoxMinY} ${layout.svgWidth} ${layout.svgHeight}`"
        data-testid="hourglass-svg"
      >
        <defs>
          <filter id="chart-shadow" x="-3%" y="-6%" width="106%" height="116%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.06" />
          </filter>
        </defs>
        <path
          v-for="(d, i) in solidPaths"
          :key="'p' + i"
          :d="d"
          fill="none"
          :stroke="chartTokens.line"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <g
          v-for="box in layout.boxes"
          :key="box.person.id"
          :data-testid="'person-box-' + box.person.id"
          filter="url(#chart-shadow)"
          :class="['person-box', 'clickable']"
          :style="{ cursor: readonly ? 'default' : 'pointer' }"
          @click="!readonly && $emit('navigate', box.person.id)"
          @mouseenter="(e: MouseEvent) => { hoveredPersonId = box.person.id; tooltipRef?.show(box.person, e.clientX, e.clientY); }"
          @mousemove="(e: MouseEvent) => tooltipRef?.move(e.clientX, e.clientY)"
          @mouseleave="hoveredPersonId = null; tooltipRef?.hide()"
        >
          <!-- Box background -->
          <rect
            :x="box.x" :y="box.y" :width="box.w" :height="box.h"
            rx="6"
            :fill="boxFill(box)"
            :stroke="boxStroke(box)"
            stroke-width="1"
          />
          <!-- Sex indicator bar -->
          <rect
            :x="box.x" :y="box.y"
            width="3" :height="box.h"
            rx="1.5"
            :fill="sexBg(box.person.sex)"
          />
          <!-- Portrait area -->
          <rect
            :x="box.x + BOX_PAD_X_LEFT" :y="portraitY(box)"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            rx="3"
            :fill="portraitBg(box)"
          />
          <image
            v-if="box.person.photoUrl"
            :href="box.person.photoUrl"
            :x="box.x + BOX_PAD_X_LEFT" :y="portraitY(box)"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            preserveAspectRatio="xMidYMid slice"
          />
          <text
            v-else
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W / 2"
            :y="portraitY(box) + PORTRAIT_H / 2"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="11"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="portraitTextColor()"
          >{{ initials(box) }}</text>
          <!-- Name lines -->
          <text
            font-size="12"
            font-weight="600"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="nameColor(box)"
          >
            <tspan
              v-for="(line, li) in wrappedName(box)"
              :key="li"
              :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
              :y="nameStartY(box) + li * 16"
            >{{ line }}</tspan>
          </text>
          <!-- Birth line -->
          <text
            v-if="box.person.birthDate || box.person.birthPlace"
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
            :y="birthY(box)"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="dateColor(box)"
          >{{ birthText(box) }}</text>
          <!-- Death line -->
          <text
            v-if="box.person.deathDate || box.person.deathPlace"
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
            :y="deathY(box)"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="dateColor(box)"
          >{{ deathText(box) }}</text>
        </g>
        <template v-if="!readonly">
          <g
            v-for="btn in layout.collapseButtons"
            :key="`${btn.personId}:${btn.direction}:${btn.coParentId ?? ''}`"
            class="collapse-btn"
            @click.stop="handleCollapseButton(btn)"
          >
            <circle
              :cx="btn.cx" :cy="btn.cy" r="8"
              :fill="btn.isExpanded ? 'white' : '#888'"
              :stroke="btn.isExpanded ? '#aaa' : '#555'"
              stroke-width="1.5"
            />
            <text
              :x="btn.cx" :y="btn.cy"
              text-anchor="middle" dominant-baseline="central"
              font-size="9"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              :fill="btn.isExpanded ? '#666' : 'white'"
              style="pointer-events: none; user-select: none;"
            >{{ { up: '▲', down: '▼', left: '◀', right: '▶' }[btn.direction] }}</text>
          </g>
          <path
            v-for="(d, i) in dashedPaths"
            :key="'dp' + i"
            :d="d"
            fill="none"
            :stroke="chartTokens.placeholderStroke"
            stroke-width="1"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
          <g
            v-for="ph in layout.placeholders"
            :key="'ph-' + (ph.key ?? ph.role + '-' + ph.childPersonId)"
            class="ghost-box"
            tabindex="0"
            role="button"
            :aria-label="ph.role === 'father' ? $t('personDetail.addFather') : ph.role === 'mother' ? $t('personDetail.addMother') : ph.role === 'spouse' ? $t('personDetail.addSpouse') : $t('personDetail.addChild')"
            @click="startAddFromPlaceholder(ph)"
            @keydown.enter="startAddFromPlaceholder(ph)"
            @keydown.space.prevent="startAddFromPlaceholder(ph)"
          >
            <rect
              :x="ph.x" :y="ph.y" :width="BOX_W" :height="MIN_BOX_H"
              rx="6" ry="6"
              fill="transparent" :stroke="chartTokens.placeholderStroke" stroke-dasharray="4 3" stroke-width="1.5"
            />
            <text
              :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 - 6"
              text-anchor="middle" :fill="chartTokens.placeholderText" font-size="18"
            >+</text>
            <text
              :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 + 12"
              text-anchor="middle" :fill="chartTokens.placeholderText" font-size="11"
            >{{ ph.role === 'father' ? $t('personDetail.addFather') : ph.role === 'mother' ? $t('personDetail.addMother') : ph.role === 'spouse' ? $t('personDetail.addSpouse') : $t('personDetail.addChild') }}</text>
          </g>
        </template>
      </svg>
    </div>
    <ZoomControls v-if="!readonly" overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
      <button class="zoom-extra-btn" @click="decrGens" :disabled="genTarget <= 1">−</button>
      <span class="zoom-extra-value">{{ genTarget }}</span>
      <button class="zoom-extra-btn" @click="incrGens">+</button>
    </ZoomControls>

    <ChartTooltip ref="tooltipRef" />

    <!-- Add related person modal -->
    <AddRelatedPersonModal
      v-if="showAddRelative && addRelativePersonId"
      :person-id="addRelativePersonId"
      :mode="addRelativeMode"
      @saved="onRelativeSaved"
      @close="showAddRelative = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeHourglassLayout, maxDescendantDepthTP, BOX_W, MIN_BOX_H, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, BOX_PAD_Y, PORTRAIT_GAP, TEXT_AREA_W } from '../../utils/chart-layout';
import { wrapName, truncateToWidth } from '../../utils/chart-layout/measure';
import { fetchHourglassTreePerson, loadAncestorGenerationTP, loadChildrenForNodeTP } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, TreePerson, PlaceholderBox } from '../../utils/chart-layout';
import { formatFullName } from '../../utils/nameUtils';
import { useChartColors } from '../../composables/useChartColors';
import AddRelatedPersonModal from '../AddRelatedPersonModal.vue';
import ChartTooltip from './ChartTooltip.vue';
import ZoomControls from '../ZoomControls.vue';
import { hourglassGenerations } from '../../composables/useChartGenerations';

useI18n();
const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

const props = defineProps<{ personId: string | undefined; readonly?: boolean; selectedPersonId?: string | null }>();
const emit = defineEmits<{ navigate: [id: string]; reload: [] }>();

const loading = ref(true);
const loadingMore = ref(false);
const tree = ref<TreePerson | null>(null);
const collapsed = ref(new Set<string>());
const genTarget = hourglassGenerations;
const loadedGens = ref(3);

watch(genTarget, (n) => {
  if (!tree.value) return;
  if (n > loadedGens.value) load();
  else applyGenerationDepth(n);
});

const hoveredPersonId = ref<string | null>(null);

const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 1400, svgHeight: 688, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computeHourglassLayout(tree.value, collapsed.value, props.selectedPersonId);
});

const solidPaths = computed(() =>
  layout.value.paths.filter(d => !d.startsWith('D:')),
);
const dashedPaths = computed(() =>
  layout.value.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)),
);

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right', coParentId?: string | null) {
  const key = coParentId !== undefined
    ? `${personId}:${dir}:${coParentId ?? 'solo'}`
    : `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function applyGenerationDepth(n: number) {
  if (!tree.value) return;
  const next = new Set<string>();
  for (const k of collapsed.value) {
    if (k.endsWith(':up') || k.endsWith(':down')) continue;
    next.add(k);
  }
  function walk(node: TreePerson, depth: number, dir: 'up' | 'down', seen: Set<string>) {
    if (seen.has(node.person.id)) return;
    seen.add(node.person.id);
    if (depth >= n) {
      next.add(`${node.person.id}:${dir}`);
      return;
    }
    const children = dir === 'up' ? node.parents : node.children;
    for (const c of children) walk(c, depth + 1, dir, seen);
  }
  for (const p of tree.value.parents) walk(p, 1, 'up', new Set());
  for (const c of tree.value.children) walk(c, 1, 'down', new Set());
  collapsed.value = next;
}

function decrGens() {
  if (genTarget.value <= 1) return;
  genTarget.value--;
  applyGenerationDepth(genTarget.value);
}

function incrGens() {
  genTarget.value++;
  if (genTarget.value > loadedGens.value) {
    load();
  } else {
    applyGenerationDepth(genTarget.value);
  }
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId, btn.direction, btn.coParentId);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  loadingMore.value = true;
  try {
    if (btn.direction === 'up') {
      tree.value = await loadAncestorGenerationTP(tree.value, btn.personId);
    } else if (btn.direction === 'down') {
      tree.value = await loadChildrenForNodeTP(tree.value, btn.personId);
    }
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-hourglass');

const colors = useChartColors(true);

const chartTokens = computed(() => ({
  line: colors.value.line,
  placeholderStroke: colors.value.placeholderStroke,
  placeholderText: colors.value.placeholderText,
}));

function sexBg(sex: string): string {
  if (sex === 'M') return colors.value.sexMBg;
  if (sex === 'F') return colors.value.sexFBg;
  return colors.value.sexUBg;
}

function boxFill(box: BoxLayout): string {
  if (box.isFocal) return colors.value.boxFocal;
  if (!box.person.living) return colors.value.boxDeceased;
  return colors.value.boxBg;
}

function boxStroke(box: BoxLayout): string {
  return box.isFocal ? colors.value.focalStroke : colors.value.boxStroke;
}

function nameColor(box: BoxLayout): string {
  return box.isFocal ? colors.value.textFocal : colors.value.text;
}

function dateColor(box: BoxLayout): string {
  return box.isFocal ? colors.value.textFocalSub : colors.value.textSub;
}

function portraitBg(box: BoxLayout): string {
  return sexBg(box.person.sex);
}

function portraitTextColor(): string {
  return '#ffffff';
}

function wrappedName(box: BoxLayout): string[] {
  const full = formatFullName({
    given_name: box.person.givenName,
    surname: box.person.surname,
    preferred_name: box.person.preferredName,
    nickname: box.person.nickname,
  });
  return wrapName(full, TEXT_AREA_W, 12);
}

function birthText(box: BoxLayout): string {
  const parts = [box.person.birthDate, box.person.birthPlace].filter(Boolean).join(' ');
  if (!parts) return '';
  return truncateToWidth('* ' + parts, TEXT_AREA_W, 10);
}

function deathText(box: BoxLayout): string {
  const parts = [box.person.deathDate, box.person.deathPlace].filter(Boolean).join(' ');
  if (!parts) return '';
  return truncateToWidth('† ' + parts, TEXT_AREA_W, 10);
}

function initials(box: BoxLayout): string {
  const given = box.person.preferredName ?? box.person.givenName ?? '';
  const sur = box.person.surname ?? '';
  const g = given.trim()[0] ?? '';
  const s = sur.trim()[0] ?? '';
  return (g + s).toUpperCase() || '?';
}

function nameStartY(box: BoxLayout): number {
  return box.y + BOX_PAD_Y + 12;
}

function portraitY(box: BoxLayout): number {
  return box.y + (box.h - PORTRAIT_H) / 2;
}

function birthY(box: BoxLayout): number {
  const lines = wrappedName(box);
  return box.y + BOX_PAD_Y + lines.length * 16 + 10;
}

function deathY(box: BoxLayout): number {
  const hasBirth = !!(box.person.birthDate || box.person.birthPlace);
  return birthY(box) + (hasBirth ? 14 : 0);
}

function startAddFromPlaceholder(ph: PlaceholderBox) {
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role === 'spouse' ? 'spouse' : ph.role;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const gens = Math.max(3, genTarget.value);
    tree.value = await fetchHourglassTreePerson(props.personId, gens, gens);
    loadedGens.value = gens;
    collapsed.value = new Set();
    applyGenerationDepth(genTarget.value);
  } finally {
    loading.value = false;
  }
  await nextTick();
  centerOnFocal();
}

function centerOnFocal() {
  const focal = layout.value.boxes.find(b => b.isFocal);
  if (!focal || !scrollRef.value) return;
  const focalCenterX = (focal.x + focal.w / 2) * zoom.value;
  const viewportW = (scrollRef.value as HTMLElement).clientWidth;
  (scrollRef.value as HTMLElement).scrollLeft = Math.max(0, focalCenterX - viewportW / 2);
}

watch(() => props.personId, load);
onMounted(() => {
  load();
});

defineExpose({ boxes: computed(() => layout.value.boxes) });
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  cursor: grab;
}
.chart-scroll.panning {
  cursor: grabbing;
  user-select: none;
}
.chart-scroll.panning * {
  cursor: grabbing;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }
.person-box.clickable { cursor: pointer; }
.person-box.clickable:hover rect:first-child { opacity: 0.9; }
.collapse-btn { cursor: pointer; }
.collapse-btn:hover circle { opacity: 0.7; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

</style>
