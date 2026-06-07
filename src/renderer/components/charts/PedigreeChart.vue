<template>
  <div class="chart-outer" ref="outerRef">
    <div v-if="loading && tree" class="chart-reload-indicator" aria-live="polite">{{ $t('common.loading') }}</div>
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollRef" @wheel="onWheel"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div v-if="loading && !tree" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-if="tree"
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 ${layout.viewBoxMinY} ${layout.svgWidth} ${layout.svgHeight}`"
        data-testid="pedigree-svg"
        role="tree"
        :aria-label="$t('a11y.pedigreeChart')"
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
          v-memo="[box, props.colorMode, props.readonly, focusedBoxId === box.person.id, addBtnStyle]"
          :data-testid="'person-box-' + box.person.id"
          filter="url(#chart-shadow)"
          :class="['person-box', 'clickable', { focused: focusedBoxId === box.person.id }]"
          :style="{ cursor: 'pointer' }"
          role="treeitem"
          :aria-label="boxAriaLabel(box)"
          tabindex="0"
          @click="$emit('navigate', box.person.id)"
          @keydown="onBoxKeydown($event, box)"
          @focus="focusedBoxId = box.person.id"
          @blur="focusedBoxId = null"
        >
          <!-- Box background -->
          <rect
            :x="box.x" :y="box.y" :width="box.w" :height="box.h"
            rx="6"
            :fill="boxFill(box)"
            :stroke="boxStroke(box)"
            stroke-width="1"
          />
          <!-- Sex indicator bar (3px wide) -->
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
            xml:space="preserve"
          >
            <tspan
              v-for="(line, li) in wrappedName(box)"
              :key="li"
              :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
              :y="nameStartY(box) + li * 16"
            ><tspan
                v-for="(seg, si) in line"
                :key="si"
                :text-decoration="seg.underline ? 'underline' : ''"
              >{{ seg.text }}</tspan></tspan>
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
          <!-- Add-family-member badge — shape from Utseende → Knapp -->
          <g
            v-if="!readonly"
            :class="['add-relative-btn', `add-relative-btn--${addBtnStyle}`]"
            :transform="`translate(${box.x + box.w}, ${box.y})`"
            role="button"
            :aria-label="$t('personDetail.addRelativeLabel')"
            @click.stop="(ev: MouseEvent) => $emit('person-context-menu', { personId: box.person.id, x: ev.clientX, y: ev.clientY })"
          >
            <template v-if="addBtnStyle === 'plus'">
              <circle r="10" />
              <line x1="-5" y1="0" x2="5" y2="0" />
              <line x1="0" y1="-5" x2="0" y2="5" />
            </template>
            <template v-else>
              <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
              <text class="add-relative-leaf-glyph" text-anchor="middle" dominant-baseline="central" font-size="20">🍃</text>
            </template>
          </g>
        </g>
        <g
          v-if="!readonly"
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
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
        <template v-if="!readonly">
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
          :key="'ph-' + ph.role + '-' + ph.childPersonId"
          class="ghost-box"
          tabindex="0"
          role="button"
          :aria-label="placeholderLabel(ph.role)"
          @click="startAddFromPlaceholder(ph)"
          @keydown.enter="startAddFromPlaceholder(ph)"
          @keydown.space.prevent="startAddFromPlaceholder(ph)"
        >
          <rect
            :x="ph.x + BOX_W / 4" :y="ph.y + MIN_BOX_H / 4" :width="BOX_W / 2" :height="MIN_BOX_H / 2"
            rx="6" ry="6"
            fill="transparent" :stroke="chartTokens.placeholderStroke" stroke-dasharray="4 3" stroke-width="1.5"
          />
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 - 2"
            text-anchor="middle" :fill="chartTokens.placeholderText" font-size="14"
          >+</text>
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 + 9"
            text-anchor="middle" :fill="chartTokens.placeholderText" font-size="9"
          >{{ placeholderLabel(ph.role) }}</text>
        </g>
        </template>
      </svg>
    </div>
    <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <span class="zoom-extra-label" :title="$t('chart.tooltip.generationCountAncestors')" :aria-label="$t('chart.tooltip.generationCountAncestors')">{{ $t('reports.generations') }}</span>
      <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationDecreaseAncestors')" :aria-label="$t('chart.tooltip.generationDecreaseAncestors')" @click="decrGens" :disabled="genTarget <= 1">−</button>
      <span class="zoom-extra-value" :title="$t('chart.tooltip.generationCountAncestors')" :aria-label="$t('chart.tooltip.generationCountAncestors')">{{ genTarget }}</span>
      <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationIncreaseAncestors')" :aria-label="$t('chart.tooltip.generationIncreaseAncestors')" @click="incrGens">+</button>
    </ZoomControls>

    <!-- Add related person modal -->
    <PersonModal
      v-if="showAddRelative && addRelativePersonId"
      mode="standalone"
      :add-related-to="{ personId: addRelativePersonId, mode: addRelativeMode, personSex: addRelativePersonSex, personSurname: addRelativePersonSurname }"
      @saved="onRelativeSaved"
      @close="showAddRelative = false"
      @cancel="showAddRelative = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, toRef, inject } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout, BOX_W, MIN_BOX_H, H_GAP, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, PORTRAIT_GAP, ADD_BTN_AREA_W, BOX_PAD_X_RIGHT } from '../../utils/chart-layout';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';
import { useChartBox } from '../../composables/useChartBox';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { STORAGE_KEYS } from '../../utils/storage-keys';
import type { BoxLayout, CollapseButton, PedigreeTree, PlaceholderBox } from '../../utils/chart-layout';
import { useChartColors, applyColorMode } from '../../composables/useChartColors';
import { useEntityData } from '../../composables/useEntityData';
import type { ColorMode } from '../../../api/chart-export';
import PersonModal from '../modals/PersonModal.vue';
import ZoomControls from '../ZoomControls.vue';
import { pedigreeGenerations } from '../../composables/useChartGenerations';

const { t } = useI18n();

const props = defineProps<{ personId: string | undefined; focusedPerson?: string | null; readonly?: boolean; selectedPersonId?: string | null; colorMode?: ColorMode }>();

// Add-family-member badge style — provided by App.vue's appearance-store.
const appearanceStore = inject<{ addBtnStyle: Ref<'plus' | 'leaf'> } | undefined>('appearance-store', undefined);
const addBtnStyle = computed<'plus' | 'leaf'>(() => appearanceStore?.addBtnStyle?.value ?? 'plus');
const emit = defineEmits<{
  navigate: [id: string];
  reload: [];
  'person-context-menu': [payload: { personId: string; x: number; y: number }];
}>();

const loadingMore = ref(false);
const collapsed = ref(new Set<string>());
const genTarget = pedigreeGenerations;
const loadedGens = ref(5);

watch(genTarget, (n) => {
  if (!tree.value) return;
  if (n > loadedGens.value) load();
  else applyGenerationDepth(n);
});

// Focus state for keyboard navigation
const focusedBoxId = ref<string | null>(null);

const PAD = 10;
function generationOf(box: BoxLayout): number {
  return Math.round((box.x - PAD) / (BOX_W + H_GAP));
}

function onBoxKeydown(e: KeyboardEvent, box: BoxLayout) {
  const boxes = layout.value.boxes;
  const idx = boxes.findIndex((b) => b.person.id === box.person.id);
  const gen = generationOf(box);
  let targetIdx = -1;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('navigate', box.person.id);
    return;
  }
  if (e.key === 'ArrowRight') {
    // Next person in higher generation (further ancestor)
    targetIdx = boxes.findIndex((b, i) => i > idx && generationOf(b) === gen + 1);
  } else if (e.key === 'ArrowLeft') {
    // Previous person in lower generation (closer to focal)
    targetIdx = boxes.findIndex((b) => generationOf(b) === gen - 1);
  } else if (e.key === 'ArrowDown') {
    // Next sibling in same generation
    targetIdx = boxes.findIndex((b, i) => i > idx && generationOf(b) === gen);
  } else if (e.key === 'ArrowUp') {
    // Previous sibling in same generation
    for (let i = idx - 1; i >= 0; i--) {
      if (generationOf(boxes[i]) === gen) { targetIdx = i; break; }
    }
  }

  if (targetIdx >= 0) {
    e.preventDefault();
    const targetEl = scrollRef.value?.querySelector(
      `[data-testid="person-box-${boxes[targetIdx].person.id}"]`
    ) as HTMLElement | null;
    targetEl?.focus();
  }
}

const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
const addRelativeMode = ref<AddRelativeMode>('father');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

// Deferred selectedPersonId for layout — same pattern as HourglassChart.
const layoutSelectedId = ref<string | null>(props.selectedPersonId ?? null);
let selectionRaf: number | null = null;
watch(() => props.selectedPersonId, (id) => {
  if (selectionRaf !== null) cancelAnimationFrame(selectionRaf);
  selectionRaf = requestAnimationFrame(() => {
    selectionRaf = null;
    layoutSelectedId.value = id ?? null;
  });
});
onUnmounted(() => { if (selectionRaf !== null) cancelAnimationFrame(selectionRaf); });

const selectedParentInfo = useSelectedParentInfo(toRef(props, 'selectedPersonId'));

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 995, svgHeight: 1024, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computePedigreeLayout(tree.value, collapsed.value, layoutSelectedId.value, selectedParentInfo.value);
});

const solidPaths = computed(() =>
  layout.value.paths.filter(d => !d.startsWith('D:')),
);
const dashedPaths = computed(() =>
  layout.value.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)),
);

// Reverse map: personId → ahnentafel key — needed by handleCollapseButton to call loadAncestorGeneration
const personToAhnen = computed(() => {
  const m = new Map<string, number>();
  for (const [k, person] of (tree.value?.nodes ?? [])) {
    m.set(person.id, k);
  }
  return m;
});

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right') {
  const key = `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function applyGenerationDepthFor(t: PedigreeTree | null, n: number) {
  if (!t) return;
  const next = new Set<string>();
  for (const k of collapsed.value) if (!k.endsWith(':right')) next.add(k);
  for (const [ahn, person] of t.nodes) {
    if (Math.floor(Math.log2(ahn)) === n) next.add(`${person.id}:right`);
  }
  collapsed.value = next;
}

function applyGenerationDepth(n: number) {
  applyGenerationDepthFor(tree.value, n);
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
    toggle(btn.personId, btn.direction);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  const ahnNum = personToAhnen.value.get(btn.personId);
  if (ahnNum === undefined) return;
  loadingMore.value = true;
  try {
    tree.value = await loadAncestorGeneration(tree.value, ahnNum);
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, STORAGE_KEYS.vizZoomPedigree);

const outerRef = ref<HTMLElement | null>(null);
const baseColors = useChartColors(true, outerRef);
const colors = computed(() => applyColorMode(baseColors.value, props.colorMode ?? 'themed'));

// Backward-compat alias so template references to chartTokens still work during transition
const chartTokens = computed(() => ({
  line: colors.value.line,
  placeholderStroke: colors.value.placeholderStroke,
  placeholderText: colors.value.placeholderText,
}));

const colorModeRef = computed<ColorMode>(() => props.colorMode ?? 'themed');
const {
  sexBg,
  boxFill,
  boxStroke,
  nameColor,
  dateColor,
  portraitBg,
  portraitTextColor,
  wrappedName,
  birthText,
  deathText,
  initials,
  nameStartY,
  portraitY,
  birthY,
  deathY,
  placeholderLabel,
  boxAriaLabel,
} = useChartBox({ colors, colorMode: colorModeRef, selectedId: layoutSelectedId });

function startAddFromPlaceholder(ph: PlaceholderBox) {
  const childBox = layout.value.boxes.find((b: BoxLayout) => b.person.id === ph.childPersonId);
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role as AddRelativeMode;
  addRelativePersonSex.value = childBox?.person.sex ?? 'U';
  addRelativePersonSurname.value = childBox?.person.surname ?? undefined;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

// useEntityData drives both the initial load and reload-on-mutation. The
// composable subscribes to onDataChanged and reloads automatically — we no
// longer register a listener ourselves. `keepViewOnNextLoad` lets refetch()
// preserve collapsed state across a reload; same-id reloads default to that
// behaviour too (mutation broadcasts) so the user's view doesn't reset.
let keepViewOnNextLoad = false;
let prevId: string | null = null;
const idRef = computed(() => props.personId ?? null);
const { data: tree, loading, reload } = useEntityData<PedigreeTree | null>(idRef, async (id) => {
  const keepView = keepViewOnNextLoad || id === prevId;
  keepViewOnNextLoad = false;
  prevId = id;
  if (!keepView) collapsed.value = new Set();
  const gens = Math.max(5, genTarget.value);
  const fetched = await fetchPedigreeTree(id, gens);
  loadedGens.value = gens;
  applyGenerationDepthFor(fetched, genTarget.value);
  return fetched;
});

function load() {
  return reload();
}

// Reload data in place without remounting the component. Preserves scroll,
// zoom, and collapse state — used by PersonsView when an unrelated mutation
// fires onDataChanged. Zoom is already preserved automatically by
// useChartZoom, which persists to localStorage.
function refetch() {
  keepViewOnNextLoad = true;
  return reload();
}

// Sync focused box with parent-controlled focusedPerson prop (screen reader nav)
watch(() => props.focusedPerson, (pid) => {
  if (pid) focusedBoxId.value = pid;
});

defineExpose({ boxes: computed(() => layout.value.boxes), refetch });
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
.chart-reload-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  color: var(--text-muted);
  font-size: var(--font-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  pointer-events: none;
  z-index: 20;
  box-shadow: var(--shadow-sm);
}
.person-box.clickable { cursor: pointer; }
.person-box.clickable:hover rect:first-child { opacity: 0.9; }
.person-box:focus { outline: none; }
.person-box.focused > rect:first-child,
.person-box:focus-visible > rect:first-child {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}
.collapse-btn { cursor: pointer; }
.collapse-btn:hover circle { opacity: 0.7; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

.add-relative-btn { cursor: pointer; }
.add-relative-btn circle {
  fill: var(--surface);
  stroke: var(--surface-border);
  stroke-width: 1;
  transition: fill 0.1s, stroke 0.1s;
}
.add-relative-btn line {
  stroke: var(--text-muted);
  stroke-width: 1.6;
  stroke-linecap: round;
  pointer-events: none;
}
.add-relative-btn:hover circle { fill: var(--accent); stroke: var(--accent); }
.add-relative-btn:hover line { stroke: var(--accent-text); }
.add-relative-leaf-glyph {
  pointer-events: none;
  user-select: none;
  transition: transform 0.1s;
}
.add-relative-btn:hover .add-relative-leaf-glyph { transform: scale(1.15); }
</style>
