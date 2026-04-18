<template>
  <div class="chart-outer">
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollRef" @wheel="onWheel"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 ${layout.viewBoxMinY ?? 0} ${layout.svgWidth} ${layout.svgHeight}`"
        data-testid="descendant-svg"
      >
        <line
          v-for="(ln, i) in layout.lines"
          :key="'l' + i"
          :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
          :stroke="chartTokens.line" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <g
          v-for="box in layout.boxes"
          :key="box.person.id"
          :data-testid="'person-box-' + box.person.id"
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
            :x="box.x + BOX_PAD_X_LEFT" :y="box.y + BOX_PAD_Y"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            rx="3"
            :fill="portraitBg(box)"
          />
          <image
            v-if="box.person.photoUrl"
            :href="box.person.photoUrl"
            :x="box.x + BOX_PAD_X_LEFT" :y="box.y + BOX_PAD_Y"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            preserveAspectRatio="xMidYMid slice"
          />
          <text
            v-else
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W / 2"
            :y="box.y + BOX_PAD_Y + PORTRAIT_H / 2"
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
          >* {{ [box.person.birthDate, box.person.birthPlace].filter(Boolean).join(' ') }}</text>
          <!-- Death line -->
          <text
            v-if="box.person.deathDate || box.person.deathPlace"
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
            :y="deathY(box)"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="dateColor(box)"
          >† {{ [box.person.deathDate, box.person.deathPlace].filter(Boolean).join(' ') }}</text>
          <!-- Add button (hovered) -->
          <g
            v-if="!readonly && hoveredPersonId === box.person.id"
            class="add-btn"
            style="cursor: pointer;"
            @click.stop="openAddPopover(box)"
          >
            <circle
              :cx="box.x + box.w - 9" :cy="box.y + box.h - 9"
              r="8"
              fill="white"
              stroke="#2c3e50"
              stroke-width="1.5"
              stroke-dasharray="3 2.5"
            />
            <text
              :x="box.x + box.w - 9" :y="box.y + box.h - 9"
              font-size="13"
              text-anchor="middle"
              dominant-baseline="central"
              fill="#2c3e50"
              style="pointer-events: none; user-select: none;"
            >+</text>
          </g>
        </g>
        <template v-if="!readonly">
          <g
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
            >{{ btn.isExpanded ? '\u25BC' : '\u25BC' }}</text>
          </g>
          <line
            v-for="(ln, i) in layout.placeholderLines"
            :key="'pl' + i"
            :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
            :stroke="chartTokens.placeholderStroke" stroke-width="1" stroke-dasharray="4 3"
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
              :x="ph.x" :y="ph.y" :width="BOX_W" :height="BOX_H"
              rx="6" ry="6"
              fill="transparent" :stroke="chartTokens.placeholderStroke" stroke-dasharray="4 3" stroke-width="1.5"
            />
            <text
              :x="ph.x + BOX_W / 2" :y="ph.y + BOX_H / 2 - 6"
              text-anchor="middle" :fill="chartTokens.placeholderText" font-size="18"
            >+</text>
            <text
              :x="ph.x + BOX_W / 2" :y="ph.y + BOX_H / 2 + 12"
              text-anchor="middle" :fill="chartTokens.placeholderText" font-size="11"
            >{{ placeholderLabel(ph.role) }}</text>
          </g>
        </template>
      </svg>
    </div>
    <div v-if="!readonly" class="zoom-controls">
      <label class="gens-selector">
        <span class="gens-label">Gens</span>
        <select v-model.number="maxGens" class="gens-select">
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <button class="zoom-btn" @click="zoomIn" title="Zoom in (Ctrl+scroll)">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">&#x2212;</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">&#x21BA;</button>
    </div>

    <ChartTooltip ref="tooltipRef" />

    <!-- Add popover -->
    <div
      v-if="!readonly && addPopover"
      class="add-popover"
      :style="{ left: addPopover.x + 'px', top: addPopover.y + 'px' }"
      @click.stop
      @mousedown.stop
    >
      <button @click="startAddRelative('father')">{{ $t('personDetail.addFather') }}</button>
      <button @click="startAddRelative('mother')">{{ $t('personDetail.addMother') }}</button>
      <button @click="startAddRelative('spouse')">{{ $t('personDetail.addSpouse') }}</button>
      <button @click="startAddRelative('child')">{{ $t('personDetail.addChild') }}</button>
    </div>

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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeDescendantLayout, BOX_W, BOX_H, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, BOX_PAD_Y, PORTRAIT_GAP, TEXT_AREA_W } from '../../utils/chart-layout';
import { wrapName } from '../../utils/chart-layout/measure';
import { fetchDescendantTree, loadChildrenForNode } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, DescendantNode, PlaceholderBox } from '../../utils/chart-layout';
import { formatFullName } from '../../utils/nameUtils';
import { useChartColors } from '../../composables/useChartColors';
import AddRelatedPersonModal from '../AddRelatedPersonModal.vue';
import ChartTooltip from './ChartTooltip.vue';

const { t } = useI18n();
const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

const props = defineProps<{ personId: string | undefined; readonly?: boolean; selectedPersonId?: string | null }>();
const emit = defineEmits<{ navigate: [id: string]; reload: [] }>();

const loading = ref(true);
const loadingMore = ref(false);
const tree = ref<DescendantNode | null>(null);
const collapsed = ref(new Set<string>());
const maxGens = ref(4);

// Hover state for add button
const hoveredPersonId = ref<string | null>(null);

// Add popover state
const addPopover = ref<{ personId: string; x: number; y: number } | null>(null);
const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('child');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 800, svgHeight: 400, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computeDescendantLayout(tree.value, maxGens.value, collapsed.value, props.selectedPersonId);
});

function toggle(personId: string) {
  const key = `${personId}:down`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  loadingMore.value = true;
  try {
    tree.value = await loadChildrenForNode(tree.value, btn.personId);
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-descendant');

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

function birthY(box: BoxLayout): number {
  const lines = wrappedName(box);
  return nameStartY(box) + lines.length * 16 + 10;
}

function deathY(box: BoxLayout): number {
  const hasBirth = !!(box.person.birthDate || box.person.birthPlace);
  return birthY(box) + (hasBirth ? 14 : 0);
}

function getPopoverPosition(box: BoxLayout): { x: number; y: number } {
  const svgEl = scrollRef.value?.querySelector('svg');
  if (!svgEl) return { x: 0, y: 0 };
  const rect = svgEl.getBoundingClientRect();
  const x = rect.left + (box.x + box.w - 9) * zoom.value;
  const y = rect.top + (box.y + box.h - 9) * zoom.value;
  return { x, y };
}

function openAddPopover(box: BoxLayout) {
  const pos = getPopoverPosition(box);
  addPopover.value = { personId: box.person.id, x: pos.x, y: pos.y };
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

function startAddRelative(mode: 'father' | 'mother' | 'spouse' | 'child') {
  if (!addPopover.value) return;
  addRelativePersonId.value = addPopover.value.personId;
  addRelativeMode.value = mode;
  addPopover.value = null;
  showAddRelative.value = true;
}

function startAddFromPlaceholder(ph: PlaceholderBox) {
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role as 'father' | 'mother' | 'spouse' | 'child';
  const personBox = layout.value.boxes.find(b => b.person.id === ph.childPersonId);
  addRelativePersonSex.value = (personBox?.person.sex as 'M' | 'F' | 'U') ?? undefined;
  addRelativePersonSurname.value = personBox?.person.surname ?? undefined;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

function onDocumentMousedown() {
  addPopover.value = null;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    tree.value = await fetchDescendantTree(props.personId, 0, maxGens.value);
    collapsed.value = new Set<string>();
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
watch(maxGens, load);
onMounted(() => {
  load();
  document.addEventListener('mousedown', onDocumentMousedown);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedown);
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

.add-btn { cursor: pointer; }
.add-btn:hover circle { opacity: 0.8; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

.add-popover {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 6px;
  display: flex;
  gap: 4px;
  z-index: 1000;
  transform: translateX(-50%);
}
.add-popover button {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.add-popover button:hover { opacity: 0.9; }

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

.gens-selector {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-right: 6px;
  padding-right: 6px;
  border-right: 1px solid #ddd;
}
.gens-label {
  font-size: var(--font-xs);
  color: #666;
}
.gens-select {
  font-size: var(--font-xs);
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 1px 2px;
  background: white;
  cursor: pointer;
}
</style>
