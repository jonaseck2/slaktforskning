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
          :data-testid="'person-box-' + box.person.id"
          filter="url(#chart-shadow)"
          :class="['person-box', { clickable: !readonly, focused: focusedBoxId === box.person.id }]"
          :style="{ cursor: readonly ? 'default' : 'pointer' }"
          role="treeitem"
          :aria-label="boxAriaLabel(box)"
          tabindex="0"
          @click="!readonly && $emit('navigate', box.person.id)"
          @mouseenter="(e: MouseEvent) => { hoveredPersonId = box.person.id; tooltipRef?.show(box.person, e.clientX, e.clientY); }"
          @mousemove="(e: MouseEvent) => tooltipRef?.move(e.clientX, e.clientY)"
          @mouseleave="hoveredPersonId = null; tooltipRef?.hide()"
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
          >{{ placeholderLabel(ph.role) }}</text>
        </g>
        </template>
      </svg>
    </div>
    <div v-if="!readonly" class="zoom-controls">
      <button class="zoom-btn" :aria-label="$t('a11y.zoomIn')" @click="zoomIn">+</button>
      <span class="zoom-level" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" :aria-label="$t('a11y.zoomOut')" @click="zoomOut">−</button>
      <button class="zoom-btn" :aria-label="$t('a11y.resetZoom')" @click="resetZoom">↺</button>
    </div>

    <ChartTooltip ref="tooltipRef" />

    <!-- Add related person modal -->
    <AddRelatedPersonModal
      v-if="showAddRelative && addRelativePersonId"
      :person-id="addRelativePersonId"
      :person-sex="addRelativePersonSex"
      :person-surname="addRelativePersonSurname"
      :mode="addRelativeMode"
      @saved="onRelativeSaved"
      @close="showAddRelative = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout, BOX_W, MIN_BOX_H, H_GAP, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, BOX_PAD_Y, PORTRAIT_GAP, TEXT_AREA_W } from '../../utils/chart-layout';
import { wrapName, truncateToWidth } from '../../utils/chart-layout/measure';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, PedigreeTree, PlaceholderBox } from '../../utils/chart-layout';
import { formatFullName } from '../../utils/nameUtils';
import { useChartColors } from '../../composables/useChartColors';
import AddRelatedPersonModal from '../AddRelatedPersonModal.vue';
import ChartTooltip from './ChartTooltip.vue';

const { t } = useI18n();
const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

const props = defineProps<{ personId: string | undefined; focusedPerson?: string | null; readonly?: boolean; selectedPersonId?: string | null }>();
const emit = defineEmits<{ navigate: [id: string]; reload: [] }>();

const loading = ref(true);
const loadingMore = ref(false);
const tree = ref<PedigreeTree | null>(null);
const collapsed = ref(new Set<string>());

// Hover state for ⊕ button
const hoveredPersonId = ref<string | null>(null);

// Focus state for keyboard navigation
const focusedBoxId = ref<string | null>(null);

function boxAriaLabel(box: BoxLayout): string {
  const name = ((box.person.givenName ?? '') + ' ' + (box.person.surname ?? '')).trim();
  const birth = box.person.birthDate ? '* ' + box.person.birthDate : '';
  const death = box.person.deathDate ? '† ' + box.person.deathDate : '';
  return [name || t('common.unknown'), birth, death].filter(Boolean).join(', ');
}

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
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 995, svgHeight: 1024, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computePedigreeLayout(tree.value, collapsed.value, props.selectedPersonId);
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

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-pedigree');

const colors = useChartColors(true);

// Backward-compat alias so template references to chartTokens still work during transition
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
  return box.y + BOX_PAD_Y + 12; // 12px font-size
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

function placeholderLabel(role: string): string {
  const labels: Record<string, string> = {
    father: t('personDetail.addFather'),
    mother: t('personDetail.addMother'),
    spouse: t('personDetail.addSpouse'),
    child: t('personDetail.addChild'),
  };
  return labels[role] ?? role;
}

function startAddFromPlaceholder(ph: PlaceholderBox) {
  const childBox = layout.value.boxes.find((b: BoxLayout) => b.person.id === ph.childPersonId);
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role as 'father' | 'mother' | 'spouse' | 'child';
  addRelativePersonSex.value = childBox?.person.sex ?? 'U';
  addRelativePersonSurname.value = childBox?.person.surname ?? undefined;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  collapsed.value = new Set();
  try {
    tree.value = await fetchPedigreeTree(props.personId);
  } finally {
    loading.value = false;
  }
}

// Sync focused box with parent-controlled focusedPerson prop (screen reader nav)
watch(() => props.focusedPerson, (pid) => {
  if (pid) focusedBoxId.value = pid;
});

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
.person-box:focus { outline: none; }
.person-box.focused > rect:first-child,
.person-box:focus-visible > rect:first-child {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}
.collapse-btn { cursor: pointer; }
.collapse-btn:hover circle { opacity: 0.7; }

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 3px 5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover { background: var(--color-bg-muted); }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: #666;
  min-width: 38px;
  text-align: center;
}

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }
</style>
