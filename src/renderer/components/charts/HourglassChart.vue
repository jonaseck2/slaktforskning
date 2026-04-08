<template>
  <div class="chart-outer">
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollRef" @wheel="onWheel"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
        data-testid="hourglass-svg"
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
          :class="['person-box', 'clickable']"
          @click="$emit('navigate', box.person.id)"
          @mouseenter="(e: MouseEvent) => { hoveredPersonId = box.person.id; tooltipRef?.show(box.person, e.clientX, e.clientY); }"
          @mousemove="(e: MouseEvent) => tooltipRef?.move(e.clientX, e.clientY)"
          @mouseleave="hoveredPersonId = null; tooltipRef?.hide()"
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
            v-if="hoveredPersonId === box.person.id"
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
      </svg>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in (Ctrl+scroll)">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>

    <ChartTooltip ref="tooltipRef" />

    <!-- Add popover -->
    <div
      v-if="addPopover"
      class="add-popover"
      :style="{ left: addPopover.x + 'px', top: addPopover.y + 'px' }"
      @click.stop
      @mousedown.stop
    >
      <button @click="startAddRelative('parent')">{{ $t('personDetail.addParent') }}</button>
      <button @click="startAddRelative('spouse')">{{ $t('personDetail.addSpouse') }}</button>
      <button @click="startAddRelative('child')">{{ $t('personDetail.addChild') }}</button>
    </div>

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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeHourglassLayout, maxDescendantDepth } from '../../utils/chartLayout';
import { fetchHourglassTree, loadAncestorGeneration, loadChildrenForNode } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, HourglassTree } from '../../utils/chartLayout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';
import AddRelatedPersonModal from '../AddRelatedPersonModal.vue';
import ChartTooltip from './ChartTooltip.vue';

useI18n();
const tooltipRef = ref<InstanceType<typeof ChartTooltip> | null>(null);

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string]; reload: [] }>();

const loading = ref(true);
const loadingMore = ref(false);
const tree = ref<HourglassTree | null>(null);
const collapsed = ref(new Set<string>());

// Hover state for ⊕ button
const hoveredPersonId = ref<string | null>(null);

// Add popover state
const addPopover = ref<{ personId: string; x: number; y: number } | null>(null);
const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
const addRelativeMode = ref<'parent' | 'spouse' | 'child'>('parent');

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], svgWidth: 1400, svgHeight: 688, collapseButtons: [] };
  return computeHourglassLayout(tree.value, collapsed.value);
});

// Reverse map: personId → ahnentafel key for the ancestor section
const ancestorPersonToAhnen = computed(() => {
  const m = new Map<string, number>();
  for (const [k, person] of (tree.value?.ancestors.nodes ?? [])) {
    m.set(person.id, k);
  }
  return m;
});

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right', coParentId?: string | null) {
  const key = coParentId !== undefined
    ? `${personId}:${dir}:${coParentId ?? 'solo'}`
    : `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
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
      // Load one ancestor generation
      const ahnNum = ancestorPersonToAhnen.value.get(btn.personId);
      if (ahnNum === undefined) return;
      const newAncestors = await loadAncestorGeneration(tree.value.ancestors, ahnNum);
      tree.value = { ...tree.value, ancestors: newAncestors };
    } else if (btn.direction === 'down') {
      // Load one descendant generation
      const newRoot = await loadChildrenForNode(tree.value.descendantRoot, btn.personId);
      const newDepth = maxDescendantDepth(newRoot);
      tree.value = { ...tree.value, descendantRoot: newRoot, descendantGenerations: newDepth };
    }
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, 'viz-zoom-hourglass');

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

function startAddRelative(mode: 'parent' | 'spouse' | 'child') {
  if (!addPopover.value) return;
  addRelativePersonId.value = addPopover.value.personId;
  addRelativeMode.value = mode;
  addPopover.value = null;
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
    tree.value = await fetchHourglassTree(props.personId);
    // Default: collapse ancestors beyond 2 levels (great-grandparents+).
    const defaultCollapsed = new Set<string>();
    if (tree.value) {
      for (const [k, person] of tree.value.ancestors.nodes) {
        const g = Math.floor(Math.log2(k));
        if (g >= 2) defaultCollapsed.add(`${person.id}:up`);
      }
    }
    collapsed.value = defaultCollapsed;
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
  document.addEventListener('mousedown', onDocumentMousedown);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedown);
});
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
</style>
