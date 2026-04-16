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
        <line
          v-for="(ln, i) in layout.lines"
          :key="'l' + i"
          :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
          stroke="#ccc" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <g
          v-for="box in layout.boxes"
          :key="box.person.id"
          :data-testid="'person-box-' + box.person.id"
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
          <rect
            :x="box.x" :y="box.y" :width="box.w" :height="box.h"
            rx="4"
            :fill="boxFill(box)"
            :stroke="box.isFocal ? '#1a2a3a' : '#ddd'"
            stroke-width="1"
          />
          <rect
            :x="box.x" :y="box.y"
            width="4" :height="box.h"
            rx="2"
            :fill="sexColor(box.person.sex)"
          />
          <text
            :x="box.x + 12" :y="box.y + 17"
            font-size="12" font-weight="600"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="box.isFocal ? 'white' : '#333'"
          ><tspan
              v-for="(part, pi) in truncateNameParts(fullNameParts(box.person.givenName, box.person.surname, box.person.preferredName, box.person.nickname), 20)"
              :key="pi"
              :text-decoration="part.underline ? 'underline' : undefined"
            >{{ part.text }}</tspan></text>
          <text
            v-if="box.person.birthDate"
            :x="box.x + 12" :y="box.y + 30"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'"
          >* {{ box.person.birthDate }}</text>
          <text
            v-if="box.person.deathDate"
            :x="box.x + 12" :y="box.y + 43"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'"
          >† {{ box.person.deathDate }}</text>
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
        <line
          v-for="(ln, i) in layout.placeholderLines"
          :key="'pl' + i"
          :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
          stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"
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
            fill="transparent" stroke="#94a3b8" stroke-dasharray="4 3" stroke-width="1.5"
          />
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + BOX_H / 2 - 6"
            text-anchor="middle" fill="#94a3b8" font-size="18"
          >+</text>
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + BOX_H / 2 + 12"
            text-anchor="middle" fill="#94a3b8" font-size="11"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout, BOX_W, BOX_H, H_GAP } from '../../utils/chart-layout';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, PedigreeTree, PlaceholderBox } from '../../utils/chart-layout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';
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

// Add popover state
const addPopover = ref<{ personId: string; x: number; y: number } | null>(null);
const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], svgWidth: 995, svgHeight: 1024, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computePedigreeLayout(tree.value, collapsed.value, props.selectedPersonId);
});

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

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#ccc'; }

function boxFill(box: BoxLayout): string {
  if (box.isFocal) return '#2c3e50';
  if (!box.person.living) return '#f8f8f8';
  return 'white';
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

function startAddRelative(mode: 'father' | 'mother' | 'spouse' | 'child') {
  if (!addPopover.value) return;
  const personId = addPopover.value.personId;
  addRelativePersonId.value = personId;
  addRelativeMode.value = mode;
  // Find person data from tree for sex/surname props
  const personData = tree.value?.nodes ? [...tree.value.nodes.values()].find(p => p.id === personId) : undefined;
  addRelativePersonSex.value = (personData?.sex as 'M' | 'F' | 'U') ?? undefined;
  addRelativePersonSurname.value = personData?.surname ?? undefined;
  addPopover.value = null;
  showAddRelative.value = true;
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

function onDocumentMousedown() {
  addPopover.value = null;
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

.add-btn { cursor: pointer; }
.add-btn:hover circle { opacity: 0.8; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

.add-popover {
  position: fixed;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
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
</style>
