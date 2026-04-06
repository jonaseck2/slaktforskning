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
        data-testid="pedigree-svg"
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
          :class="['person-box', { clickable: !box.isFocal }]"
          @click="!box.isFocal && $emit('navigate', box.person.id)"
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
        </g>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout } from '../../utils/chartLayout';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { BoxLayout, CollapseButton, PedigreeTree } from '../../utils/chartLayout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const loadingMore = ref(false);
const tree = ref<PedigreeTree | null>(null);
const collapsed = ref(new Set<string>());

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], svgWidth: 995, svgHeight: 1024, collapseButtons: [] };
  return computePedigreeLayout(tree.value, collapsed.value);
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

watch(() => props.personId, load);
onMounted(load);
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
.zoom-btn:hover { background: #f0f0f0; }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: #666;
  min-width: 38px;
  text-align: center;
}
</style>
